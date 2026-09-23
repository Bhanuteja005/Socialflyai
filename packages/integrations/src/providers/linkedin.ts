import { z } from "zod";
import {
	addDays,
	compact,
	DayAccumulator,
	type DayRange,
	dayStartMs,
	num,
	todayInRange,
	utcDay,
} from "../analytics";
import {
	checkReplyText,
	emptyAuthor,
	finalizeItems,
	MAX_PAGES_PER_POST,
	toIso,
	unsupportedReplyKind,
} from "../engagement";
import { isProviderError, ProviderError } from "../errors";
import { expiresAtFrom, fetchMediaBytes, form, providerFetch, providerJson } from "../http";
import type {
	AccountMetricsDay,
	AnalyticsSupport,
	Capabilities,
	ChannelContext,
	ConnectResult,
	DiscoveredAccount,
	EngagementItem,
	EngagementSupport,
	MediaItem,
	PostMetrics,
	PublishInput,
	PublishOutcome,
	SocialProvider,
	TokenSet,
} from "../types";

/**
 * LinkedIn — personal profiles (`linkedin`) and company pages (`linkedin_page`).
 *
 * Uses the VERSIONED REST API (`/rest/*` + `LinkedIn-Version` header). The old
 * system used the legacy v2 UGC endpoints, which LinkedIn is retiring.
 *
 * Two providers because they need different app products: profile posting needs
 * "Share on LinkedIn" (w_member_social); page posting needs the separately
 * approved Community Management API (w_organization_social + rw_organization_admin).
 * An app without that approval still gets working profile posting.
 *
 * Docs: https://learn.microsoft.com/linkedin/marketing/community-management/shares/posts-api
 */

export type LinkedInConfig = { clientId: string; clientSecret: string; apiVersion: string };

const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const API = "https://api.linkedin.com";

const capabilities: Capabilities = {
	maxTextLength: 3000,
	requiresText: true,
	requiresMedia: false,
	maxImages: 20,
	maxVideos: 1,
	mixedMedia: false,
	imageMimeTypes: ["image/jpeg", "image/png", "image/gif"],
	videoMimeTypes: ["video/mp4"],
	maxImageBytes: 8 * 1024 * 1024,
	maxVideoBytes: 5 * 1024 * 1024 * 1024,
	maxVideoDurationSeconds: 30 * 60,
};

const settingsSchema = z.object({
	visibility: z.enum(["PUBLIC", "CONNECTIONS"]).default("PUBLIC"),
});
type Settings = z.infer<typeof settingsSchema>;

/**
 * LinkedIn "little text" treats these characters as markup; unescaped, a post
 * containing "(" or "#" is truncated or rejected. Escape them all.
 * https://learn.microsoft.com/linkedin/marketing/community-management/shares/little-text-format
 */
