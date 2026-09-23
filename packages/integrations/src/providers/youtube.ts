import { z } from "zod";
import { compact, type DayRange, num, todayInRange } from "../analytics";
import { checkReplyText, finalizeItems, MAX_PAGES_PER_POST, toIso } from "../engagement";
import { isProviderError, ProviderError } from "../errors";
import { expiresAtFrom, fetchMediaBytes, form, providerFetch, providerJson } from "../http";
import type {
	AccountMetricsDay,
	AnalyticsSupport,
	Capabilities,
	ChannelContext,
	ConnectResult,
	EngagementItem,
	EngagementSupport,
	PostMetrics,
	PublishInput,
	PublishOutcome,
	SocialProvider,
	TokenSet,
} from "../types";

/**
 * YouTube — video uploads to the user's channel(s) via the Data API v3.
 *
 * Quota matters more than rate: a project gets 10,000 units/day by default and
 * `videos.insert` costs 1,600, i.e. ~6 uploads/day for the WHOLE app until Google
 * grants an increase. https://developers.google.com/youtube/v3/determine_quota_cost
 *
 * Docs: https://developers.google.com/youtube/v3/docs/videos/insert
 */

export type YouTubeConfig = { clientId: string; clientSecret: string };

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";

/**
 * Description 5,000 bytes, title 100 chars, one video, up to 256 GB / 12 h.
 * (Unverified channels are capped at 15 minutes; YouTube rejects longer uploads.)
 * https://developers.google.com/youtube/v3/docs/videos#snippet.description
 * https://support.google.com/youtube/answer/71673
 */
const capabilities: Capabilities = {
	maxTextLength: 5000,
	requiresText: false,
	requiresMedia: true,
	maxImages: 0,
	maxVideos: 1,
	mixedMedia: false,
	imageMimeTypes: [],
	videoMimeTypes: ["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo", "video/mpeg"],
	maxImageBytes: 0,
	maxVideoBytes: 256 * 1024 * 1024 * 1024,
	maxVideoDurationSeconds: 12 * 60 * 60,
};

export const settingsSchema = z.object({
	title: z
		.string()
		.trim()
		.min(1, "A YouTube video needs a title")
		.max(100, "YouTube titles are at most 100 characters"),
	privacyStatus: z.enum(["public", "unlisted", "private"]).default("public"),
	madeForKids: z.boolean().default(false),
	tags: z.array(z.string().trim().min(1)).optional(),
	/** https://developers.google.com/youtube/v3/docs/videoCategories — 22 is "People & Blogs". */
	categoryId: z.string().regex(/^\d+$/).default("22"),
});
type Settings = z.infer<typeof settingsSchema>;

const READONLY = "https://www.googleapis.com/auth/youtube.readonly";
const FORCE_SSL = "https://www.googleapis.com/auth/youtube.force-ssl";

const SCOPES = [
	"https://www.googleapis.com/auth/youtube.upload",
	"https://www.googleapis.com/auth/youtube.readonly",
	"https://www.googleapis.com/auth/userinfo.profile",
	// Engagement inbox (added in phase 6; channels connected earlier must reconnect):
	// comments.insert only accepts youtube.force-ssl.
	FORCE_SSL,
];

/** Tags share a 500-char budget; a tag containing a space is counted with its quotes. */
const MAX_TAGS_CHARS = 500;

export function validateYouTube(input: PublishInput<Settings>): string[] {
	const errors: string[] = [];
	// YouTube rejects angle brackets in titles and descriptions (invalidTitle/invalidDescription).
	if (/[<>]/.test(input.settings.title)) errors.push("YouTube titles cannot contain < or >");
	if (/[<>]/.test(input.text)) errors.push("YouTube descriptions cannot contain < or >");
	if (new TextEncoder().encode(input.text).byteLength > 5000) {
		errors.push("YouTube descriptions are limited to 5000 bytes");
	}
	const tags = input.settings.tags ?? [];
	const tagChars =
		tags.reduce((sum, t) => sum + t.length + (t.includes(" ") ? 2 : 0), 0) +
		Math.max(0, tags.length - 1);
	if (tagChars > MAX_TAGS_CHARS)
		errors.push(`YouTube tags are limited to ${MAX_TAGS_CHARS} characters in total`);
	return errors;
}

