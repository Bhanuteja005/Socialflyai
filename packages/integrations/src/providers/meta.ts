import { z } from "zod";
import {
	addDays,
	chunk,
	compact,
	DayAccumulator,
	type DayRange,
	dayStartSeconds,
	mapLimit,
	metaEndTimeToDay,
	num,
	splitRange,
	todayInRange,
} from "../analytics";
import {
	checkReplyText,
	finalizeItems,
	isNewer,
	MAX_PAGES_PER_POST,
	toIso,
	unsupportedReplyKind,
} from "../engagement";
import { isProviderError, ProviderError } from "../errors";
import { expiresAtFrom, form, providerJson } from "../http";
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
 * Meta — Facebook Pages (`facebook`) and Instagram professional accounts
 * (`instagram`), both through Facebook Login and the Graph API.
 *
 * Instagram here is the "Instagram API with Facebook Login": the IG account must
 * be a business/creator account linked to a Page, and we publish with that Page's
 * access token. (The newer "Instagram API with Instagram Login" is a different
 * product with different hosts and scopes.)
 *
 * Also home of the helpers Threads shares with them: the Graph error classifier
 * and the container → poll → publish state machine.
 *
 * Docs: https://developers.facebook.com/docs/graph-api
 */

export type MetaConfig = { appId: string; appSecret: string; graphVersion: string };

const DIALOG_HOST = "https://www.facebook.com";
export const GRAPH_HOST = "https://graph.facebook.com";

// ---------------------------------------------------------------------------
// Shared Graph helpers (also used by threads.ts)
// ---------------------------------------------------------------------------

type GraphErrorBody = {
	error?: {
		message?: string;
		type?: string;
		code?: number;
		error_subcode?: number;
		is_transient?: boolean;
		error_user_msg?: string;
	};
};

/**
 * Throttling codes: 4 app-level, 17 user-level, 32 page-level, 613 custom rate
 * limit, 80001-80014 Business Use Case limits.
 * https://developers.facebook.com/docs/graph-api/overview/rate-limiting
 */
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);
const isBucCode = (code: number) => code >= 80_001 && code <= 80_014;
/** Meta's rate windows roll over an hour; retrying sooner than a few minutes just burns quota. */
const META_RATE_LIMIT_RETRY_MS = 15 * 60_000;

/**
 * Maps a Graph API error body to our taxonomy. Used as the `classify` hook of
 * every Graph call (graph.facebook.com and graph.threads.net share the format).
 * Returns undefined to fall back to the default HTTP-status mapping.
 *
 * https://developers.facebook.com/docs/graph-api/guides/error-handling
 */
export function classifyMetaError(
	provider: string,
	status: number,
	body: string,
	mutating = false,
): ProviderError | undefined {
	let parsed: GraphErrorBody;
	try {
		parsed = JSON.parse(body) as GraphErrorBody;
	} catch {
		return undefined;
	}
	const err = parsed.error;
	if (!err || typeof err.code !== "number") return undefined;

	const code = err.code;
	const message = err.error_user_msg ?? err.message ?? `Graph error ${code}`;
	const details = {
		status,
		body,
		platformCode: err.error_subcode ? `${code}/${err.error_subcode}` : String(code),
	};

	// 190: token expired/invalidated (password change, app removed). 102: session
	// invalid. 10 and 200-299: a permission was not granted or was revoked.
	if (code === 190 || code === 102 || code === 10 || (code >= 200 && code <= 299)) {
		return new ProviderError("auth", provider, message, details);
	}
	if (RATE_LIMIT_CODES.has(code) || isBucCode(code)) {
		return new ProviderError("rate_limited", provider, message, {
			...details,
			retryAfterMs: META_RATE_LIMIT_RETRY_MS,
		});
	}
	// 368: "temporarily blocked for policies violations" — retrying won't help.
	if (code === 368) return new ProviderError("invalid_request", provider, message, details);
	// 9007 (IG/Threads media_publish): "media is not ready". Meta refused the publish,
	// so nothing is visible and a later retry is safe even on the mutating call.
	if (code === 9007) return new ProviderError("transient", provider, message, details);
	// 1/2 and is_transient: Meta's own "try again later". On a create call we cannot
	// know whether it landed, so it must stay ambiguous.
	if (err.is_transient || code === 1 || code === 2) {
		return new ProviderError(
			mutating ? "unknown_outcome" : "transient",
			provider,
			message,
			details,
		);
	}
	if (status >= 500) {
		return new ProviderError(
			mutating ? "unknown_outcome" : "transient",
			provider,
			message,
			details,
		);
	}
	return new ProviderError("invalid_request", provider, message, details);
}

export const graphHeaders = (accessToken: string, json = true): Record<string, string> => ({
	Authorization: `Bearer ${accessToken}`,
	...(json ? { "Content-Type": "application/json" } : {}),
});

type Paged<T> = { data: T[]; paging?: { next?: string } };

/** Follows Graph cursor pagination (`paging.next` already carries the cursor). */
async function graphPages<T>(
	provider: string,
	firstUrl: string,
	accessToken: string,
): Promise<T[]> {
	const out: T[] = [];
	let next: string | undefined = firstUrl;
	// A user rarely manages hundreds of pages; the cap stops a runaway loop.
	for (let page = 0; next && page < 20; page++) {
		const res: Paged<T> = await providerJson<Paged<T>>(provider, next, {
			headers: graphHeaders(accessToken, false),
			classify: (s, b) => classifyMetaError(provider, s, b),
		});
		out.push(...res.data);
		next = res.paging?.next;
	}
	return out;
}

/**
 * Cursor pagination for engagement reads, bounded to `maxPages`. `stop` sees each
 * page and ends the walk early — used where Meta documents newest-first order,
 * so the first page reaching back past `since` means the rest is older still.
 */
export async function graphPagesBounded<T>(
	provider: string,
	firstUrl: string,
	accessToken: string,
	opts: { maxPages?: number; classify?: Classify; stop?: (page: T[]) => boolean } = {},
): Promise<T[]> {
	const classify: Classify = opts.classify ?? ((s, b) => classifyMetaError(provider, s, b));
	const out: T[] = [];
	let next: string | undefined = firstUrl;
	for (let page = 0; next && page < (opts.maxPages ?? MAX_PAGES_PER_POST); page++) {
		const res: Paged<T> = await providerJson<Paged<T>>(provider, next, {
			headers: graphHeaders(accessToken, false),
			classify,
		});
		const rows = res.data ?? [];
		out.push(...rows);
		if (opts.stop?.(rows)) break;
		next = res.paging?.next;
	}
	return out;
}