export const escapeLittleText = (text: string) =>
	text.replace(/[\\|{}@[\]()<>#*_~]/g, (c) => `\\${c}`);

/**
 * Organization share statistics. The docs name no id cap for `shares=List(...)`;
 * 50 keeps the URL comfortably short.
 * https://learn.microsoft.com/linkedin/marketing/community-management/organizations/share-statistics
 */
const LINKEDIN_STATS_MAX_POSTS = 50;
/** "Returns share data only within the past 12 months, using a rolling 12-month window." */
const LINKEDIN_STATS_WINDOW_DAYS = 365;

type ShareStatistics = {
	impressionCount?: number;
	uniqueImpressionsCount?: number;
	/** Spelled this way in LinkedIn's time-bound sample response; read defensively. */
	uniqueImpressionsCounts?: number;
	clickCount?: number;
	likeCount?: number;
	commentCount?: number;
	shareCount?: number;
};

export function mapLinkedInShareStatistics(s: ShareStatistics): PostMetrics {
	return compact({
		impressions: num(s.impressionCount),
		reach: num(s.uniqueImpressionsCount ?? s.uniqueImpressionsCounts),
		clicks: num(s.clickCount),
		likes: num(s.likeCount),
		comments: num(s.commentCount),
		shares: num(s.shareCount),
	});
}

/**
 * Rest.li 2.0 list parameter: `List(urn%3Ali%3Ashare%3A1,urn%3Ali%3Ashare%3A2)`.
 * The URNs are encoded, the List(...) syntax is not.
 */
export const restliList = (values: string[]) =>
	`List(${values.map((v) => encodeURIComponent(v)).join(",")})`;

type TokenResponse = {
	access_token: string;
	expires_in: number;
	refresh_token?: string;
	refresh_token_expires_in?: number;
	scope?: string;
};

// ---------------------------------------------------------------------------
// OAuth, headers and media uploads (shared with the LinkedIn Ads adapter)
// ---------------------------------------------------------------------------

export const LINKEDIN_API = API;

export const linkedInHeaders = (
	accessToken: string,
	apiVersion: string,
	json = true,
): Record<string, string> => ({
	Authorization: `Bearer ${accessToken}`,
	"LinkedIn-Version": apiVersion,
	"X-Restli-Protocol-Version": "2.0.0",
	...(json ? { "Content-Type": "application/json" } : {}),
});

/** https://learn.microsoft.com/linkedin/shared/authentication/authorization-code-flow */
export function linkedInAuthorizationUrl(
	clientId: string,
	scopes: string[],
	{ redirectUri, state }: { redirectUri: string; state: string },
) {
	const url = new URL(AUTH_URL);
	url.search = form({
		response_type: "code",
		client_id: clientId,
		redirect_uri: redirectUri,
		state,
		scope: scopes.join(" "),
	});
	return { url: url.toString() };
}

export async function requestLinkedInToken(
	provider: string,
	client: { clientId: string; clientSecret: string },
	params: Record<string, string>,
) {
	return providerJson<TokenResponse>(provider, TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: form({
			...params,
			client_id: client.clientId,
			client_secret: client.clientSecret,
		}),
	});
}

export function linkedInTokenSet(t: TokenResponse, requestedScopes: string[]): TokenSet {
	return {
		accessToken: t.access_token,
		refreshToken: t.refresh_token ?? null,
		expiresAt: expiresAtFrom(t.expires_in),
		scopes: t.scope?.split(/[ ,]/).filter(Boolean) ?? requestedScopes,
	};
}

/** Images API: initializeUpload → PUT bytes. Returns the image URN. */
export async function uploadLinkedInImage(
	provider: string,
	apiVersion: string,
	accessToken: string,
	owner: string,
	image: MediaItem,
): Promise<string> {
	const init = await providerJson<{ value: { uploadUrl: string; image: string } }>(
		provider,
		`${API}/rest/images?action=initializeUpload`,
		{
			method: "POST",
			headers: linkedInHeaders(accessToken, apiVersion),
			body: JSON.stringify({ initializeUploadRequest: { owner } }),
		},
	);
	await providerFetch(provider, init.value.uploadUrl, {
		method: "PUT",
		headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": image.mimeType },
		body: await fetchMediaBytes(provider, image.url),
		timeoutMs: 120_000,
	});
	return init.value.image;
}

/** Multi-part upload: LinkedIn hands back byte ranges; each PUT returns an ETag we must echo on finalize. */
export async function uploadLinkedInVideo(
	provider: string,
	apiVersion: string,
	accessToken: string,
	owner: string,
	video: MediaItem,
): Promise<string> {
	const bytes = await fetchMediaBytes(provider, video.url);
	const init = await providerJson<{
		value: {
			video: string;
			uploadToken: string;
			uploadInstructions: { uploadUrl: string; firstByte: number; lastByte: number }[];
		};
	}>(provider, `${API}/rest/videos?action=initializeUpload`, {
		method: "POST",
		headers: linkedInHeaders(accessToken, apiVersion),
		body: JSON.stringify({
			initializeUploadRequest: {
				owner,
				fileSizeBytes: bytes.byteLength,
				uploadCaptions: false,
				uploadThumbnail: false,
			},
		}),
	});

	const partIds: string[] = [];
	for (const part of init.value.uploadInstructions) {
		const res = await providerFetch(provider, part.uploadUrl, {
			method: "PUT",
			headers: { "Content-Type": "application/octet-stream" },
			body: bytes.subarray(part.firstByte, part.lastByte + 1),
			timeoutMs: 300_000,
		});
		const etag = res.headers.get("etag");
		if (!etag)
			throw new ProviderError("transient", provider, "LinkedIn video part upload returned no ETag");
		partIds.push(etag);
	}

	await providerFetch(provider, `${API}/rest/videos?action=finalizeUpload`, {
		method: "POST",
		headers: linkedInHeaders(accessToken, apiVersion),
		body: JSON.stringify({
			finalizeUploadRequest: {
				video: init.value.video,
				uploadToken: init.value.uploadToken,
				uploadedPartIds: partIds,
			},
		}),
	});
	return init.value.video;
}

/**
 * LinkedIn comments are limited to 1,250 characters (product limit; the Comments
 * API reference does not state a number).
 */
const LINKEDIN_MAX_COMMENT_CHARS = 1250;
/** "Setting the page `count` to less than 200 ... to prevent timeouts." */
const LINKEDIN_COMMENTS_PAGE = 100;
/** Posts read per engagement call (one request per post, plus nested threads). */
const LINKEDIN_ENGAGEMENT_MAX_POSTS = 20;
/** Top-level comments per post whose nested replies are fetched per call (a request each). */
const LINKEDIN_MAX_THREAD_EXPANSIONS = 20;

type LinkedInComment = {
	id?: string;
	commentUrn?: string;
	actor?: string;
	object?: string;
	parentComment?: string;
	message?: { text?: string };
	created?: { time?: number };
	commentsSummary?: { aggregatedTotalComments?: number; totalFirstLevelComments?: number };
};

/** The composite comment URN; built from `object` + `id` when the response lacks it. */
const linkedInCommentUrn = (c: LinkedInComment): string | null =>
	c.commentUrn ?? (c.object && c.id ? `urn:li:comment:(${c.object},${c.id})` : null);

/** Comment id — the last element of `urn:li:comment:(<thread>,<id>)`. */
export const linkedInCommentId = (urn: string): string | null =>
	/,\s*([^,()]+)\)\s*$/.exec(urn)?.[1] ?? null;