/**
 * Milliseconds until the next midnight in America/Los_Angeles, when YouTube's
 * daily quota resets. https://developers.google.com/youtube/v3/getting-started#quota
 */
export function msUntilPacificMidnight(now: Date = new Date()): number {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: "America/Los_Angeles",
		hour12: false,
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	}).formatToParts(now);
	const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
	// Intl renders midnight as "24" in some engines with hour12: false.
	const elapsed =
		((get("hour") % 24) * 3600 + get("minute") * 60 + get("second")) * 1000 + now.getMilliseconds();
	return 24 * 3_600_000 - elapsed;
}

type GoogleErrorBody = {
	error?:
		| string
		| { code?: number; message?: string; errors?: { reason?: string; message?: string }[] };
	error_description?: string;
};

/** Quota/limit reasons that only clear when the daily quota resets. */
const DAILY_REASONS = new Set(["quotaExceeded", "dailyLimitExceeded", "uploadLimitExceeded"]);
const SHORT_RATE_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded"]);
/**
 * Reasons about ONE video/comment, not the credentials. Without this a 403
 * `commentsDisabled` would fall to the default 403 → auth mapping and push a
 * healthy channel into needs_reauth.
 * https://developers.google.com/youtube/v3/docs/commentThreads/list#errors
 * https://developers.google.com/youtube/v3/docs/comments/insert#errors
 */
const CONTENT_REASONS = new Set([
	"commentsDisabled",
	"videoNotFound",
	"commentNotFound",
	"parentCommentNotFound",
	"parentIdMissing",
	"commentTextRequired",
	"commentTextTooLong",
	"invalidCommentMetadata",
	"processingFailure",
]);

/**
 * Google API error bodies → our taxonomy. Returns undefined for the default mapping.
 * https://developers.google.com/youtube/v3/docs/errors
 */
export function classifyGoogleError(
	provider: string,
	status: number,
	body: string,
	now: Date = new Date(),
): ProviderError | undefined {
	let parsed: GoogleErrorBody;
	try {
		parsed = JSON.parse(body) as GoogleErrorBody;
	} catch {
		return undefined;
	}
	// OAuth token endpoint: {"error":"invalid_grant"} = refresh token revoked/expired.
	if (typeof parsed.error === "string") {
		return parsed.error === "invalid_grant"
			? new ProviderError(
					"auth",
					provider,
					parsed.error_description ?? "Google rejected the grant",
					{
						status,
						body,
						platformCode: parsed.error,
					},
				)
			: undefined;
	}
	const reason = parsed.error?.errors?.[0]?.reason;
	if (!reason) return undefined;
	const message = parsed.error?.message ?? reason;
	const details = { status, body, platformCode: reason };

	if (DAILY_REASONS.has(reason)) {
		return new ProviderError("rate_limited", provider, message, {
			...details,
			retryAfterMs: msUntilPacificMidnight(now),
		});
	}
	if (SHORT_RATE_REASONS.has(reason)) {
		return new ProviderError("rate_limited", provider, message, {
			...details,
			retryAfterMs: 60_000,
		});
	}
	if (CONTENT_REASONS.has(reason)) {
		return new ProviderError("invalid_request", provider, message, details);
	}
	return undefined;
}

type TokenResponse = {
	access_token: string;
	refresh_token?: string;
	expires_in?: number;
	scope?: string;
};

/** videos.list `id` accepts up to 50 comma-separated ids. */
const YOUTUBE_MAX_IDS = 50;

export function mapYouTubeStatistics(s: {
	viewCount?: string;
	likeCount?: string;
	commentCount?: string;
}): PostMetrics {
	return compact({
		videoViews: num(s.viewCount),
		likes: num(s.likeCount),
		comments: num(s.commentCount),
	});
}

/**
 * YouTube comments are limited to 10,000 characters (Help Center; the Data API
 * reports `commentTextTooLong` without naming the number).
 */