/** True when the page holds something at or before `since` (newest-first listings only). */
export const reachedSince =
	<T>(since: string | null, createdAt: (row: T) => string | undefined) =>
	(page: T[]): boolean =>
		since !== null &&
		page.some((row) => {
			const iso = toIso(createdAt(row));
			return iso !== null && !isNewer(iso, since);
		});

/** Posts read per engagement call and how many are read in parallel. */
export const META_ENGAGEMENT_MAX_POSTS = 25;
export const META_ENGAGEMENT_CONCURRENCY = 4;

// ---------------------------------------------------------------------------
// Read-only analytics helpers (also used by threads.ts)
// ---------------------------------------------------------------------------

/**
 * Graph caps a multiple-ID read (`?ids=a,b,c`) at 50 ids.
 * https://developers.facebook.com/docs/apps/upgrading (v2.x notes: "limited to requesting only 50 IDs")
 */
export const GRAPH_MAX_IDS = 50;

/**
 * "Object does not exist" as Graph reports it for a deleted post/media: 100/33
 * on a single-object read, 803 ("some of the aliases you requested do not
 * exist") on a multiple-ID read.
 */
export const isMissingGraphObject = (error: unknown): boolean =>
	isProviderError(error) &&
	error.kind === "invalid_request" &&
	(error.details.platformCode === "100/33" || error.details.platformCode === "803");

export type Classify = (status: number, body: string) => ProviderError | undefined;

/**
 * Reads `fields` for many Graph objects with as few requests as possible.
 *
 * A multiple-ID read fails as a whole if ANY id is gone (a deleted post), so on
 * a content-level rejection we fall back to one read per id and drop the ids
 * Graph says no longer exist. With `skipRejected`, any other per-id rejection
 * also just drops that id (used for insights, which Meta refuses per media for
 * reasons that say nothing about the others, e.g. "not enough viewers").
 */
export async function graphObjects<T>(
	provider: string,
	graphBase: string,
	ids: string[],
	fields: string,
	accessToken: string,
	opts: { classify?: Classify; skipRejected?: boolean } = {},
): Promise<Record<string, T>> {
	const classify: Classify = opts.classify ?? ((s, b) => classifyMetaError(provider, s, b));
	const get = <R>(url: string) =>
		providerJson<R>(provider, url, { headers: graphHeaders(accessToken, false), classify });

	const out: Record<string, T> = {};
	for (const batch of chunk(ids, GRAPH_MAX_IDS)) {
		if (batch.length > 1) {
			try {
				Object.assign(
					out,
					await get<Record<string, T>>(`${graphBase}/?${form({ ids: batch.join(","), fields })}`),
				);
				continue;
			} catch (error) {
				if (!(isProviderError(error) && error.kind === "invalid_request")) throw error;
			}
		}
		for (const id of batch) {
			try {
				out[id] = await get<T>(`${graphBase}/${encodeURIComponent(id)}?${form({ fields })}`);
			} catch (error) {
				if (isMissingGraphObject(error)) continue;
				if (opts.skipRejected && isProviderError(error) && error.kind === "invalid_request") {
					continue;
				}
				throw error;
			}
		}
	}
	return out;
}

/** One entry of an `insights` edge. Lifetime metrics use `values[0]`, newer ones `total_value`. */
export type InsightEntry = {
	name: string;
	period?: string;
	values?: { value?: unknown; end_time?: string }[];
	total_value?: { value?: unknown };
};

/** name → number for lifetime/total insights; non-numeric (breakdown) values are ignored. */
export function insightTotals(entries: InsightEntry[] | undefined): Record<string, number> {
	const out: Record<string, number> = {};
	for (const e of entries ?? []) {
		const value = num(e.total_value?.value ?? e.values?.[0]?.value);
		if (value !== undefined) out[e.name] = value;
	}
	return out;
}

/** Feeds a daily insight series (values[].end_time) into the accumulator under `key`. */
export function collectDailySeries(
	days: DayAccumulator,
	entry: InsightEntry,
	key: keyof Omit<AccountMetricsDay, "date">,
) {
	for (const v of entry.values ?? []) {
		const value = num(v.value);
		if (value === undefined || !v.end_time) continue;
		days.set(metaEndTimeToDay(v.end_time), { [key]: value });
	}
}

// ---------------------------------------------------------------------------
// Container flow (Instagram + Threads)
// ---------------------------------------------------------------------------

/**
 * Where a container-based post is between `publish` and `checkStatus` calls.
 * Stored by the worker as `pendingData`, so it must stay JSON-serialisable.
 *
 *  - `childIds` without `containerId`: carousel children still processing; the
 *    parent can only be created once every child is FINISHED.
 *  - `containerId`: the container to publish once it is FINISHED.
 */
export const containerPendingSchema = z.object({
	containerId: z.string().optional(),
	childIds: z.array(z.string()).optional(),
	text: z.string().optional(),
	/** Extra fields for the carousel parent (e.g. Threads `reply_control`). */
	parentParams: z.record(z.string(), z.string()).optional(),
});
export type ContainerPending = z.infer<typeof containerPendingSchema>;

export type ContainerState = { state: "pending" | "ready" | "failed"; message?: string };

export type ContainerApi = {
	provider: string;
	status(containerId: string): Promise<ContainerState>;
	createCarousel(childIds: string[], text: string, extra: Record<string, string>): Promise<string>;
	publish(containerId: string): Promise<PublishOutcome>;
	pollAfterMs: number;
};

export function parseContainerPending(
	provider: string,
	data: Record<string, unknown>,
): ContainerPending {
	const parsed = containerPendingSchema.safeParse(data);
	if (!parsed.success || (!parsed.data.containerId && !parsed.data.childIds?.length)) {
		throw new ProviderError("invalid_request", provider, "Malformed pending publish data");
	}
	return parsed.data;
}

/**
 * Moves a container post one step forward. Creating containers is invisible to
 * followers (not mutating); only `api.publish` makes the post visible.
 */
export async function advanceContainers(
	api: ContainerApi,
	pending: ContainerPending,
): Promise<PublishOutcome> {
	const failed = (state: ContainerState) =>
		new ProviderError(
			"invalid_request",
			api.provider,
			`Media processing failed${state.message ? `: ${state.message}` : ""}`,
		);
	const processing = (next: ContainerPending): PublishOutcome => ({
		status: "processing",
		pendingData: next,
		pollAfterMs: api.pollAfterMs,
	});

	let containerId = pending.containerId;
	if (!containerId) {
		const childIds = pending.childIds ?? [];
		const states = await Promise.all(childIds.map((id) => api.status(id)));
		const bad = states.find((s) => s.state === "failed");
		if (bad) throw failed(bad);
		if (states.some((s) => s.state === "pending")) return processing(pending);
		containerId = await api.createCarousel(
			childIds,
			pending.text ?? "",
			pending.parentParams ?? {},
		);
	}

	const state = await api.status(containerId);
	if (state.state === "failed") throw failed(state);
	if (state.state === "pending") return processing({ containerId });
	return api.publish(containerId);
}