/**
 * One socialActions comment → inbox item. LinkedIn nests one level deep, so a
 * comment with `parentComment` is a reply to that top-level comment.
 */
export function mapLinkedInComment(
	c: LinkedInComment,
	postUrn: string,
	orgUrn: string,
	parentUrn: string | null = null,
): EngagementItem | null {
	const urn = linkedInCommentUrn(c);
	const createdAt = toIso(c.created?.time);
	if (!urn || !createdAt) return null;
	const parent = c.parentComment ?? parentUrn;
	return {
		externalId: urn,
		kind: parent ? "reply" : "comment",
		postExternalId: postUrn,
		parentExternalId: parent,
		// Only the actor URN is in the comment; names need profile lookups that are
		// restricted for members, so they stay unknown.
		author: { ...emptyAuthor(), externalId: c.actor ?? null },
		fromSelf: c.actor === orgUrn,
		text: c.message?.text ?? "",
		url: `https://www.linkedin.com/feed/update/${postUrn}/?commentUrn=${encodeURIComponent(urn)}`,
		createdAt,
	};
}

/** "no comments" and "post deleted" both come back as 404 on the comments list. */
const isNotFound = (error: unknown) =>
	isProviderError(error) && error.kind === "invalid_request" && error.details.status === 404;

abstract class LinkedInBase implements SocialProvider<Settings> {
	abstract readonly id: "linkedin" | "linkedin_page";
	abstract readonly displayName: string;
	protected abstract readonly scopes: string[];
	readonly capabilities = capabilities;
	readonly settingsSchema = settingsSchema as z.ZodType<Settings>;
	// LinkedIn's app-level daily limits are generous; per-member limit is ~150 posts/day.
	readonly publishRateLimit = { max: 10, durationMs: 60_000 };

	constructor(protected readonly config: LinkedInConfig) {}

	isConfigured() {
		return Boolean(this.config.clientId && this.config.clientSecret);
	}

	protected headers(accessToken: string, json = true): Record<string, string> {
		return linkedInHeaders(accessToken, this.config.apiVersion, json);
	}

	async getAuthorizationUrl({ redirectUri, state }: { redirectUri: string; state: string }) {
		return linkedInAuthorizationUrl(this.config.clientId, this.scopes, { redirectUri, state });
	}

	protected toTokens(t: TokenResponse): TokenSet {
		return linkedInTokenSet(t, this.scopes);
	}

	protected async requestToken(params: Record<string, string>) {
		return requestLinkedInToken(this.id, this.config, params);
	}