const YOUTUBE_MAX_COMMENT_CHARS = 10_000;
/** commentThreads.list / comments.list take maxResults 1..100. */
const YOUTUBE_COMMENTS_PAGE = 100;
/**
 * A thread carries only a few replies inline; fetching the rest costs a request
 * (1 unit) per thread, so at most this many threads per video are expanded per call.
 */
const YOUTUBE_MAX_THREAD_EXPANSIONS = 20;
/** Posts read per engagement call: each costs 1+ quota units. */
const YOUTUBE_ENGAGEMENT_MAX_POSTS = 25;

type YouTubeComment = {
	id: string;
	snippet?: {
		authorDisplayName?: string;
		authorProfileImageUrl?: string;
		authorChannelUrl?: string;
		authorChannelId?: { value?: string };
		textDisplay?: string;
		textOriginal?: string;
		parentId?: string;
		publishedAt?: string;
	};
};
type YouTubeThread = {
	id: string;
	snippet?: { topLevelComment?: YouTubeComment; totalReplyCount?: number };
	replies?: { comments?: YouTubeComment[] };
};
type YouTubePage<T> = { items?: T[]; nextPageToken?: string };

const commentUrl = (videoId: string, commentId: string) =>
	`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&lc=${encodeURIComponent(commentId)}`;

/** One comment (top-level or reply) → inbox item. */
export function mapYouTubeComment(
	c: YouTubeComment,
	videoId: string,
	channelId: string,
): EngagementItem | null {
	const s = c.snippet ?? {};
	const createdAt = toIso(s.publishedAt);
	if (!createdAt) return null;
	const parent = s.parentId ?? null;
	const name = s.authorDisplayName ?? null;
	return {
		externalId: c.id,
		kind: parent ? "reply" : "comment",
		postExternalId: videoId,
		parentExternalId: parent,
		author: {
			externalId: s.authorChannelId?.value ?? null,
			name,
			// Display names are "@handle" for channels that have one.
			handle: name?.startsWith("@") ? name.slice(1) : null,
			avatarUrl: s.authorProfileImageUrl ?? null,
			profileUrl: s.authorChannelUrl ?? null,
		},
		fromSelf: s.authorChannelId?.value === channelId,
		// textFormat=plainText makes textDisplay plain; textOriginal only comes back for our own.
		text: s.textDisplay ?? s.textOriginal ?? "",
		url: commentUrl(videoId, c.id),
		createdAt,
	};
}

/** Reply ids are "<top-level id>.<suffix>"; YouTube threads are one level deep. */
export const youtubeThreadId = (commentId: string) => commentId.split(".")[0] ?? commentId;

/** Per-video errors that mean "nothing to read here", not a broken channel. */
const isSkippableVideoError = (error: unknown) =>
	isProviderError(error) &&
	error.kind === "invalid_request" &&
	(error.details.platformCode === "commentsDisabled" ||
		error.details.platformCode === "videoNotFound" ||
		error.details.status === 404);

export class YouTubeProvider implements SocialProvider<Settings> {
	readonly id = "youtube" as const;
	readonly displayName = "YouTube";
	readonly capabilities = capabilities;
	readonly settingsSchema = settingsSchema as z.ZodType<Settings>;
	// See the quota note above: the daily unit budget, not this limiter, is the real cap.
	readonly publishRateLimit = { max: 2, durationMs: 60_000 };

	constructor(private readonly config: YouTubeConfig) {}

	isConfigured() {
		return Boolean(this.config.clientId && this.config.clientSecret);
	}

	private classify = (status: number, body: string) => classifyGoogleError(this.id, status, body);

	validate(input: PublishInput<Settings>): string[] {
		return validateYouTube(input);
	}