/** Maps the status strings IG (`status_code`) and Threads (`status`) report. */
export function toContainerState(status: string | undefined, message?: string): ContainerState {
	switch (status) {
		case "FINISHED":
		case "PUBLISHED":
			return { state: "ready" };
		case "ERROR":
		case "EXPIRED":
			return { state: "failed", message: message ?? status };
		default:
			// IN_PROGRESS, or a status Meta added later: keep polling rather than fail.
			return { state: "pending" };
	}
}

// ---------------------------------------------------------------------------
// OAuth shared by Facebook and Instagram
// ---------------------------------------------------------------------------

type TokenResponse = { access_token: string; token_type?: string; expires_in?: number };

/**
 * Facebook Login dialog URL. Shared with the Meta ads adapter, which uses the same
 * app with the ads permissions.
 * https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow
 */
export function metaAuthorizationUrl(
	config: MetaConfig,
	scopes: string[],
	{ redirectUri, state }: { redirectUri: string; state: string },
) {
	const url = new URL(`${DIALOG_HOST}/${config.graphVersion}/dialog/oauth`);
	url.search = form({
		client_id: config.appId,
		redirect_uri: redirectUri,
		state,
		response_type: "code",
		scope: scopes.join(","),
	});
	return { url: url.toString() };
}

/**
 * Code → short-lived user token (~1-2h) → long-lived user token (~60 days).
 * Page tokens derived from the LONG-lived user token do not expire, which is
 * why the exchange matters even though we publish with page tokens.
 * https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived
 */
export async function exchangeMetaCode(
	provider: string,
	config: MetaConfig,
	scopes: string[],
	{ code, redirectUri }: { code: string; redirectUri: string },
): Promise<TokenSet> {
	const graph = `${GRAPH_HOST}/${config.graphVersion}`;
	const classify = (s: number, b: string) => classifyMetaError(provider, s, b);
	const short = await providerJson<TokenResponse>(
		provider,
		`${graph}/oauth/access_token?${form({
			client_id: config.appId,
			client_secret: config.appSecret,
			redirect_uri: redirectUri,
			code,
		})}`,
		{ classify },
	);
	const long = await providerJson<TokenResponse>(
		provider,
		`${graph}/oauth/access_token?${form({
			grant_type: "fb_exchange_token",
			client_id: config.appId,
			client_secret: config.appSecret,
			fb_exchange_token: short.access_token,
		})}`,
		{ classify },
	);
	return {
		accessToken: long.access_token,
		// Facebook Login has no refresh token: a long-lived user token can only be
		// re-obtained by the user logging in again.
		refreshToken: null,
		expiresAt: expiresAtFrom(long.expires_in),
		scopes,
	};
}

type PageRow = {
	id: string;
	name: string;
	access_token?: string;
	tasks?: string[];
	link?: string;
	picture?: { data?: { url?: string } };
	instagram_business_account?: {
		id: string;
		username?: string;
		name?: string;
		profile_picture_url?: string;
	};
};

abstract class MetaBase<TSettings extends Record<string, unknown>>
	implements SocialProvider<TSettings>
{
	abstract readonly id: "facebook" | "instagram";
	abstract readonly displayName: string;
	abstract readonly capabilities: Capabilities;
	abstract readonly settingsSchema: z.ZodType<TSettings>;
	abstract readonly publishRateLimit: { max: number; durationMs: number };
	protected abstract readonly scopes: string[];

	constructor(protected readonly config: MetaConfig) {}

	protected get graph() {
		return `${GRAPH_HOST}/${this.config.graphVersion}`;
	}

	isConfigured() {
		return Boolean(this.config.appId && this.config.appSecret && this.config.graphVersion);
	}

	protected classify(mutating = false) {
		return (status: number, body: string) => classifyMetaError(this.id, status, body, mutating);
	}

	async getAuthorizationUrl({ redirectUri, state }: { redirectUri: string; state: string }) {
		return metaAuthorizationUrl(this.config, this.scopes, { redirectUri, state });
	}

	async exchangeCode({
		code,
		redirectUri,
	}: {
		code: string;
		redirectUri: string;
	}): Promise<ConnectResult> {
		const tokens = await exchangeMetaCode(this.id, this.config, this.scopes, { code, redirectUri });
		return { tokens, accounts: await this.discoverAccounts(tokens.accessToken) };
	}

	/** Page tokens from a long-lived user token never expire and cannot be refreshed. */
	protected pageTokens(pageToken: string): TokenSet {
		return { accessToken: pageToken, refreshToken: null, expiresAt: null, scopes: this.scopes };
	}

	protected async listPages(userToken: string, fields: string): Promise<PageRow[]> {
		return graphPages<PageRow>(
			this.id,
			`${this.graph}/me/accounts?${form({ fields, limit: "100" })}`,
			userToken,
		);
	}

	protected abstract discoverAccounts(userToken: string): Promise<DiscoveredAccount[]>;
	abstract publish(
		channel: ChannelContext,
		input: PublishInput<TSettings>,
	): Promise<PublishOutcome>;
}

// ---------------------------------------------------------------------------
// Facebook Pages
// ---------------------------------------------------------------------------

const facebookCapabilities: Capabilities = {
	// https://developers.facebook.com/docs/graph-api/reference/page/feed/ (message limit 63,206)
	maxTextLength: 63_206,
	requiresText: false,
	requiresMedia: false,
	// attached_media has no documented hard cap; the composer UI tops out around 10
	// and larger sets start failing intermittently, so we stay there.
	maxImages: 10,
	maxVideos: 1,
	mixedMedia: false,
	// https://developers.facebook.com/docs/graph-api/reference/page/photos/
	imageMimeTypes: ["image/jpeg", "image/png", "image/gif"],
	videoMimeTypes: ["video/mp4", "video/quicktime"],
	maxImageBytes: 10 * 1024 * 1024,
	// Non-resumable (file_url) uploads are limited to 1 GB / 20 minutes.
	// https://developers.facebook.com/docs/video-api/guides/publishing
	maxVideoBytes: 1024 * 1024 * 1024,
	maxVideoDurationSeconds: 20 * 60,
};

/** "Only 90 days of insights can be viewed at one time." (insights reference) */
const FACEBOOK_INSIGHTS_MAX_DAYS = 90;