	async exchangeCode({
		code,
		redirectUri,
	}: {
		code: string;
		redirectUri: string;
	}): Promise<ConnectResult> {
		const tokens = this.toTokens(
			await this.requestToken({
				grant_type: "authorization_code",
				code,
				redirect_uri: redirectUri,
			}),
		);
		return { tokens, accounts: await this.discoverAccounts(tokens.accessToken) };
	}

	/**
	 * Only apps in LinkedIn's partner programme receive refresh tokens; everyone else
	 * gets a 60-day access token and the user reconnects. `exchangeCode` returns
	 * `refreshToken: null` in that case and the worker never schedules a refresh.
	 */
	async refreshTokens(refreshToken: string): Promise<TokenSet> {
		return this.toTokens(
			await this.requestToken({ grant_type: "refresh_token", refresh_token: refreshToken }),
		);
	}

	protected abstract discoverAccounts(accessToken: string): Promise<DiscoveredAccount[]>;
	protected abstract authorUrn(channel: ChannelContext): string;

	async publish(channel: ChannelContext, input: PublishInput<Settings>): Promise<PublishOutcome> {
		const owner = this.authorUrn(channel);
		const content = await this.uploadMedia(channel, owner, input.media);

		const res = await providerFetch(this.id, `${API}/rest/posts`, {
			method: "POST",
			mutating: true,
			headers: this.headers(channel.accessToken),
			body: JSON.stringify({
				author: owner,
				commentary: escapeLittleText(input.text),
				visibility: input.settings.visibility,
				distribution: {
					feedDistribution: "MAIN_FEED",
					targetEntities: [],
					thirdPartyDistributionChannels: [],
				},
				lifecycleState: "PUBLISHED",
				isReshareDisabledByAuthor: false,
				...(content ? { content } : {}),
			}),
		});

		// The post URN comes back in a header, not the body.
		const urn = res.headers.get("x-restli-id");
		if (!urn) {
			throw new ProviderError(
				"unknown_outcome",
				this.id,
				"LinkedIn accepted the post but returned no id",
			);
		}
		return {
			status: "published",
			externalId: urn,
			url: `https://www.linkedin.com/feed/update/${urn}/`,
		};
	}

	private async uploadMedia(channel: ChannelContext, owner: string, media: MediaItem[]) {
		if (media.length === 0) return undefined;
		const video = media.find((m) => m.kind === "video");
		if (video) {
			return { media: { id: await this.uploadVideo(channel, owner, video) } };
		}
		const ids: string[] = [];
		for (const image of media) ids.push(await this.uploadImage(channel, owner, image));
		const [first] = ids;
		return ids.length === 1 && first
			? { media: { id: first, altText: media[0]?.altText ?? undefined } }
			: {
					multiImage: {
						images: ids.map((id, i) => ({ id, altText: media[i]?.altText ?? undefined })),
					},
				};
	}

	private uploadImage(channel: ChannelContext, owner: string, image: MediaItem) {
		return uploadLinkedInImage(this.id, this.config.apiVersion, channel.accessToken, owner, image);
	}

	private uploadVideo(channel: ChannelContext, owner: string, video: MediaItem) {
		return uploadLinkedInVideo(this.id, this.config.apiVersion, channel.accessToken, owner, video);
	}
}

/**
 * No `analytics` here on purpose: member post analytics need the
 * r_member_postAnalytics scope, which LinkedIn grants only to approved partners
 * (Community Management API for members). See docs/platforms.md → Analytics.
 *
 * No `engagement` either: reading comments on a member's posts needs
 * r_member_social_feed, "granted to select developers only". See
 * docs/platforms.md → Engagement inbox.
 */
export class LinkedInProfileProvider extends LinkedInBase {
	readonly id = "linkedin" as const;
	readonly displayName = "LinkedIn";
	protected readonly scopes = ["openid", "profile", "email", "w_member_social"];

	protected async discoverAccounts(accessToken: string): Promise<DiscoveredAccount[]> {
		const me = await providerJson<{ sub: string; name: string; picture?: string }>(
			this.id,
			`${API}/v2/userinfo`,
			{ headers: { Authorization: `Bearer ${accessToken}` } },
		);
		return [{ externalId: me.sub, name: me.name, avatarUrl: me.picture ?? null }];
	}

	protected authorUrn(channel: ChannelContext) {
		return `urn:li:person:${channel.externalId}`;
	}
}