	/**
	 * Comments and replies on our videos; replies as the channel.
	 *
	 * Reading uses youtube.readonly (held since phase 1); replying needs
	 * youtube.force-ssl (NEW — existing channels must reconnect to reply).
	 * No mentions: the Data API has no mentions feed. Quota: 1 unit per read page,
	 * 50 units per reply (a 10,000-unit day ≈ 200 replies with no uploads).
	 */
	readonly engagement: EngagementSupport = {
		requiredScopes: { read: [READONLY], reply: [FORCE_SSL] },
		maxPostsPerCall: YOUTUBE_ENGAGEMENT_MAX_POSTS,
		maxReplyLength: YOUTUBE_MAX_COMMENT_CHARS,
		listComments: (channel, input) => this.listComments(channel, input),
		reply: (channel, input) => this.replyToComment(channel, input),
	};

	private readJson<T>(channel: ChannelContext, path: string, params: Record<string, string>) {
		return providerJson<T>(this.id, `${API}/${path}?${form(params)}`, {
			headers: { Authorization: `Bearer ${channel.accessToken}` },
			classify: this.classify,
		});
	}

	/**
	 * commentThreads.list (part=snippet,replies) per video, newest threads first,
	 * at most MAX_PAGES_PER_POST pages. `order=time` sorts threads by when they
	 * started, not by their latest reply, so we never stop early on `since`: a new
	 * reply on an old thread must still be found. Threads with more replies than
	 * the inline few are expanded with comments.list (bounded, see above).
	 * https://developers.google.com/youtube/v3/docs/commentThreads/list
	 * https://developers.google.com/youtube/v3/docs/comments/list
	 */
	private async listComments(
		channel: ChannelContext,
		input: { postExternalIds: string[]; since: string | null },
	): Promise<EngagementItem[]> {
		const items: (EngagementItem | null)[] = [];
		for (const videoId of input.postExternalIds) {
			try {
				const threads = await this.pages<YouTubeThread>(channel, "commentThreads", {
					part: "snippet,replies",
					videoId,
					order: "time",
					textFormat: "plainText",
					maxResults: String(YOUTUBE_COMMENTS_PAGE),
				});
				let expansions = 0;
				for (const thread of threads) {
					const top = thread.snippet?.topLevelComment;
					if (!top) continue;
					items.push(mapYouTubeComment(top, videoId, channel.externalId));
					let replies = thread.replies?.comments ?? [];
					const total = thread.snippet?.totalReplyCount ?? 0;
					if (total > replies.length && expansions < YOUTUBE_MAX_THREAD_EXPANSIONS) {
						expansions++;
						replies = await this.pages<YouTubeComment>(channel, "comments", {
							part: "snippet",
							parentId: top.id,
							textFormat: "plainText",
							maxResults: String(YOUTUBE_COMMENTS_PAGE),
						});
					}
					for (const r of replies) {
						items.push(
							mapYouTubeComment(
								// comments.list returns parentId; inline replies do too, but be sure.
								{ ...r, snippet: { ...r.snippet, parentId: r.snippet?.parentId ?? top.id } },
								videoId,
								channel.externalId,
							),
						);
					}
				}
			} catch (error) {
				// Comments turned off, or the video is gone: skip it, as the contract asks.
				if (isSkippableVideoError(error)) continue;
				throw error;
			}
		}
		return finalizeItems(
			items.filter((i) => i !== null),
			input.since,
		);
	}

	private async pages<T>(
		channel: ChannelContext,
		path: string,
		params: Record<string, string>,
	): Promise<T[]> {
		const out: T[] = [];
		let pageToken: string | undefined;
		for (let page = 0; page < MAX_PAGES_PER_POST; page++) {
			const res = await this.readJson<YouTubePage<T>>(channel, path, {
				...params,
				...(pageToken ? { pageToken } : {}),
			});
			out.push(...(res.items ?? []));
			pageToken = res.nextPageToken;
			if (!pageToken) break;
		}
		return out;
	}