/**
 * Facebook's comment box stops at 8,000 characters. Not stated on the Graph
 * reference; long-standing product limit, so treat it as a ceiling, not a promise.
 */
const FACEBOOK_MAX_COMMENT_CHARS = 8000;

type FacebookComment = {
	id: string;
	message?: string;
	created_time?: string;
	from?: { id?: string; name?: string; picture?: { data?: { url?: string } } };
	parent?: { id?: string };
	permalink_url?: string;
};

const FACEBOOK_COMMENT_FIELDS =
	"id,message,created_time,from{id,name,picture},parent{id},permalink_url";

/**
 * One Graph comment → inbox item. `from` is only returned with
 * pages_read_user_content; without it the author stays unknown (never guessed).
 */
export function mapFacebookComment(
	c: FacebookComment,
	postExternalId: string,
	pageId: string,
): EngagementItem | null {
	const createdAt = toIso(c.created_time);
	if (!createdAt) return null;
	const parent = c.parent?.id ?? null;
	return {
		externalId: c.id,
		kind: parent ? "reply" : "comment",
		postExternalId,
		parentExternalId: parent,
		author: {
			externalId: c.from?.id ?? null,
			name: c.from?.name ?? null,
			handle: null,
			avatarUrl: c.from?.picture?.data?.url ?? null,
			profileUrl: c.from?.id ? `https://www.facebook.com/${c.from.id}` : null,
		},
		fromSelf: c.from?.id === pageId,
		text: c.message ?? "",
		url: c.permalink_url ?? null,
		createdAt,
	};
}

const facebookSettingsSchema = z.object({});
type FacebookSettings = z.infer<typeof facebookSettingsSchema>;

export class FacebookProvider extends MetaBase<FacebookSettings> {
	readonly id = "facebook" as const;
	readonly displayName = "Facebook";
	readonly capabilities = facebookCapabilities;
	readonly settingsSchema = facebookSettingsSchema as z.ZodType<FacebookSettings>;
	// Pages have their own BUC limits; this app-wide cap keeps us far below them.
	readonly publishRateLimit = { max: 10, durationMs: 60_000 };
	protected readonly scopes = [
		"pages_show_list",
		"pages_read_engagement",
		"pages_manage_posts",
		"pages_manage_metadata",
		"read_insights",
		"business_management",
		// Engagement inbox (added in phase 6; channels connected earlier must reconnect):
		// reading comments and who wrote them, and answering as the Page.
		"pages_read_user_content",
		"pages_manage_engagement",
	];

	/**
	 * Comments on the Page's posts (all levels) and replies as the Page.
	 * Reading needs pages_read_engagement + pages_read_user_content (the latter
	 * for the commenter's identity); replying needs pages_manage_engagement and a
	 * Page token of someone with the MODERATE task.
	 * https://developers.facebook.com/docs/graph-api/reference/object/comments/
	 */
	readonly engagement: EngagementSupport = {
		requiredScopes: {
			read: ["pages_read_engagement", "pages_read_user_content"],
			reply: ["pages_manage_engagement"],
		},
		maxPostsPerCall: META_ENGAGEMENT_MAX_POSTS,
		maxReplyLength: FACEBOOK_MAX_COMMENT_CHARS,
		listComments: (channel, input) => this.listComments(channel, input),
		reply: (channel, input) => this.replyToComment(channel, input),
	};

	/**
	 * `filter=stream` returns comments of every level (replies carry `parent`),
	 * `order=reverse_chronological` newest first — so once a page reaches back past
	 * `since` the walk stops. Works for `{page}_{post}` ids and bare video ids alike.
	 * https://developers.facebook.com/docs/graph-api/reference/object/comments/
	 */
	private async listComments(
		channel: ChannelContext,
		input: { postExternalIds: string[]; since: string | null },
	): Promise<EngagementItem[]> {
		const perPost = await mapLimit(
			input.postExternalIds,
			META_ENGAGEMENT_CONCURRENCY,
			async (postId) => {
				try {
					const rows = await graphPagesBounded<FacebookComment>(
						this.id,
						`${this.graph}/${encodeURIComponent(postId)}/comments?${form({
							filter: "stream",
							order: "reverse_chronological",
							limit: "100",
							fields: FACEBOOK_COMMENT_FIELDS,
						})}`,
						channel.accessToken,
						{ stop: reachedSince<FacebookComment>(input.since, (c) => c.created_time) },
					);
					return rows.map((c) => mapFacebookComment(c, postId, channel.externalId));
				} catch (error) {
					// Deleted post: skipped, as the contract asks.
					if (isMissingGraphObject(error)) return [];
					throw error;
				}
			},
		);
		return finalizeItems(
			perPost.flat().filter((i) => i !== null),
			input.since,
		);
	}

	/**
	 * POST /{comment-id}/comments answers a comment as the Page. Facebook threads
	 * are one level deep, so answering a reply goes to its top-level comment
	 * (looked up first — a read, safe to retry). `fields` uses Graph's
	 * read-after-write to get the permalink in the same call.
	 * https://developers.facebook.com/docs/graph-api/reference/object/comments/
	 */
	private async replyToComment(
		channel: ChannelContext,
		input: { toExternalId: string; kind: EngagementItem["kind"]; text: string },
	): Promise<{ externalId: string; url: string | null }> {
		if (input.kind === "mention") unsupportedReplyKind(this.id, input.kind);
		const message = checkReplyText(this.id, input.text, FACEBOOK_MAX_COMMENT_CHARS);
		let target = input.toExternalId;
		if (input.kind === "reply") {
			const comment = await providerJson<{ parent?: { id?: string } }>(
				this.id,
				`${this.graph}/${encodeURIComponent(target)}?${form({ fields: "parent{id}" })}`,
				{ headers: graphHeaders(channel.accessToken, false), classify: this.classify() },
			);
			target = comment.parent?.id ?? target;
		}
		const res = await providerJson<{ id?: string; permalink_url?: string }>(
			this.id,
			`${this.graph}/${encodeURIComponent(target)}/comments?${form({ fields: "id,permalink_url" })}`,
			{
				method: "POST",
				mutating: true,
				headers: graphHeaders(channel.accessToken),
				body: JSON.stringify({ message }),
				classify: this.classify(true),
			},
		);
		if (!res.id) {
			throw new ProviderError(
				"unknown_outcome",
				this.id,
				"Facebook accepted the reply but returned no id",
			);
		}
		return { externalId: res.id, url: res.permalink_url ?? null };
	}