export class LinkedInPageProvider extends LinkedInBase {
	readonly id = "linkedin_page" as const;
	readonly displayName = "LinkedIn Page";
	protected readonly scopes = [
		"w_organization_social",
		"r_organization_social",
		"rw_organization_admin",
		// Engagement inbox (added in phase 6; pages connected earlier must reconnect):
		// the Comments API is gated on the `_feed` permissions.
		"r_organization_social_feed",
		"w_organization_social_feed",
	];

	/** Every organization the member administers; the user picks which to connect. */
	protected async discoverAccounts(accessToken: string): Promise<DiscoveredAccount[]> {
		const acls = await providerJson<{ elements: { organization: string }[] }>(
			this.id,
			`${API}/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED`,
			{ headers: this.headers(accessToken, false) },
		);
		return Promise.all(
			acls.elements.map(async ({ organization }) => {
				const id = organization.split(":").pop() ?? organization;
				const org = await providerJson<{ localizedName: string; vanityName?: string }>(
					this.id,
					`${API}/rest/organizations/${id}`,
					{ headers: this.headers(accessToken, false) },
				);
				return {
					externalId: id,
					name: org.localizedName,
					username: org.vanityName ?? null,
					profileUrl: org.vanityName ? `https://www.linkedin.com/company/${org.vanityName}` : null,
				};
			}),
		);
	}

	protected authorUrn(channel: ChannelContext) {
		return `urn:li:organization:${channel.externalId}`;
	}

	/**
	 * Comments on the organization's posts and replies as the organization.
	 * The Comments API names the `_feed` permissions (part of the Community
	 * Management API product we already use): r_organization_social_feed to read,
	 * w_organization_social_feed to comment. Both are NEW scopes — pages connected
	 * earlier must reconnect. No mentions or listening: LinkedIn has no API for either.
	 * https://learn.microsoft.com/linkedin/marketing/community-management/shares/comments-api
	 */
	readonly engagement: EngagementSupport = {
		requiredScopes: {
			read: ["r_organization_social_feed"],
			reply: ["w_organization_social_feed"],
		},
		maxPostsPerCall: LINKEDIN_ENGAGEMENT_MAX_POSTS,
		maxReplyLength: LINKEDIN_MAX_COMMENT_CHARS,
		listComments: (channel, input) => this.listComments(channel, input),
		reply: (channel, input) => this.replyToComment(channel, input),
	};

	/** start/count pagination of one socialActions comments collection, bounded. */
	private async commentPages(channel: ChannelContext, targetUrn: string) {
		const out: LinkedInComment[] = [];
		for (let page = 0, start = 0; page < MAX_PAGES_PER_POST; page++) {
			const res = await providerJson<{
				elements?: LinkedInComment[];
				paging?: { start?: number; count?: number; total?: number };
			}>(
				this.id,
				`${API}/rest/socialActions/${encodeURIComponent(targetUrn)}/comments?${form({
					start: String(start),
					count: String(LINKEDIN_COMMENTS_PAGE),
				})}`,
				{ headers: this.headers(channel.accessToken, false) },
			);
			const rows = res.elements ?? [];
			out.push(...rows);
			start += rows.length;
			const total = res.paging?.total;
			if (rows.length < LINKEDIN_COMMENTS_PAGE || (total !== undefined && start >= total)) break;
		}
		return out;
	}

	/**
	 * First-level comments per post, then the nested ones of each comment that
	 * has any (a request per thread, bounded). LinkedIn documents no order, so
	 * `since` is a filter, never a reason to stop early.
	 * https://learn.microsoft.com/linkedin/marketing/community-management/shares/network-update-social-actions
	 */
	private async listComments(
		channel: ChannelContext,
		input: { postExternalIds: string[]; since: string | null },
	): Promise<EngagementItem[]> {
		const org = this.authorUrn(channel);
		const items: (EngagementItem | null)[] = [];
		for (const postUrn of input.postExternalIds) {
			let top: LinkedInComment[];
			try {
				top = await this.commentPages(channel, postUrn);
			} catch (error) {
				// 404 = no comments yet, or the post is gone.
				if (isNotFound(error)) continue;
				throw error;
			}
			let expansions = 0;
			for (const c of top) {
				items.push(mapLinkedInComment(c, postUrn, org));
				const urn = linkedInCommentUrn(c);
				const nested =
					c.commentsSummary?.aggregatedTotalComments ??
					c.commentsSummary?.totalFirstLevelComments ??
					0;
				if (!urn || nested <= 0 || expansions >= LINKEDIN_MAX_THREAD_EXPANSIONS) continue;
				expansions++;
				try {
					for (const r of await this.commentPages(channel, urn)) {
						items.push(mapLinkedInComment(r, postUrn, org, urn));
					}
				} catch (error) {
					if (isNotFound(error)) continue;
					throw error;
				}
			}
		}
		return finalizeItems(
			items.filter((i) => i !== null),
			input.since,
		);
	}