	/**
	 * comments.insert with `snippet.parentId` answers a top-level comment. A reply
	 * to a reply goes to its thread's top-level comment (YouTube has one level of
	 * nesting), whose id is the reply id's prefix.
	 * https://developers.google.com/youtube/v3/docs/comments/insert
	 */
	private async replyToComment(
		channel: ChannelContext,
		input: { toExternalId: string; postExternalId: string | null; text: string },
	): Promise<{ externalId: string; url: string | null }> {
		const text = checkReplyText(this.id, input.text, YOUTUBE_MAX_COMMENT_CHARS);
		const res = await providerJson<{ id?: string }>(this.id, `${API}/comments?part=snippet`, {
			method: "POST",
			mutating: true,
			headers: {
				Authorization: `Bearer ${channel.accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				snippet: { parentId: youtubeThreadId(input.toExternalId), textOriginal: text },
			}),
			classify: this.classify,
		});
		if (!res.id) {
			throw new ProviderError(
				"unknown_outcome",
				this.id,
				"YouTube accepted the reply but returned no id",
			);
		}
		return {
			externalId: res.id,
			url: input.postExternalId ? commentUrl(input.postExternalId, res.id) : null,
		};
	}

	/**
	 * Data API reads with youtube.readonly (already requested); 1 quota unit per
	 * call, so analytics barely dents the upload budget. The Data API has no
	 * impressions or reach — those live in the YouTube Analytics API, which needs
	 * the separate yt-analytics.readonly scope we do not request.
	 */
	readonly analytics: AnalyticsSupport = {
		maxPostsPerCall: YOUTUBE_MAX_IDS,
		getPostMetrics: (channel, ids) => this.getPostMetrics(channel, ids),
		getAccountMetrics: (channel, range) => this.getAccountMetrics(channel, range),
	};

	/**
	 * Deleted or private-to-someone-else videos are simply absent from `items`.
	 * Counts arrive as strings; likeCount is absent when the owner hid it.
	 * https://developers.google.com/youtube/v3/docs/videos/list
	 */
	private async getPostMetrics(
		channel: ChannelContext,
		ids: string[],
	): Promise<Record<string, PostMetrics>> {
		if (ids.length === 0) return {};
		const res = await providerJson<{
			items?: {
				id: string;
				statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
			}[];
		}>(this.id, `${API}/videos?${form({ part: "statistics", id: ids.join(",") })}`, {
			headers: { Authorization: `Bearer ${channel.accessToken}` },
			classify: this.classify,
		});
		const out: Record<string, PostMetrics> = {};
		for (const item of res.items ?? []) {
			out[item.id] = mapYouTubeStatistics(item.statistics ?? {});
		}
		return out;
	}

	/**
	 * Current subscriber count only (no history in the Data API), dated today.
	 * YouTube rounds public subscriber counts to three significant figures.
	 * https://developers.google.com/youtube/v3/docs/channels/list
	 */
	private async getAccountMetrics(
		channel: ChannelContext,
		range: DayRange,
	): Promise<AccountMetricsDay[]> {
		const today = todayInRange(range);
		if (!today) return [];
		const res = await providerJson<{
			items?: {
				statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean };
			}[];
		}>(this.id, `${API}/channels?${form({ part: "statistics", id: channel.externalId })}`, {
			headers: { Authorization: `Bearer ${channel.accessToken}` },
			classify: this.classify,
		});
		const stats = res.items?.[0]?.statistics;
		const followers = stats?.hiddenSubscriberCount ? undefined : num(stats?.subscriberCount);
		return followers === undefined ? [] : [{ date: today, followers }];
	}

	/**
	 * `prompt=consent` forces Google to issue a refresh token even when the user
	 * granted access before (otherwise it is only sent on first consent).
	 * https://developers.google.com/identity/protocols/oauth2/web-server
	 */
	async getAuthorizationUrl({ redirectUri, state }: { redirectUri: string; state: string }) {
		const url = new URL(AUTH_URL);
		url.search = form({
			client_id: this.config.clientId,
			redirect_uri: redirectUri,
			response_type: "code",
			scope: SCOPES.join(" "),
			access_type: "offline",
			prompt: "consent",
			include_granted_scopes: "true",
			state,
		});
		return { url: url.toString() };
	}

	private async requestToken(params: Record<string, string>): Promise<TokenResponse> {
		return providerJson<TokenResponse>(this.id, TOKEN_URL, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: form({
				...params,
				client_id: this.config.clientId,
				client_secret: this.config.clientSecret,
			}),
			classify: this.classify,
		});
	}

	private toTokens(t: TokenResponse, fallbackRefresh: string | null): TokenSet {
		return {
			accessToken: t.access_token,
			refreshToken: t.refresh_token ?? fallbackRefresh,
			expiresAt: expiresAtFrom(t.expires_in),
			scopes: t.scope?.split(" ").filter(Boolean) ?? SCOPES,
		};
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
			null,
		);
		// https://developers.google.com/youtube/v3/docs/channels/list
		const res = await providerJson<{
			items?: {
				id: string;
				snippet: { title: string; customUrl?: string; thumbnails?: { default?: { url?: string } } };
			}[];
		}>(this.id, `${API}/channels?part=snippet&mine=true`, {
			headers: { Authorization: `Bearer ${tokens.accessToken}` },
			classify: this.classify,
		});
		// A Google account without a YouTube channel yields no items; the web app
		// tells the user to create a channel first.
		const accounts = (res.items ?? []).map((c) => ({
			externalId: c.id,
			name: c.snippet.title,
			username: c.snippet.customUrl ?? null,
			avatarUrl: c.snippet.thumbnails?.default?.url ?? null,
			profileUrl: `https://www.youtube.com/channel/${c.id}`,
		}));
		return { tokens, accounts };
	}