	/**
	 * Uses read_insights + pages_read_engagement, both already requested.
	 * Metric names follow the November 2025 Page Insights change: `impressions`
	 * metrics were replaced by `media_view` ("views") ones and `page_fans` by
	 * `page_follows`; `*_impressions_unique` is deprecated above v25.
	 * https://developers.facebook.com/blog/post/2025/08/15/page-insights-api-updates/
	 * https://developers.facebook.com/docs/graph-api/reference/insights
	 */
	readonly analytics: AnalyticsSupport = {
		maxPostsPerCall: GRAPH_MAX_IDS,
		getPostMetrics: (channel, ids) => this.getPostMetrics(channel, ids),
		getAccountMetrics: (channel, range) => this.getAccountMetrics(channel, range),
	};

	/**
	 * publish() returns `{page}_{post}` ids for feed/photo posts and a bare VIDEO id
	 * for videos. Post insights only exist on the post; for videos we read the
	 * reaction/comment counts (video insights need pages_manage_engagement, which
	 * only channels reconnected since the engagement inbox hold — not read yet).
	 * https://developers.facebook.com/docs/graph-api/reference/post/
	 */
	private async getPostMetrics(
		channel: ChannelContext,
		ids: string[],
	): Promise<Record<string, PostMetrics>> {
		type Counted = { summary?: { total_count?: number } };
		type Row = {
			insights?: { data?: InsightEntry[] };
			reactions?: Counted;
			comments?: Counted;
			shares?: { count?: number };
		};
		const counts = "reactions.limit(0).summary(total_count),comments.limit(0).summary(total_count)";
		const posts = await graphObjects<Row>(
			this.id,
			this.graph,
			ids.filter((id) => id.includes("_")),
			`insights.metric(post_media_view,post_total_media_view_unique,post_clicks),${counts},shares`,
			channel.accessToken,
		);
		const objects = await graphObjects<Row>(
			this.id,
			this.graph,
			ids.filter((id) => !id.includes("_")),
			counts,
			channel.accessToken,
		);

		const out: Record<string, PostMetrics> = {};
		for (const [id, row] of Object.entries(posts)) {
			const insights = insightTotals(row.insights?.data);
			out[id] = compact({
				impressions: insights.post_media_view,
				reach: insights.post_total_media_view_unique,
				clicks: insights.post_clicks,
				likes: num(row.reactions?.summary?.total_count),
				comments: num(row.comments?.summary?.total_count),
				// Graph omits `shares` on a post nobody shared; since we asked for it on a
				// post that exists, absence is Graph's way of saying 0 — not "unknown".
				shares: num(row.shares?.count) ?? 0,
			});
		}
		for (const [id, row] of Object.entries(objects)) {
			out[id] = compact({
				likes: num(row.reactions?.summary?.total_count),
				comments: num(row.comments?.summary?.total_count),
			});
		}
		return out;
	}

	/**
	 * Daily Page insights. Graph returns at most 90 days per request, so wider
	 * ranges are split. `until` is exclusive on Meta's side, hence the +1 day.
	 * https://developers.facebook.com/docs/graph-api/reference/insights
	 */
	private async getAccountMetrics(
		channel: ChannelContext,
		range: DayRange,
	): Promise<AccountMetricsDay[]> {
		const days = new DayAccumulator(range);
		const keys: Record<string, keyof Omit<AccountMetricsDay, "date">> = {
			page_follows: "followers",
			page_media_view: "impressions",
			page_total_media_view_unique: "reach",
			page_views_total: "profileViews",
		};
		for (const part of splitRange(range, FACEBOOK_INSIGHTS_MAX_DAYS)) {
			const res = await providerJson<{ data?: InsightEntry[] }>(
				this.id,
				`${this.graph}/${channel.externalId}/insights?${form({
					metric: Object.keys(keys).join(","),
					period: "day",
					since: String(dayStartSeconds(part.since)),
					until: String(dayStartSeconds(addDays(part.until, 1))),
				})}`,
				{ headers: graphHeaders(channel.accessToken, false), classify: this.classify() },
			);
			for (const entry of res.data ?? []) {
				const key = keys[entry.name];
				if (key && (entry.period ?? "day") === "day") collectDailySeries(days, entry, key);
			}
		}
		return days.result();
	}

	protected async discoverAccounts(userToken: string): Promise<DiscoveredAccount[]> {
		const pages = await this.listPages(userToken, "id,name,access_token,tasks,link,picture{url}");
		return (
			pages
				// Without CREATE_CONTENT the page token cannot post (e.g. analyst role).
				.filter((p) => p.access_token && (!p.tasks || p.tasks.includes("CREATE_CONTENT")))
				.map((p) => ({
					externalId: p.id,
					name: p.name,
					avatarUrl: p.picture?.data?.url ?? null,
					profileUrl: p.link ?? `https://www.facebook.com/${p.id}`,
					tokens: this.pageTokens(p.access_token ?? ""),
				}))
		);
	}

	async publish(
		channel: ChannelContext,
		input: PublishInput<FacebookSettings>,
	): Promise<PublishOutcome> {
		const page = channel.externalId;
		const images = input.media.filter((m) => m.kind === "image");
		const video = input.media.find((m) => m.kind === "video");

		if (video) {
			// Facebook downloads file_url itself before answering, hence the long timeout.
			// https://developers.facebook.com/docs/graph-api/reference/page/videos/
			const res = await this.post<{ id: string }>(
				channel,
				`${page}/videos`,
				{ file_url: video.url, description: input.text },
				{ mutating: true, timeoutMs: 300_000 },
			);
			// The id is accepted and addressable immediately; encoding continues on
			// Facebook's side without changing whether the post exists.
			return { status: "published", externalId: res.id, url: `https://www.facebook.com/${res.id}` };
		}

		const [single] = images;
		if (images.length === 1 && single) {
			const res = await this.post<{ id: string; post_id?: string }>(
				channel,
				`${page}/photos`,
				{
					url: single.url,
					caption: input.text,
					...(single.altText ? { alt_text_custom: single.altText } : {}),
				},
				{ mutating: true },
			);
			const id = res.post_id ?? res.id;
			return { status: "published", externalId: id, url: `https://www.facebook.com/${id}` };
		}

		// Multi-photo: unpublished photos are invisible until attached, so uploading
		// them is not mutating; only the /feed call creates the visible post.
		// https://developers.facebook.com/docs/graph-api/reference/page/photos/#multi
		const attached: { media_fbid: string }[] = [];
		for (const image of images) {
			const photo = await this.post<{ id: string }>(channel, `${page}/photos`, {
				url: image.url,
				published: false,
				...(image.altText ? { alt_text_custom: image.altText } : {}),
			});
			attached.push({ media_fbid: photo.id });
		}

		const res = await this.post<{ id: string }>(
			channel,
			`${page}/feed`,
			{ message: input.text, ...(attached.length ? { attached_media: attached } : {}) },
			{ mutating: true },
		);
		return { status: "published", externalId: res.id, url: `https://www.facebook.com/${res.id}` };
	}