	/**
	 * Comments as the organization (actor = organization URN) under the target
	 * comment. LinkedIn nests one level deep: answering a nested reply goes to its
	 * top-level comment, looked up first (a read — safe to retry). Comment text is
	 * plain text + attributes, not "little text", so it is not escaped.
	 * https://learn.microsoft.com/linkedin/marketing/community-management/shares/comments-api
	 */
	private async replyToComment(
		channel: ChannelContext,
		input: {
			toExternalId: string;
			kind: EngagementItem["kind"];
			postExternalId: string | null;
			text: string;
		},
	): Promise<{ externalId: string; url: string | null }> {
		if (input.kind === "mention") unsupportedReplyKind(this.id, input.kind);
		const postUrn = input.postExternalId;
		if (!postUrn) {
			throw new ProviderError("invalid_request", this.id, "LinkedIn replies need the post id");
		}
		const text = checkReplyText(this.id, input.text, LINKEDIN_MAX_COMMENT_CHARS);
		const parent =
			input.kind === "reply"
				? await this.topLevelComment(channel, postUrn, input.toExternalId)
				: input.toExternalId;

		const res = await providerFetch(
			this.id,
			`${API}/rest/socialActions/${encodeURIComponent(parent)}/comments`,
			{
				method: "POST",
				mutating: true,
				headers: this.headers(channel.accessToken),
				body: JSON.stringify({
					actor: this.authorUrn(channel),
					object: postUrn,
					message: { text },
					parentComment: parent,
				}),
			},
		);
		// The post exists now: a body we cannot parse must not turn success into an error.
		const body = (await res.json().catch(() => ({}))) as LinkedInComment;
		const id = res.headers.get("x-restli-id") ?? body.id;
		const urn = body.commentUrn ?? (id ? `urn:li:comment:(${body.object ?? postUrn},${id})` : null);
		if (!urn) {
			throw new ProviderError(
				"unknown_outcome",
				this.id,
				"LinkedIn accepted the comment but returned no id",
			);
		}
		return {
			externalId: urn,
			url: `https://www.linkedin.com/feed/update/${postUrn}/?commentUrn=${encodeURIComponent(urn)}`,
		};
	}

	/** The top-level comment a nested comment belongs to; the comment itself if it is top-level. */
	private async topLevelComment(
		channel: ChannelContext,
		postUrn: string,
		commentUrn: string,
	): Promise<string> {
		const id = linkedInCommentId(commentUrn);
		if (!id) return commentUrn;
		try {
			const c = await providerJson<LinkedInComment>(
				this.id,
				`${API}/rest/socialActions/${encodeURIComponent(postUrn)}/comments/${encodeURIComponent(id)}`,
				{ headers: this.headers(channel.accessToken, false) },
			);
			return c.parentComment ?? commentUrn;
		} catch (error) {
			// Could not resolve (e.g. LinkedIn only serves nested comments under their
			// parent): answer the comment itself and let LinkedIn thread it.
			if (isNotFound(error)) return commentUrn;
			throw error;
		}
	}

	/** Organic statistics via rw_organization_admin, already requested. */
	readonly analytics: AnalyticsSupport = {
		maxPostsPerCall: LINKEDIN_STATS_MAX_POSTS,
		getPostMetrics: (channel, ids) => this.getPostMetrics(channel, ids),
		getAccountMetrics: (channel, range) => this.getAccountMetrics(channel, range),
	};

