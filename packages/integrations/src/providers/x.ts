import { z } from "zod";
import { chunk, compact, type DayRange, num, sumKnown, todayInRange } from "../analytics";
import {
	checkReplyText,
	decodeEntities,
	finalizeItems,
	MAX_PAGES_PER_POST,
	toIso,
	xWeightedLength,
} from "../engagement";
import { ProviderError } from "../errors";
import {
	createPkce,
	expiresAtFrom,
	fetchMediaBytes,
	form,
	providerFetch,
	providerJson,
} from "../http";
import type {
	AccountMetricsDay,
	AnalyticsSupport,
	Capabilities,
	ChannelContext,
	ConnectResult,
	DiscussionItem,
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
 * X (Twitter) — user accounts via the X API v2.
 *
 * OAuth 2.0 Authorization Code with PKCE as a CONFIDENTIAL client (client secret
 * sent as HTTP Basic on the token endpoint). Media goes through the v2 chunked
 * upload endpoints; the v1.1 upload.twitter.com endpoint is being retired.
 *
 * Docs: https://docs.x.com/x-api/introduction
 */

export type XConfig = { clientId: string; clientSecret: string };

const AUTH_URL = "https://x.com/i/oauth2/authorize";
const API = "https://api.x.com/2";

/**
 * 280 is the limit for non-Premium accounts. X counts WEIGHTED characters (URLs
 * are always 23, CJK/emoji count 2). Replies are checked with that weighting
 * (`xWeightedLength` in engagement.ts); the composer still uses a plain count, so
 * it can accept a post X then rejects, or vice versa.
 * https://docs.x.com/resources/fundamentals/counting-characters
 *
 * Media: 4 images or 1 video/GIF, never mixed; images 5 MB, video 512 MB / 140 s.
 * https://docs.x.com/x-api/media/quickstart/best-practices
 */
const capabilities: Capabilities = {
	maxTextLength: 280,
	requiresText: true,
	requiresMedia: false,
	maxImages: 4,
	maxVideos: 1,
	mixedMedia: false,
	imageMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
	videoMimeTypes: ["video/mp4", "video/quicktime"],
	maxImageBytes: 5 * 1024 * 1024,
	maxVideoBytes: 512 * 1024 * 1024,
	maxVideoDurationSeconds: 140,
};

const settingsSchema = z.object({});
type Settings = z.infer<typeof settingsSchema>;

const SCOPES = ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"];

/** Chunk size for APPEND; X accepts up to 5 MB per segment. */
const CHUNK_BYTES = 4 * 1024 * 1024;
/** Upper bound on waiting for video processing inside `publish`. */
const MAX_PROCESSING_WAIT_MS = 5 * 60_000;

type TokenResponse = {
	access_token: string;
	refresh_token?: string;
	expires_in?: number;
	scope?: string;
};

type ProcessingInfo = {
	state: "pending" | "in_progress" | "succeeded" | "failed";
	check_after_secs?: number;
	error?: { name?: string; message?: string };
};

/** 403 details that are about the app, client or credentials rather than the post. */
const AUTHISH_403 = /\b(authenticat\w*|client|apps?|project|enrolled|suspended|scopes?|token)\b/i;

type XErrorBody = {
	title?: string;
	detail?: string;
	type?: string;
	errors?: { message?: string }[];
};

/**
 * X-specific error shapes. Returns undefined for the default mapping.
 * https://docs.x.com/x-api/fundamentals/response-codes-and-errors
 */
export function classifyXError(
	provider: string,
	status: number,
	body: string,
): ProviderError | undefined {
	const lower = body.toLowerCase();
	if (status === 403 && lower.includes("duplicate content")) {
		// X refuses an identical recent post from the same account; nothing was created.
		return new ProviderError("invalid_request", provider, "X rejected the post as a duplicate", {
			status,
			body,
			platformCode: "duplicate",
		});
	}
	// Token-endpoint failures (expired/revoked refresh token) mean the user must reconnect.
	if (status === 400 && lower.includes("invalid_grant")) {
		return new ProviderError("auth", provider, "X rejected the authorization grant", {
			status,
			body,
		});
	}
	if (status === 400 || status === 403) {
		let parsed: XErrorBody | undefined;
		try {
			parsed = JSON.parse(body) as XErrorBody;
		} catch {
			parsed = undefined;
		}
		const detail = parsed?.detail ?? parsed?.errors?.[0]?.message;
		// A 403 that is about the CONTENT (e.g. "You are not permitted to perform this
		// action" on a reply-restricted thread) is not an auth problem; a 403 about the
		// app/client (not enrolled, suspended) is.
		if (status === 403 && detail && !AUTHISH_403.test(detail)) {
			return new ProviderError("invalid_request", provider, detail, { status, body });
		}
		if (status === 400 && detail)
			return new ProviderError("invalid_request", provider, detail, { status, body });
	}
	return undefined;
}

/**
 * `public_metrics` of a post. The data dictionary names the repost counter
 * `retweet_count`; the newer endpoint reference calls it `repost_count`. Both
 * are read so the rename cannot silently drop shares.
 * https://docs.x.com/x-api/fundamentals/data-dictionary
 */
type XPublicMetrics = {
	impression_count?: number;
	like_count?: number;
	reply_count?: number;
	retweet_count?: number;
	repost_count?: number;
	quote_count?: number;
	bookmark_count?: number;
};

export function mapXPublicMetrics(m: XPublicMetrics): PostMetrics {
	return compact({
		impressions: num(m.impression_count),
		likes: num(m.like_count),
		comments: num(m.reply_count),
		// Reposts and quote posts both re-share the post to other timelines.
		shares: sumKnown(num(m.retweet_count ?? m.repost_count), num(m.quote_count)),
		saves: num(m.bookmark_count),
	});
}

/** Max ids per posts lookup. https://docs.x.com/x-api/posts/get-posts-by-ids */
const X_LOOKUP_MAX_IDS = 100;

/**
 * Engagement reads. Recent search only reaches back 7 days; `start_time` older
 * than that is rejected, so it is clamped (a minute of slack for clock skew).
 * https://docs.x.com/x-api/posts/search-recent-posts
 */
const X_SEARCH_WINDOW_MS = 7 * 86_400_000 - 60_000;
/** Conversations ORed into one search query: ~40 chars each keeps well under the 512-char query cap of the smaller tiers. */
const X_CONVERSATIONS_PER_QUERY = 10;
const X_PAGE_SIZE = 100;
/** Post ids are numeric strings (up to 19 digits); anything else never reaches the URL. */
const X_ID = /^\d{1,19}$/;

const X_TWEET_FIELDS = "created_at,author_id,conversation_id,referenced_tweets,public_metrics";
const X_USER_FIELDS = "name,username,profile_image_url";

type XTweet = {
	id: string;
	text?: string;
	created_at?: string;
	author_id?: string;
	conversation_id?: string;
	referenced_tweets?: { type: string; id: string }[];
	public_metrics?: XPublicMetrics;
};
type XUser = { id: string; name?: string; username?: string; profile_image_url?: string };
type XSearchPage = {
	data?: XTweet[];
	includes?: { users?: XUser[] };
	meta?: { next_token?: string };
};

const xAuthor = (user: XUser | undefined, authorId: string | undefined) => ({
	externalId: authorId ?? null,
	name: user?.name ?? null,
	handle: user?.username ?? null,
	avatarUrl: user?.profile_image_url ?? null,
	profileUrl: user?.username ? `https://x.com/${user.username}` : null,
});

const xPostUrl = (id: string, username: string | null | undefined) =>
	username ? `https://x.com/${username}/status/${id}` : `https://x.com/i/web/status/${id}`;

/**
 * A post from a conversation (or the mentions timeline) → inbox item. A reply
 * whose parent is the root of one of our posts is a "comment"; anything deeper
 * is a "reply" under its direct parent.
 */
export function mapXEngagement(
	t: XTweet,
	users: Map<string, XUser>,
	selfId: string,
	kind: "conversation" | "mention",
): EngagementItem | null {
	const createdAt = toIso(t.created_at);
	if (!createdAt) return null;
	const user = t.author_id ? users.get(t.author_id) : undefined;
	const parent = t.referenced_tweets?.find((r) => r.type === "replied_to")?.id ?? null;
	const base = {
		externalId: t.id,
		author: xAuthor(user, t.author_id),
		fromSelf: t.author_id === selfId,
		// X escapes &, < and > in post text.
		text: decodeEntities(t.text ?? ""),
		url: xPostUrl(t.id, user?.username),
		createdAt,
	};
	if (kind === "mention") {
		return { ...base, kind: "mention", postExternalId: null, parentExternalId: null };
	}
	const root = t.conversation_id ?? null;
	// Search returns the conversation's root too: that is our own post, not engagement.
	if (root === t.id) return null;
	const topLevel = parent === null || parent === root;
	return {
		...base,
		kind: topLevel ? "comment" : "reply",
		postExternalId: root,
		parentExternalId: topLevel ? null : parent,
	};
}

/**
 * Listening defaults, added only when the query does not already decide them:
 * no reposts (pure duplicates of the original) and English. A query that says
 * `is:retweet` or `lang:xx` itself keeps full control.
 */
export function xListeningQuery(query: string): string {
	const q = query.trim();
	const extra: string[] = [];
	if (!/\bis:retweet\b/i.test(q)) extra.push("-is:retweet");
	if (!/\blang:/i.test(q)) extra.push("lang:en");
	return [q.includes(" OR ") ? `(${q})` : q, ...extra].join(" ");
}

/** start_time for a 7-day-window endpoint: `since` clamped into the window. */
export function xStartTime(since: string | null, now: Date = new Date()): string {
	const floor = now.getTime() - X_SEARCH_WINDOW_MS;
	const s = since ? Date.parse(since) : Number.NaN;
	return new Date(Number.isNaN(s) ? floor : Math.max(s, floor)).toISOString();
}

const mediaCategory = (m: MediaItem) =>
	m.kind === "video" ? "tweet_video" : m.mimeType === "image/gif" ? "tweet_gif" : "tweet_image";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class XProvider implements SocialProvider<Settings> {
	readonly id = "x" as const;
	readonly displayName = "X";
	readonly capabilities = capabilities;
	readonly settingsSchema = settingsSchema as z.ZodType<Settings>;
	// Post caps depend on the app's paid tier (Free is ~17/day app-wide); stay slow.
	// https://docs.x.com/x-api/fundamentals/rate-limits
	readonly publishRateLimit = { max: 5, durationMs: 60_000 };

	constructor(private readonly config: XConfig) {}

	isConfigured() {
		return Boolean(this.config.clientId && this.config.clientSecret);
	}

	private classify = (status: number, body: string) => classifyXError(this.id, status, body);

	/**
	 * Replies to our posts, mentions, replying and keyword listening, all with
	 * scopes publishing already requests (tweet.read users.read tweet.write).
	 *
	 * Needs a PAID API tier: search and the mentions timeline are not in the free
	 * tier, and every post read counts against the app's monthly read cap. Since
	 * February 2026, programmatic replies (Free/Basic/Pro/pay-per-use) are only
	 * allowed when the author of the post being answered mentioned or quoted us;
	 * X refuses others with a 403 that classifyXError maps to invalid_request.
	 */
	readonly engagement: EngagementSupport = {
		requiredScopes: {
			read: ["tweet.read", "users.read"],
			reply: ["tweet.read", "tweet.write", "users.read"],
		},
		maxPostsPerCall: X_CONVERSATIONS_PER_QUERY,
		maxReplyLength: capabilities.maxTextLength,
		listComments: (channel, input) => this.listReplies(channel, input),
		listMentions: (channel, input) => this.listMentions(channel, input),
		reply: (channel, input) => this.reply(channel, input),
		searchDiscussions: (channel, input) => this.searchDiscussions(channel, input),
	};

	/** Follows the pagination token for at most `maxPages` pages, collecting posts and expanded users. */
	private async searchPages(
		channel: ChannelContext,
		path: string,
		params: Record<string, string>,
		opts: { maxPages?: number; maxPosts?: number; tokenParam?: string } = {},
	): Promise<{ posts: XTweet[]; users: Map<string, XUser> }> {
		const posts: XTweet[] = [];
		const users = new Map<string, XUser>();
		let token: string | undefined;
		for (let page = 0; page < (opts.maxPages ?? MAX_PAGES_PER_POST); page++) {
			const res = await providerJson<XSearchPage>(
				this.id,
				`${API}${path}?${form({
					...params,
					"tweet.fields": X_TWEET_FIELDS,
					expansions: "author_id",
					"user.fields": X_USER_FIELDS,
					...(token ? { [opts.tokenParam ?? "next_token"]: token } : {}),
				})}`,
				{ headers: { Authorization: `Bearer ${channel.accessToken}` }, classify: this.classify },
			);
			posts.push(...(res.data ?? []));
			for (const u of res.includes?.users ?? []) users.set(u.id, u);
			token = res.meta?.next_token;
			if (!token || (opts.maxPosts !== undefined && posts.length >= opts.maxPosts)) break;
		}
		return { posts, users };
	}

	/**
	 * Replies to our posts via recent search on `conversation_id:` (ORed, 10 posts
	 * per query). Only the last 7 days are searchable: older replies are never
	 * seen. https://docs.x.com/x-api/posts/search-recent-posts
	 */
	private async listReplies(
		channel: ChannelContext,
		input: { postExternalIds: string[]; since: string | null },
	): Promise<EngagementItem[]> {
		const ids = input.postExternalIds.filter((id) => X_ID.test(id));
		const items: (EngagementItem | null)[] = [];
		for (const group of chunk(ids, X_CONVERSATIONS_PER_QUERY)) {
			const { posts, users } = await this.searchPages(channel, "/tweets/search/recent", {
				query: group.map((id) => `conversation_id:${id}`).join(" OR "),
				start_time: xStartTime(input.since),
				max_results: String(X_PAGE_SIZE),
				sort_order: "recency",
			});
			items.push(...posts.map((t) => mapXEngagement(t, users, channel.externalId, "conversation")));
		}
		return finalizeItems(
			items.filter((i) => i !== null),
			input.since,
		);
	}

	/**
	 * Posts mentioning the account (reverse-chronological timeline). Replies to
	 * our posts show up here too, since a reply mentions the author it answers;
	 * the inbox keys items by externalId, so the overlap collapses there.
	 * https://docs.x.com/x-api/users/get-mentions
	 */
	private async listMentions(
		channel: ChannelContext,
		input: { since: string | null },
	): Promise<EngagementItem[]> {
		const { posts, users } = await this.searchPages(
			channel,
			`/users/${encodeURIComponent(channel.externalId)}/mentions`,
			// First poll (no `since`): the last 7 days, like replies.
			{ start_time: input.since ?? xStartTime(null), max_results: String(X_PAGE_SIZE) },
			{ tokenParam: "pagination_token" },
		);
		return finalizeItems(
			posts
				.map((t) => mapXEngagement(t, users, channel.externalId, "mention"))
				.filter((i) => i !== null)
				// Our own posts mentioning ourselves are not engagement.
				.filter((i) => !i.fromSelf),
			input.since,
		);
	}

	/**
	 * A reply is a post with `reply.in_reply_to_tweet_id`: the same mutating
	 * create call as publish(). Length is X's weighted count (URLs = 23).
	 * https://docs.x.com/x-api/posts/create-post
	 */
	private async reply(
		channel: ChannelContext,
		input: { toExternalId: string; kind: EngagementItem["kind"]; text: string },
	): Promise<{ externalId: string; url: string | null }> {
		if (!X_ID.test(input.toExternalId)) {
			throw new ProviderError("invalid_request", this.id, "Not an X post id");
		}
		const text = checkReplyText(this.id, input.text, capabilities.maxTextLength, xWeightedLength);
		const res = await providerJson<{ data?: { id: string } }>(this.id, `${API}/tweets`, {
			method: "POST",
			mutating: true,
			headers: {
				Authorization: `Bearer ${channel.accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ text, reply: { in_reply_to_tweet_id: input.toExternalId } }),
			classify: this.classify,
		});
		const id = res.data?.id;
		if (!id)
			throw new ProviderError(
				"unknown_outcome",
				this.id,
				"X accepted the reply but returned no id",
			);
		const username =
			typeof channel.metadata.username === "string" ? channel.metadata.username : null;
		return { externalId: id, url: xPostUrl(id, username) };
	}

	/**
	 * Keyword listening over the last 7 days of public posts. The user's query is
	 * X search syntax; see xListeningQuery for the defaults added to it.
	 * https://docs.x.com/x-api/posts/search-recent-posts
	 */
	private async searchDiscussions(
		channel: ChannelContext,
		input: { query: string; since: string | null; limit: number },
	): Promise<DiscussionItem[]> {
		if (!input.query.trim())
			throw new ProviderError("invalid_request", this.id, "Listening query is empty");
		const limit = Math.max(1, Math.min(Math.floor(input.limit), X_PAGE_SIZE * MAX_PAGES_PER_POST));
		const { posts, users } = await this.searchPages(
			channel,
			"/tweets/search/recent",
			{
				query: xListeningQuery(input.query),
				start_time: xStartTime(input.since),
				// X accepts 10..100 per page.
				max_results: String(Math.max(10, Math.min(limit, X_PAGE_SIZE))),
				sort_order: "recency",
			},
			{ maxPosts: limit },
		);
		const items: DiscussionItem[] = [];
		for (const t of posts) {
			const createdAt = toIso(t.created_at);
			if (!createdAt) continue;
			const user = t.author_id ? users.get(t.author_id) : undefined;
			items.push({
				externalId: t.id,
				author: xAuthor(user, t.author_id),
				title: null,
				text: decodeEntities(t.text ?? ""),
				url: xPostUrl(t.id, user?.username),
				community: null,
				createdAt,
				score: num(t.public_metrics?.like_count) ?? null,
				commentCount: num(t.public_metrics?.reply_count) ?? null,
			});
		}
		// Newest `limit` items, oldest first like every other engagement list.
		return finalizeItems(items, input.since).slice(-limit);
	}

	/**
	 * Needs tweet.read + users.read, which publishing already requests. Reads count
	 * against the app's paid-tier monthly post-read cap, so the collector should
	 * poll sparingly.
	 */
	readonly analytics: AnalyticsSupport = {
		maxPostsPerCall: X_LOOKUP_MAX_IDS,
		getPostMetrics: (channel, ids) => this.getPostMetrics(channel, ids),
		getAccountMetrics: (channel, range) => this.getAccountMetrics(channel, range),
	};

	/**
	 * Posts lookup with public_metrics. Deleted or protected posts come back in
	 * `errors` (resource-not-found), not `data`, so they are simply absent here.
	 * https://docs.x.com/x-api/posts/get-posts-by-ids
	 */
	private async getPostMetrics(
		channel: ChannelContext,
		ids: string[],
	): Promise<Record<string, PostMetrics>> {
		if (ids.length === 0) return {};
		const res = await providerJson<{
			data?: { id: string; public_metrics?: XPublicMetrics }[];
		}>(this.id, `${API}/tweets?${form({ ids: ids.join(","), "tweet.fields": "public_metrics" })}`, {
			headers: { Authorization: `Bearer ${channel.accessToken}` },
			classify: this.classify,
		});
		const out: Record<string, PostMetrics> = {};
		for (const post of res.data ?? []) {
			out[post.id] = post.public_metrics ? mapXPublicMetrics(post.public_metrics) : {};
		}
		return out;
	}

	/**
	 * X exposes no follower history, only the current count, so the result is at
	 * most one row: today, if it is inside the range.
	 * https://docs.x.com/x-api/users/get-my-user
	 */
	private async getAccountMetrics(
		channel: ChannelContext,
		range: DayRange,
	): Promise<AccountMetricsDay[]> {
		const today = todayInRange(range);
		if (!today) return [];
		const me = await providerJson<{
			data?: { public_metrics?: { followers_count?: number } };
		}>(this.id, `${API}/users/me?${form({ "user.fields": "public_metrics" })}`, {
			headers: { Authorization: `Bearer ${channel.accessToken}` },
			classify: this.classify,
		});
		const followers = num(me.data?.public_metrics?.followers_count);
		return followers === undefined ? [] : [{ date: today, followers }];
	}

	/** https://docs.x.com/resources/fundamentals/authentication/oauth-2-0/authorization-code */
	async getAuthorizationUrl({ redirectUri, state }: { redirectUri: string; state: string }) {
		const { verifier, challenge } = await createPkce();
		const url = new URL(AUTH_URL);
		url.search = form({
			response_type: "code",
			client_id: this.config.clientId,
			redirect_uri: redirectUri,
			scope: SCOPES.join(" "),
			state,
			code_challenge: challenge,
			code_challenge_method: "S256",
		});
		return { url: url.toString(), codeVerifier: verifier };
	}

	private async requestToken(params: Record<string, string>): Promise<TokenSet> {
		const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString(
			"base64",
		);
		const t = await providerJson<TokenResponse>(this.id, `${API}/oauth2/token`, {
			method: "POST",
			headers: {
				Authorization: `Basic ${basic}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: form(params),
			classify: this.classify,
		});
		return {
			accessToken: t.access_token,
			refreshToken: t.refresh_token ?? null,
			expiresAt: expiresAtFrom(t.expires_in),
			scopes: t.scope?.split(" ").filter(Boolean) ?? SCOPES,
		};
	}

	async exchangeCode({
		code,
		redirectUri,
		codeVerifier,
	}: {
		code: string;
		redirectUri: string;
		codeVerifier?: string;
	}): Promise<ConnectResult> {
		if (!codeVerifier)
			throw new ProviderError("invalid_request", this.id, "Missing PKCE code verifier");
		const tokens = await this.requestToken({
			grant_type: "authorization_code",
			code,
			redirect_uri: redirectUri,
			code_verifier: codeVerifier,
		});
		const me = await providerJson<{
			data: { id: string; name: string; username: string; profile_image_url?: string };
		}>(this.id, `${API}/users/me?user.fields=profile_image_url`, {
			headers: { Authorization: `Bearer ${tokens.accessToken}` },
			classify: this.classify,
		});
		return {
			tokens,
			accounts: [
				{
					externalId: me.data.id,
					name: me.data.name,
					username: me.data.username,
					avatarUrl: me.data.profile_image_url ?? null,
					profileUrl: `https://x.com/${me.data.username}`,
					metadata: { username: me.data.username },
				},
			],
		};
	}

	/**
	 * X ROTATES refresh tokens: the old one is invalid once used, so the caller must
	 * persist the returned one.
	 */
	async refreshTokens(refreshToken: string): Promise<TokenSet> {
		return this.requestToken({ grant_type: "refresh_token", refresh_token: refreshToken });
	}

	async publish(channel: ChannelContext, input: PublishInput<Settings>): Promise<PublishOutcome> {
		const mediaIds: string[] = [];
		for (const m of input.media) mediaIds.push(await this.uploadMedia(channel, m));

		// https://docs.x.com/x-api/posts/create-post
		const res = await providerJson<{ data?: { id: string } }>(this.id, `${API}/tweets`, {
			method: "POST",
			mutating: true,
			headers: {
				Authorization: `Bearer ${channel.accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				text: input.text,
				...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}),
			}),
			classify: this.classify,
		});
		const id = res.data?.id;
		if (!id)
			throw new ProviderError("unknown_outcome", this.id, "X accepted the post but returned no id");

		const username =
			typeof channel.metadata.username === "string" ? channel.metadata.username : null;
		return {
			status: "published",
			externalId: id,
			// /i/web/status/{id} resolves without the handle, for channels connected before we stored it.
			url: username ? `https://x.com/${username}/status/${id}` : `https://x.com/i/web/status/${id}`,
		};
	}

	/**
	 * Chunked v2 upload: initialize → append × n → finalize → (poll STATUS for video).
	 * Uploaded media is invisible until attached to a post, so none of this is mutating.
	 * https://docs.x.com/x-api/media/quickstart/media-upload-chunked
	 */
	private async uploadMedia(channel: ChannelContext, media: MediaItem): Promise<string> {
		const auth = { Authorization: `Bearer ${channel.accessToken}` };
		const bytes = await fetchMediaBytes(this.id, media.url);

		const init = await providerJson<{ data: { id: string } }>(
			this.id,
			`${API}/media/upload/initialize`,
			{
				method: "POST",
				headers: { ...auth, "Content-Type": "application/json" },
				body: JSON.stringify({
					media_type: media.mimeType,
					total_bytes: bytes.byteLength,
					media_category: mediaCategory(media),
				}),
				classify: this.classify,
			},
		);
		const mediaId = init.data.id;

		for (let offset = 0, segment = 0; offset < bytes.byteLength; offset += CHUNK_BYTES, segment++) {
			const body = new FormData();
			body.append("segment_index", String(segment));
			body.append("media", new Blob([bytes.subarray(offset, offset + CHUNK_BYTES)]), "chunk");
			// APPEND's 2xx body carries nothing we need; only the status matters.
			await providerFetch(this.id, `${API}/media/upload/${mediaId}/append`, {
				method: "POST",
				headers: auth,
				body,
				timeoutMs: 120_000,
				classify: this.classify,
			});
		}

		const fin = await providerJson<{ data: { id: string; processing_info?: ProcessingInfo } }>(
			this.id,
			`${API}/media/upload/${mediaId}/finalize`,
			{ method: "POST", headers: auth, classify: this.classify },
		);
		await this.waitForProcessing(channel, mediaId, fin.data.processing_info);

		if (media.altText) {
			// https://docs.x.com/x-api/media/create-media-metadata
			await providerJson<unknown>(this.id, `${API}/media/metadata`, {
				method: "POST",
				headers: { ...auth, "Content-Type": "application/json" },
				body: JSON.stringify({
					id: mediaId,
					metadata: { alt_text: { text: media.altText.slice(0, 1000) } },
				}),
				classify: this.classify,
			});
		}
		return mediaId;
	}

	/**
	 * Videos/GIFs are transcoded asynchronously. Nothing is visible yet, so waiting
	 * here (bounded) is simpler than a `processing` round-trip through the worker;
	 * if it takes too long we fail as `transient` and the whole upload is redone.
	 */
	private async waitForProcessing(
		channel: ChannelContext,
		mediaId: string,
		initial?: ProcessingInfo,
	) {
		let info = initial;
		const deadline = Date.now() + MAX_PROCESSING_WAIT_MS;
		while (info && (info.state === "pending" || info.state === "in_progress")) {
			if (Date.now() > deadline) {
				throw new ProviderError("transient", this.id, "X media processing did not finish in time");
			}
			await sleep(Math.min(Math.max(info.check_after_secs ?? 5, 1), 30) * 1000);
			const status = await providerJson<{ data: { processing_info?: ProcessingInfo } }>(
				this.id,
				`${API}/media/upload?${form({ media_id: mediaId, command: "STATUS" })}`,
				{ headers: { Authorization: `Bearer ${channel.accessToken}` }, classify: this.classify },
			);
			info = status.data.processing_info;
		}
		if (info?.state === "failed") {
			throw new ProviderError(
				"invalid_request",
				this.id,
				`X could not process the media: ${info.error?.message ?? info.error?.name ?? "unknown error"}`,
			);
		}
	}
}