	private post<T>(
		channel: ChannelContext,
		path: string,
		body: Record<string, unknown>,
		opts: { mutating?: boolean; timeoutMs?: number } = {},
	): Promise<T> {
		return providerJson<T>(this.id, `${this.graph}/${path}`, {
			method: "POST",
			headers: graphHeaders(channel.accessToken),
			body: JSON.stringify(body),
			mutating: opts.mutating ?? false,
			timeoutMs: opts.timeoutMs,
			classify: this.classify(opts.mutating),
		});
	}
}

// ---------------------------------------------------------------------------
// Instagram
// ---------------------------------------------------------------------------

/**
 * https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media
 * (caption 2,200 chars, carousel up to 10 items, JPEG only, image 8 MB, reels up to 1 GB / 15 min).
 */
const instagramCapabilities: Capabilities = {
	maxTextLength: 2200,
	requiresText: false,
	requiresMedia: true,
	maxImages: 10,
	maxVideos: 10,
	mixedMedia: true,
	imageMimeTypes: ["image/jpeg"],
	videoMimeTypes: ["video/mp4", "video/quicktime"],
	maxImageBytes: 8 * 1024 * 1024,
	maxVideoBytes: 1024 * 1024 * 1024,
	maxVideoDurationSeconds: 15 * 60,
};

/**
 * Instagram rejects user-insights requests spanning more than 30 days. Not stated
 * on the current reference page; long-standing API behaviour, so we stay under it.
 */
const INSTAGRAM_INSIGHTS_MAX_DAYS = 30;

/** Metric set per media product type: every metric must apply to every media in one request. */
export function instagramInsightMetrics(productType: string | undefined): string {
	// Stories report reach/views/shares but not saves.
	return productType === "STORY" ? "reach,views,shares" : "reach,views,saved,shares";
}

/**
 * Instagram's comment limit is 2,200 characters (the caption limit). Not on the
 * comments reference itself; product limit, treated as a ceiling.
 */
const INSTAGRAM_MAX_COMMENT_CHARS = 2200;
/** "Returns a maximum of 50 comments per query." (IG Media comments reference) */
const INSTAGRAM_COMMENTS_PAGE = 50;

type InstagramComment = {
	id: string;
	text?: string;
	timestamp?: string;
	username?: string;
	from?: { id?: string; username?: string };
	parent_id?: string;
	replies?: { data?: InstagramComment[] };
};

const IG_COMMENT_FIELDS = "id,text,timestamp,username,from{id,username},parent_id";

/** One IG comment → inbox item. `parentId` is the top-level comment when nested under it. */
export function mapInstagramComment(
	c: InstagramComment,
	postExternalId: string,
	igUserId: string,
	parentId: string | null = null,
): EngagementItem | null {
	const createdAt = toIso(c.timestamp);
	if (!createdAt) return null;
	const parent = c.parent_id ?? parentId;
	const handle = c.from?.username ?? c.username ?? null;
	return {
		externalId: c.id,
		kind: parent ? "reply" : "comment",
		postExternalId,
		parentExternalId: parent,
		author: {
			externalId: c.from?.id ?? null,
			name: null,
			handle,
			avatarUrl: null,
			profileUrl: handle ? `https://www.instagram.com/${handle}/` : null,
		},
		fromSelf: c.from?.id === igUserId,
		text: c.text ?? "",
		// IG comments have no permalink of their own.
		url: null,
		createdAt,
	};
}

const instagramSettingsSchema = z.object({
	postType: z.enum(["feed", "reel", "story"]).default("feed"),
});
type InstagramSettings = z.infer<typeof instagramSettingsSchema>;

/** Feed images must sit between 4:5 (portrait) and 1.91:1 (landscape). */
export const IG_MIN_ASPECT = 4 / 5;
export const IG_MAX_ASPECT = 1.91;
const IG_MAX_HASHTAGS = 30;

/** Checks feed/carousel image aspect ratios where dimensions are known. */
export function instagramAspectRatioErrors(media: MediaItem[]): string[] {
	const errors: string[] = [];
	media.forEach((m, i) => {
		if (m.kind !== "image" || !m.width || !m.height) return;
		const ratio = m.width / m.height;
		if (ratio < IG_MIN_ASPECT || ratio > IG_MAX_ASPECT) {
			errors.push(
				`Instagram image ${i + 1} is ${m.width}×${m.height}; feed images must be between 4:5 and 1.91:1`,
			);
		}
	});
	return errors;
}

export function validateInstagram(input: PublishInput<InstagramSettings>): string[] {
	const errors: string[] = [];
	const { postType } = input.settings;
	const videos = input.media.filter((m) => m.kind === "video");

	if (postType === "reel" && (input.media.length !== 1 || videos.length !== 1)) {
		errors.push("Instagram reels need exactly one video");
	}
	if (postType === "story" && input.media.length !== 1) {
		errors.push("Instagram stories take exactly one image or video");
	}
	// Stories and reels are shown full-screen and cropped by Instagram; the ratio
	// rule only applies to feed posts and carousels.
	if (postType === "feed") errors.push(...instagramAspectRatioErrors(input.media));

	const hashtags = input.text.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0;
	if (hashtags > IG_MAX_HASHTAGS) {
		errors.push(`Instagram allows at most ${IG_MAX_HASHTAGS} hashtags (this post has ${hashtags})`);
	}
	return errors;
}

export class InstagramProvider extends MetaBase<InstagramSettings> {
	readonly id = "instagram" as const;
	readonly displayName = "Instagram";
	readonly capabilities = instagramCapabilities;
	readonly settingsSchema = instagramSettingsSchema as z.ZodType<InstagramSettings>;
	// Hard platform cap is 100 API-published posts per account per 24h; this is app-wide pacing.
	// https://developers.facebook.com/docs/instagram-platform/content-publishing#rate-limit
	readonly publishRateLimit = { max: 5, durationMs: 60_000 };
	protected readonly scopes = [
		"instagram_basic",
		"instagram_content_publish",
		"instagram_manage_insights",
		"instagram_manage_comments",
		"pages_show_list",
		"pages_read_engagement",
		"business_management",
	];

	validate(input: PublishInput<InstagramSettings>): string[] {
		return validateInstagram(input);
	}