	/**
	 * Lifetime statistics for specific posts. The Posts API hands back either a
	 * `urn:li:share:` or a `urn:li:ugcPost:` id, which go in different parameters.
	 *
	 * LinkedIn leaves out posts "with no actions or impressions" and says they
	 * "can be assumed to have counts of 0", so those get explicit zeros — LinkedIn's
	 * own statement, not an invented value. The flip side: a deleted post, or one
	 * older than the 12-month statistics window, is indistinguishable and also
	 * reads as zeros. Callers should stop polling posts older than a year.
	 * https://learn.microsoft.com/linkedin/marketing/community-management/organizations/share-statistics
	 */
	private async getPostMetrics(
		channel: ChannelContext,
		ids: string[],
	): Promise<Record<string, PostMetrics>> {
		const shares = ids.filter((id) => id.startsWith("urn:li:share:"));
		const ugcPosts = ids.filter((id) => id.startsWith("urn:li:ugcPost:"));
		if (shares.length === 0 && ugcPosts.length === 0) return {};

		const params = [
			"q=organizationalEntity",
			`organizationalEntity=${encodeURIComponent(this.authorUrn(channel))}`,
			...(shares.length ? [`shares=${restliList(shares)}`] : []),
			...(ugcPosts.length ? [`ugcPosts=${restliList(ugcPosts)}`] : []),
		];
		const res = await providerJson<{
			elements?: { share?: string; ugcPost?: string; totalShareStatistics?: ShareStatistics }[];
		}>(this.id, `${API}/rest/organizationalEntityShareStatistics?${params.join("&")}`, {
			headers: this.headers(channel.accessToken, false),
		});

		const zero = mapLinkedInShareStatistics({
			impressionCount: 0,
			uniqueImpressionsCount: 0,
			clickCount: 0,
			likeCount: 0,
			commentCount: 0,
			shareCount: 0,
		});
		const out: Record<string, PostMetrics> = {};
		for (const id of [...shares, ...ugcPosts]) out[id] = { ...zero };
		for (const el of res.elements ?? []) {
			const id = el.share ?? el.ugcPost;
			if (id && id in out) out[id] = mapLinkedInShareStatistics(el.totalShareStatistics ?? {});
		}
		return out;
	}

	/**
	 * Daily organic impressions/reach of the page's posts (time-bound share
	 * statistics, DAY granularity, clamped to the 12-month window) plus today's
	 * follower count from networkSizes. LinkedIn days are UTC midnight-aligned.
	 * https://learn.microsoft.com/linkedin/marketing/community-management/organizations/share-statistics
	 * https://learn.microsoft.com/linkedin/marketing/community-management/organizations/organization-lookup-api
	 */
	private async getAccountMetrics(
		channel: ChannelContext,
		range: DayRange,
	): Promise<AccountMetricsDay[]> {
		const days = new DayAccumulator(range);
		const org = encodeURIComponent(this.authorUrn(channel));
		const oldest = addDays(utcDay(new Date()), -(LINKEDIN_STATS_WINDOW_DAYS - 1));
		const since = range.since < oldest ? oldest : range.since;

		if (since <= range.until) {
			const start = dayStartMs(since);
			const end = dayStartMs(addDays(range.until, 1));
			// Rest.li 2.0 object syntax, encoded as in LinkedIn's own sample request.
			const intervals = `(timeRange:(start:${start},end:${end}),timeGranularityType:DAY)`
				.replaceAll(":", "%3A")
				.replaceAll(",", "%2C");
			const res = await providerJson<{
				elements?: { timeRange?: { start?: number }; totalShareStatistics?: ShareStatistics }[];
			}>(
				this.id,
				`${API}/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${org}&timeIntervals=${intervals}`,
				{ headers: this.headers(channel.accessToken, false) },
			);
			for (const el of res.elements ?? []) {
				if (el.timeRange?.start === undefined) continue;
				const stats = mapLinkedInShareStatistics(el.totalShareStatistics ?? {});
				days.set(utcDay(new Date(el.timeRange.start)), {
					impressions: stats.impressions,
					reach: stats.reach,
				});
			}
		}

		const today = todayInRange(range);
		if (today) {
			const size = await providerJson<{ firstDegreeSize?: number }>(
				this.id,
				`${API}/rest/networkSizes/${this.authorUrn(channel)}?${form({ edgeType: "COMPANY_FOLLOWED_BY_MEMBER" })}`,
				{ headers: this.headers(channel.accessToken, false) },
			);
			days.set(today, { followers: num(size.firstDegreeSize) });
		}
		return days.result();
	}
}