	/** Google does not rotate refresh tokens; keep the current one when none is returned. */
	async refreshTokens(refreshToken: string): Promise<TokenSet> {
		return this.toTokens(
			await this.requestToken({ grant_type: "refresh_token", refresh_token: refreshToken }),
			refreshToken,
		);
	}

	/**
	 * Resumable upload in a single PUT: init session (metadata) → PUT bytes.
	 * https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol
	 */
	async publish(channel: ChannelContext, input: PublishInput<Settings>): Promise<PublishOutcome> {
		const video = input.media.find((m) => m.kind === "video");
		if (!video) throw new ProviderError("invalid_request", this.id, "YouTube posts need a video");
		const s = input.settings;
		// Whole file in memory, like the other byte-uploading adapters; fine for the
		// sizes the composer accepts today, a streaming pipe is the upgrade path.
		const bytes = await fetchMediaBytes(this.id, video.url);

		// Opening the session creates nothing visible; it is safe to retry.
		const init = await providerFetch(
			this.id,
			`${UPLOAD_URL}?uploadType=resumable&part=snippet,status`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${channel.accessToken}`,
					"Content-Type": "application/json; charset=UTF-8",
					"X-Upload-Content-Length": String(bytes.byteLength),
					"X-Upload-Content-Type": video.mimeType,
				},
				body: JSON.stringify({
					snippet: {
						title: s.title,
						description: input.text,
						categoryId: s.categoryId,
						...(s.tags?.length ? { tags: s.tags } : {}),
					},
					status: { privacyStatus: s.privacyStatus, selfDeclaredMadeForKids: s.madeForKids },
				}),
				classify: this.classify,
			},
		);
		const sessionUrl = init.headers.get("location");
		if (!sessionUrl)
			throw new ProviderError("transient", this.id, "YouTube did not return an upload session URL");

		// The PUT completing is what creates the video. A dropped connection here is
		// ambiguous (the session could be queried to resume; not implemented), so it
		// is mutating and ends up `unknown_outcome` rather than a blind re-upload.
		const res = await providerJson<{ id?: string }>(this.id, sessionUrl, {
			method: "PUT",
			mutating: true,
			headers: { "Content-Type": video.mimeType },
			body: bytes,
			timeoutMs: 30 * 60_000,
			classify: this.classify,
		});
		if (!res.id)
			throw new ProviderError(
				"unknown_outcome",
				this.id,
				"YouTube accepted the upload but returned no id",
			);

		// YouTube keeps processing/transcoding after this, but the video already exists
		// with its final id and URL; processing state doesn't change whether it was posted.
		return {
			status: "published",
			externalId: res.id,
			url: `https://www.youtube.com/watch?v=${res.id}`,
		};
	}
}