	/**
	 * Comments and their replies on our media; replies as the account. All
	 * scopes were already requested (instagram_manage_comments since phase 1).
	 *
	 * No `listMentions`: caption/comment @mentions of the account are delivered
	 * only through the `mentions` webhook (the ids it carries are what
	 * /{ig-user}/mentions answers), and the `/tags` edge lists photo tags, which
	 * are not something we can reply to through the documented API.
	 * https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-media/comments
	 */
	readonly engagement: EngagementSupport = {
		requiredScopes: {
			read: ["instagram_basic", "instagram_manage_comments", "pages_read_engagement"],
			reply: ["instagram_manage_comments"],
		},
		maxPostsPerCall: META_ENGAGEMENT_MAX_POSTS,
		maxReplyLength: INSTAGRAM_MAX_COMMENT_CHARS,
		listComments: (channel, input) => this.listComments(channel, input),
		reply: (channel, input) => this.replyToComment(channel, input),
	};

	/**
	 * Top-level comments with replies expanded inline (`replies.limit(50){…}`),
	 * up to 50 per page and MAX_PAGES_PER_POST pages. Meta documents no order for
	 * this edge, so we never stop early on `since` — we filter instead.
	 * `username`/`from` need instagram_manage_comments (since 2024-08-27).
	 * https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-comment
	 */
	private async listComments(
		channel: ChannelContext,
		input: { postExternalIds: string[]; since: string | null },
	): Promise<EngagementItem[]> {
		const perPost = await mapLimit(
			input.postExternalIds,
			META_ENGAGEMENT_CONCURRENCY,
			async (mediaId) => {
				try {
					const rows = await graphPagesBounded<InstagramComment>(
						this.id,
						`${this.graph}/${encodeURIComponent(mediaId)}/comments?${form({
							fields: `${IG_COMMENT_FIELDS},replies.limit(${INSTAGRAM_COMMENTS_PAGE}){${IG_COMMENT_FIELDS}}`,
							limit: String(INSTAGRAM_COMMENTS_PAGE),
						})}`,
						channel.accessToken,
					);
					return rows.flatMap((c) => [
						mapInstagramComment(c, mediaId, channel.externalId),
						...(c.replies?.data ?? []).map((r) =>
							mapInstagramComment(r, mediaId, channel.externalId, c.id),
						),
					]);
				} catch (error) {
					if (isMissingGraphObject(error)) return [];
					throw error;
				}
			},
		);
		return finalizeItems(
			perPost.flat().filter((i) => i !== null),
			input.since,
		);
	}

	/**
	 * POST /{ig-comment-id}/replies. Instagram threads are one level deep and a
	 * reply to a reply is attached to its top-level comment by Instagram itself.
	 * https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-comment/replies
	 */
	private async replyToComment(
		channel: ChannelContext,
		input: { toExternalId: string; kind: EngagementItem["kind"]; text: string },
	): Promise<{ externalId: string; url: string | null }> {
		if (input.kind === "mention") unsupportedReplyKind(this.id, input.kind);
		const message = checkReplyText(this.id, input.text, INSTAGRAM_MAX_COMMENT_CHARS);
		const res = await providerJson<{ id?: string }>(
			this.id,
			`${this.graph}/${encodeURIComponent(input.toExternalId)}/replies`,
			{
				method: "POST",
				mutating: true,
				headers: graphHeaders(channel.accessToken),
				body: JSON.stringify({ message }),
				classify: this.classify(true),
			},
		);
		if (!res.id) {
			throw new ProviderError(
				"unknown_outcome",
				this.id,
				"Instagram accepted the reply but returned no id",
			);
		}
		return { externalId: res.id, url: null };
	}

	/** Uses instagram_basic + instagram_manage_insights + pages_read_engagement, already requested. */
	readonly analytics: AnalyticsSupport = {
		maxPostsPerCall: GRAPH_MAX_IDS,
		getPostMetrics: (channel, ids) => this.getPostMetrics(channel, ids),
		getAccountMetrics: (channel, range) => this.getAccountMetrics(channel, range),
	};

	/**
	 * Counts from the media fields (one multiple-ID read), then insights grouped
	 * by media type, because Graph rejects the whole request if one metric does
	 * not apply to one media (stories have no `saved`). `impressions`, `plays` and
	 * `video_views` are deprecated (v22, April 2025) in favour of `views`.
	 * https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights
	 */
	private async getPostMetrics(
		channel: ChannelContext,
		ids: string[],
	): Promise<Record<string, PostMetrics>> {
		type Media = { media_product_type?: string; like_count?: number; comments_count?: number };
		const media = await graphObjects<Media>(
			this.id,
			this.graph,
			ids,
			"media_product_type,like_count,comments_count",
			channel.accessToken,
		);

		const groups = new Map<string, string[]>();
		for (const [id, m] of Object.entries(media)) {
			const metrics = instagramInsightMetrics(m.media_product_type);
			groups.set(metrics, [...(groups.get(metrics) ?? []), id]);
		}
		const insights: Record<string, Record<string, number>> = {};
		for (const [metrics, groupIds] of groups) {
			const rows = await graphObjects<{ insights?: { data?: InsightEntry[] } }>(
				this.id,
				this.graph,
				groupIds,
				`insights.metric(${metrics})`,
				channel.accessToken,
				// A media Meta will not report on (too few viewers, posted before the
				// business conversion) keeps its like/comment counts, just no insights.
				{ classify: this.insightsClassify, skipRejected: true },
			);
			for (const [id, row] of Object.entries(rows))
				insights[id] = insightTotals(row.insights?.data);
		}

		const out: Record<string, PostMetrics> = {};
		for (const [id, m] of Object.entries(media)) {
			const i = insights[id] ?? {};
			out[id] = compact({
				likes: num(m.like_count),
				comments: num(m.comments_count),
				reach: i.reach,
				// `views` replaced `impressions`: times the media was displayed or played.
				impressions: i.views,
				// For reels a view IS a play — the closest thing IG still reports to video views.
				videoViews: m.media_product_type === "REELS" ? i.views : undefined,
				saves: i.saved,
				shares: i.shares,
			});
		}
		return out;
	}

	/**
	 * Code 10 normally means a missing permission (→ auth), but IG also uses it
	 * for "Not enough viewers for the media to show insights", which concerns that
	 * one media and must not push the channel into needs_reauth.
	 */
	private insightsClassify: Classify = (status, body) => {
		const err = classifyMetaError(this.id, status, body);
		if (err?.kind === "auth" && err.details.platformCode === "10" && /viewers/i.test(err.message)) {
			return new ProviderError("invalid_request", this.id, err.message, err.details);
		}
		return err;
	};

	/**
	 * Daily `reach` (time series, requested in ≤30-day windows) plus the current
	 * `followers_count` for today. The `follower_count` insight counts NEW followers
	 * per day, not a total, and `profile_views` is no longer in the documented
	 * metric list, so neither is used.
	 * https://developers.facebook.com/docs/instagram-platform/api-reference/instagram-user/insights
	 * https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user
	 */
	private async getAccountMetrics(
		channel: ChannelContext,
		range: DayRange,
	): Promise<AccountMetricsDay[]> {
		const days = new DayAccumulator(range);
		for (const part of splitRange(range, INSTAGRAM_INSIGHTS_MAX_DAYS)) {
			const res = await providerJson<{ data?: InsightEntry[] }>(
				this.id,
				`${this.graph}/${channel.externalId}/insights?${form({
					metric: "reach",
					period: "day",
					metric_type: "time_series",
					since: String(dayStartSeconds(part.since)),
					until: String(dayStartSeconds(addDays(part.until, 1))),
				})}`,
				{ headers: graphHeaders(channel.accessToken, false), classify: this.classify() },
			);
			for (const entry of res.data ?? []) {
				if (entry.name === "reach") collectDailySeries(days, entry, "reach");
			}
		}
		const today = todayInRange(range);
		if (today) {
			const user = await providerJson<{ followers_count?: number }>(
				this.id,
				`${this.graph}/${channel.externalId}?fields=followers_count`,
				{ headers: graphHeaders(channel.accessToken, false), classify: this.classify() },
			);
			days.set(today, { followers: num(user.followers_count) });
		}
		return days.result();
	}

	protected async discoverAccounts(userToken: string): Promise<DiscoveredAccount[]> {
		const pages = await this.listPages(
			userToken,
			"id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}",
		);
		const accounts: DiscoveredAccount[] = [];
		for (const page of pages) {
			const ig = page.instagram_business_account;
			if (!ig || !page.access_token) continue;
			accounts.push({
				externalId: ig.id,
				name: ig.name ?? ig.username ?? page.name,
				username: ig.username ?? null,
				avatarUrl: ig.profile_picture_url ?? null,
				profileUrl: ig.username ? `https://www.instagram.com/${ig.username}/` : null,
				tokens: this.pageTokens(page.access_token),
				metadata: { pageId: page.id, pageName: page.name },
			});
		}
		return accounts;
	}

	/**
	 * Content publishing: create container(s) → wait until FINISHED → media_publish.
	 * https://developers.facebook.com/docs/instagram-platform/content-publishing
	 */
	async publish(
		channel: ChannelContext,
		input: PublishInput<InstagramSettings>,
	): Promise<PublishOutcome> {
		const { postType } = input.settings;
		const [first] = input.media;
		if (!first)
			throw new ProviderError("invalid_request", this.id, "Instagram posts need an image or video");
		const hasVideo = input.media.some((m) => m.kind === "video");

		let pending: ContainerPending;
		if (postType === "story") {
			pending = {
				containerId: await this.createContainer(channel, {
					media_type: "STORIES",
					...(first.kind === "video" ? { video_url: first.url } : { image_url: first.url }),
				}),
			};
		} else if (postType === "reel" || (input.media.length === 1 && first.kind === "video")) {
			// Single feed videos are published as reels: media_type=VIDEO is deprecated
			// for feed posts and only valid for carousel children.
			pending = {
				containerId: await this.createContainer(channel, {
					media_type: "REELS",
					video_url: first.url,
					caption: input.text,
					share_to_feed: true,
				}),
			};
		} else if (input.media.length === 1) {
			pending = {
				containerId: await this.createContainer(channel, {
					image_url: first.url,
					caption: input.text,
				}),
			};
		} else {
			const childIds: string[] = [];
			for (const m of input.media) {
				childIds.push(
					await this.createContainer(
						channel,
						m.kind === "video"
							? { media_type: "VIDEO", video_url: m.url, is_carousel_item: true }
							: { image_url: m.url, is_carousel_item: true },
					),
				);
			}
			pending = { childIds, text: input.text };
		}

		// Videos take seconds to minutes to process: hand back to the worker rather
		// than block. Image containers are usually FINISHED at once.
		if (hasVideo) return { status: "processing", pendingData: pending, pollAfterMs: 10_000 };
		return advanceContainers(this.containerApi(channel), pending);
	}

	async checkStatus(
		channel: ChannelContext,
		pendingData: Record<string, unknown>,
	): Promise<PublishOutcome> {
		return advanceContainers(
			this.containerApi(channel),
			parseContainerPending(this.id, pendingData),
		);
	}

	private containerApi(channel: ChannelContext): ContainerApi {
		return {
			provider: this.id,
			pollAfterMs: 10_000,
			status: async (id) => {
				const res = await providerJson<{ status_code?: string; status?: string }>(
					this.id,
					`${this.graph}/${id}?fields=status_code,status`,
					{ headers: graphHeaders(channel.accessToken, false), classify: this.classify() },
				);
				return toContainerState(res.status_code, res.status);
			},
			createCarousel: (childIds, text) =>
				this.createContainer(channel, {
					media_type: "CAROUSEL",
					children: childIds.join(","),
					caption: text,
				}),
			publish: (containerId) => this.publishContainer(channel, containerId),
		};
	}

	/** Containers are private drafts; creating one is not mutating. */
	private async createContainer(
		channel: ChannelContext,
		body: Record<string, unknown>,
	): Promise<string> {
		const res = await providerJson<{ id: string }>(
			this.id,
			`${this.graph}/${channel.externalId}/media`,
			{
				method: "POST",
				headers: graphHeaders(channel.accessToken),
				body: JSON.stringify(body),
				classify: this.classify(),
			},
		);
		return res.id;
	}

	private async publishContainer(
		channel: ChannelContext,
		containerId: string,
	): Promise<PublishOutcome> {
		const res = await providerJson<{ id: string }>(
			this.id,
			`${this.graph}/${channel.externalId}/media_publish`,
			{
				method: "POST",
				mutating: true,
				headers: graphHeaders(channel.accessToken),
				body: JSON.stringify({ creation_id: containerId }),
				classify: this.classify(true),
			},
		);
		return { status: "published", externalId: res.id, url: await this.permalink(channel, res.id) };
	}

	/** The post is already live here: a failed lookup must never turn success into an error. */
	private async permalink(channel: ChannelContext, mediaId: string): Promise<string | null> {
		try {
			const res = await providerJson<{ permalink?: string }>(
				this.id,
				`${this.graph}/${mediaId}?fields=permalink`,
				{ headers: graphHeaders(channel.accessToken, false), classify: this.classify() },
			);
			return res.permalink ?? null;
		} catch (error) {
			channel.logger.warn({ err: error, mediaId }, "instagram permalink lookup failed");
			return null;
		}
	}
}
