import { z } from "zod";
import { compact, num } from "../analytics";
import { checkReplyText, finalizeItems, MAX_PAGES_PER_POST, toIso } from "../engagement";
import { isProviderError, ProviderError } from "../errors";
import { expiresAtFrom, form, providerJson } from "../http";
import type {
	AnalyticsSupport,
	Capabilities,
	ChannelContext,
	ConnectResult,
	DiscussionItem,
	EngagementItem,
	EngagementSupport,
	PostMetrics,
	PublishInput,
	PublishOutcome,
	SocialProvider,
	TokenSet,
} from "../types";

/**
 * Reddit — user accounts posting to subreddits.
 *
 * Every call must carry a descriptive User-Agent ("<platform>:<app id>:<version>
 * (by /u/<user>)"); Reddit throttles or blocks generic ones outright.
 * https://github.com/reddit-archive/reddit/wiki/API
 *
 * Docs: https://www.reddit.com/dev/api
 */

export type RedditConfig = { clientId: string; clientSecret: string; userAgent: string };

const AUTH_URL = "https://www.reddit.com/api/v1/authorize";
const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const API = "https://oauth.reddit.com";

/**
 * Self-post body up to 40,000 chars (https://www.reddit.com/dev/api#POST_api_submit).
 *
 * Media is disabled: native image/video posts go through `/api/media/asset.json`,
 * an undocumented S3-lease flow the official API reference does not cover. Until
 * we implement it deliberately, users post a link instead.
 */
const capabilities: Capabilities = {
	maxTextLength: 40_000,
	requiresText: false,
	requiresMedia: false,
	maxImages: 0,
	maxVideos: 0,
	mixedMedia: false,
	imageMimeTypes: [],
	videoMimeTypes: [],
	maxImageBytes: 0,
	maxVideoBytes: 0,
};

/** Accepts "foo", "r/foo", "/r/foo/" — users paste all of them. */
export const normalizeSubreddit = (value: string) =>
	value
		.trim()
		.replace(/^\/?r\//i, "")
		.replace(/\/+$/, "");

export const settingsSchema = z.object({
	subreddit: z
		.string()
		.transform(normalizeSubreddit)
		.pipe(z.string().regex(/^[A-Za-z0-9_]{2,21}$/, "Enter a valid subreddit name")),
	// Reddit counts the title in characters, max 300.
	title: z
		.string()
		.trim()
		.min(1, "A Reddit post needs a title")
		.max(300, "Reddit titles are at most 300 characters"),
	/** Turns the post into a link post. */
	url: z.url({ protocol: /^https?$/, message: "Enter a valid http(s) link" }).optional(),
	flairId: z.string().trim().min(1).optional(),
	nsfw: z.boolean().default(false),
	spoiler: z.boolean().default(false),
});
type Settings = z.infer<typeof settingsSchema>;

const SCOPES = ["identity", "submit", "read", "flair"];

type TokenResponse = {
	access_token?: string;
	refresh_token?: string;
	expires_in?: number;
	scope?: string;
	error?: string;
};

/** Reddit's `api_type=json` error triple: [CODE, human message, field]. */
export type RedditApiError = [string, string, string?];

type SubmitResponse = {
	json?: {
		errors?: RedditApiError[];
		ratelimit?: number;
		data?: { url?: string; id?: string; name?: string };
	};
};

const UNIT_MS: Record<string, number> = {
	millisecond: 1,
	second: 1000,
	minute: 60_000,
	hour: 3_600_000,
};
const DEFAULT_RATELIMIT_MS = 10 * 60_000;

/** "Take a break for 9 minutes before trying again." → 540000. */
export function parseRedditRetryMs(message: string): number | undefined {
	const match = /(\d+)\s*(millisecond|second|minute|hour)s?/i.exec(message);
	if (!match?.[1] || !match[2]) return undefined;
	return Number(match[1]) * (UNIT_MS[match[2].toLowerCase()] ?? 60_000);
}

/** Codes that mean the session is not a usable logged-in user. */
const AUTH_CODES = new Set(["USER_REQUIRED", "INVALID_USER"]);

/**
 * Reddit reports submit failures as HTTP 200 with `json.errors`. Each of these was
 * rejected BEFORE anything was created, so none of them is `unknown_outcome`.
 */
export function redditErrorsToProviderError(
	provider: string,
	errors: RedditApiError[],
	ratelimitSeconds?: number,
): ProviderError {
	const message = errors.map(([code, text]) => `${code}: ${text}`).join("; ");
	const codes = errors.map(([code]) => code);
	const platformCode = codes.join(",");

	const ratelimit = errors.find(([code]) => code === "RATELIMIT");
	if (ratelimit) {
		const retryAfterMs =
			ratelimitSeconds !== undefined
				? Math.ceil(ratelimitSeconds * 1000)
				: (parseRedditRetryMs(ratelimit[1]) ?? DEFAULT_RATELIMIT_MS);
		return new ProviderError("rate_limited", provider, message, { platformCode, retryAfterMs });
	}
	if (codes.some((c) => AUTH_CODES.has(c))) {
		return new ProviderError("auth", provider, message, { platformCode });
	}
	// SUBREDDIT_NOEXIST, SUBREDDIT_NOTALLOWED, NO_SELFS, NO_LINKS, TOO_LONG,
	// SUBMIT_VALIDATION_FLAIR_REQUIRED, ALREADY_SUB, BAD_URL, ... — content problems.
	return new ProviderError("invalid_request", provider, message, { platformCode });
}

/** /api/info takes up to 100 fullnames — Reddit's listing page size. */
const REDDIT_INFO_MAX_IDS = 100;

type RedditLink = {
	name: string;
	score?: number;
	num_comments?: number;
	author?: string;
	removed_by_category?: string | null;
};

/**
 * A post its author deleted still comes back from /api/info (author "[deleted]",
 * removed_by_category "deleted"); for our purposes it no longer exists.
 * Moderator-removed posts keep their author and still count.
 */
export const isDeletedRedditPost = (p: RedditLink) =>
	p.removed_by_category === "deleted" || p.author === "[deleted]";

/**
 * Reddit only exposes the net vote `score` (upvotes minus downvotes, fuzzed) —
 * the nearest thing to likes. No views, impressions or shares via the API.
 */
export const mapRedditLink = (p: RedditLink): PostMetrics =>
	compact({ likes: num(p.score), comments: num(p.num_comments) });

/** Token endpoint: a dead refresh token is `invalid_grant` (sometimes with HTTP 200). */
const classifyToken = (provider: string) => (status: number, body: string) =>
	status === 400 && body.includes("invalid_grant")
		? new ProviderError("auth", provider, "Reddit rejected the authorization grant", {
				status,
				body,
			})
		: undefined;

/** Reddit's comment box limit (same as /api/comment's `text`). */
const REDDIT_MAX_COMMENT_CHARS = 10_000;
/**
 * Posts read per engagement call. One request per post against Reddit's
 * ~100 requests/minute per OAuth client, shared with everything else.
 */
const REDDIT_ENGAGEMENT_MAX_POSTS = 10;
/** /comments/{article}: comments per request (Reddit's own cap is 500) and tree depth. */
const REDDIT_COMMENTS_LIMIT = 500;
const REDDIT_COMMENTS_DEPTH = 10;
const REDDIT_SEARCH_PAGE = 100;

type RedditThing<T> = { kind: string; data: T };
type RedditListing<T> = {
	kind?: string;
	data?: { children?: RedditThing<T>[]; after?: string | null };
};

type RedditComment = {
	id?: string;
	name?: string;
	author?: string;
	author_fullname?: string;
	body?: string;
	created_utc?: number;
	parent_id?: string;
	permalink?: string;
	replies?: RedditListing<RedditComment> | "";
};

type RedditSearchLink = {
	name?: string;
	author?: string;
	author_fullname?: string;
	title?: string;
	selftext?: string;
	permalink?: string;
	subreddit_name_prefixed?: string;
	created_utc?: number;
	score?: number;
	num_comments?: number;
};

const REDDIT_WEB = "https://www.reddit.com";

const redditAuthor = (name: string | undefined, fullname: string | undefined) => {
	const known = name && name !== "[deleted]" ? name : null;
	return {
		externalId: fullname ?? null,
		name: known,
		handle: known,
		avatarUrl: null,
		profileUrl: known ? `${REDDIT_WEB}/user/${known}` : null,
	};
};

/**
 * Flattens a /comments/{article} tree into inbox items. `more` stubs (the
 * "load more comments" placeholders) are skipped, not expanded: expanding costs
 * a request each and the newest comments come first with sort=new anyway.
 * Deleted/removed comments are dropped — there is nothing left to answer.
 */
export function flattenRedditComments(
	listing: RedditListing<RedditComment> | "" | undefined,
	postFullname: string,
	ownUsername: string | null,
): EngagementItem[] {
	const out: EngagementItem[] = [];
	const walk = (node: RedditListing<RedditComment> | "" | undefined) => {
		if (!node || typeof node !== "object") return;
		for (const child of node.data?.children ?? []) {
			if (child.kind !== "t1") continue;
			const c = child.data;
			walk(c.replies);
			const createdAt = c.created_utc !== undefined ? toIso(c.created_utc * 1000) : null;
			const gone = c.author === "[deleted]" && (c.body === "[deleted]" || c.body === "[removed]");
			if (!c.name || !createdAt || gone) continue;
			const topLevel =
				!c.parent_id || c.parent_id === postFullname || c.parent_id.startsWith("t3_");
			out.push({
				externalId: c.name,
				kind: topLevel ? "comment" : "reply",
				postExternalId: postFullname,
				parentExternalId: topLevel ? null : (c.parent_id ?? null),
				author: redditAuthor(c.author, c.author_fullname),
				fromSelf: ownUsername !== null && c.author?.toLowerCase() === ownUsername.toLowerCase(),
				text: c.body ?? "",
				url: c.permalink ? `${REDDIT_WEB}${c.permalink}` : null,
				createdAt,
			});
		}
	};
	walk(listing);
	return out;
}

/** Smallest Reddit search window (`t`) that still covers `since`; a week without one. */
export function redditSearchWindow(since: string | null, now: Date = new Date()): string {
	const s = since ? Date.parse(since) : Number.NaN;
	if (Number.isNaN(s)) return "week";
	const age = now.getTime() - s;
	const hour = 3_600_000;
	if (age <= hour) return "hour";
	if (age <= 24 * hour) return "day";
	if (age <= 7 * 24 * hour) return "week";
	if (age <= 31 * 24 * hour) return "month";
	if (age <= 366 * 24 * hour) return "year";
	return "all";
}

/**
 * Reddit answers a read of a private/quarantined/banned subreddit's post with
 * 403 + a JSON `reason`. That is about the post, not our token: invalid_request,
 * so the post is skipped instead of the channel being sent to needs_reauth.
 */
export function classifyRedditRead(provider: string) {
	return (status: number, body: string): ProviderError | undefined => {
		if (status !== 403) return undefined;
		try {
			const parsed = JSON.parse(body) as { reason?: string };
			if (typeof parsed.reason === "string") {
				return new ProviderError("invalid_request", provider, `Reddit: ${parsed.reason}`, {
					status,
					body,
					platformCode: parsed.reason,
				});
			}
		} catch {
			// Not JSON: fall through to the default mapping.
		}
		return undefined;
	};
}

export class RedditProvider implements SocialProvider<Settings> {
	readonly id = "reddit" as const;
	readonly displayName = "Reddit";
	readonly capabilities = capabilities;
	readonly settingsSchema = settingsSchema as z.ZodType<Settings>;
	// Reddit's anti-spam RATELIMIT triggers quickly for new/low-karma accounts; go slow.
	readonly publishRateLimit = { max: 1, durationMs: 10_000 };

	constructor(private readonly config: RedditConfig) {}

	isConfigured() {
		return Boolean(this.config.clientId && this.config.clientSecret && this.config.userAgent);
	}

	/** Uses the `read` scope, already requested. Reddit has no account-level analytics API. */
	readonly analytics: AnalyticsSupport = {
		maxPostsPerCall: REDDIT_INFO_MAX_IDS,
		getPostMetrics: (channel, ids) => this.getPostMetrics(channel, ids),
	};

	/**
	 * publish() stores the `t3_…` fullname, exactly what /api/info takes.
	 * https://www.reddit.com/dev/api#GET_api_info
	 */
	private async getPostMetrics(
		channel: ChannelContext,
		ids: string[],
	): Promise<Record<string, PostMetrics>> {
		if (ids.length === 0) return {};
		const res = await providerJson<{ data?: { children?: { data: RedditLink }[] } }>(
			this.id,
			`${API}/api/info?${form({ id: ids.join(","), raw_json: "1" })}`,
			{ headers: this.headers(channel.accessToken) },
		);
		const out: Record<string, PostMetrics> = {};
		for (const { data } of res.data?.children ?? []) {
			if (!isDeletedRedditPost(data)) out[data.name] = mapRedditLink(data);
		}
		return out;
	}

	/**
	 * Comments on our submissions, replies, and keyword listening. Reading uses
	 * `read`, replying `submit` — both already requested.
	 *
	 * No `listMentions`: username mentions live in /message/mentions, which needs
	 * the `privatemessages` scope we do not request (it would also expose the
	 * user's private messages to us, a lot to ask for a mention feed).
	 * https://www.reddit.com/dev/api
	 */
	readonly engagement: EngagementSupport = {
		requiredScopes: { read: ["read"], reply: ["submit"] },
		maxPostsPerCall: REDDIT_ENGAGEMENT_MAX_POSTS,
		maxReplyLength: REDDIT_MAX_COMMENT_CHARS,
		listComments: (channel, input) => this.listComments(channel, input),
		reply: (channel, input) => this.replyToThing(channel, input),
		searchDiscussions: (channel, input) => this.searchDiscussions(channel, input),
	};

	/**
	 * GET /comments/{article}?sort=new — one request per post returns the whole
	 * tree up to `limit`/`depth`; `raw_json=1` stops Reddit HTML-escaping the text.
	 * https://www.reddit.com/dev/api#GET_comments_{article}
	 */
	private async listComments(
		channel: ChannelContext,
		input: { postExternalIds: string[]; since: string | null },
	): Promise<EngagementItem[]> {
		const own = typeof channel.metadata.username === "string" ? channel.metadata.username : null;
		const items: EngagementItem[] = [];
		for (const fullname of input.postExternalIds) {
			if (!/^t3_[a-z0-9]+$/i.test(fullname)) continue;
			try {
				const res = await providerJson<RedditListing<unknown>[]>(
					this.id,
					`${API}/comments/${fullname.slice(3)}?${form({
						sort: "new",
						limit: String(REDDIT_COMMENTS_LIMIT),
						depth: String(REDDIT_COMMENTS_DEPTH),
						raw_json: "1",
					})}`,
					{ headers: this.headers(channel.accessToken), classify: classifyRedditRead(this.id) },
				);
				const comments = Array.isArray(res)
					? (res[1] as RedditListing<RedditComment> | undefined)
					: undefined;
				items.push(...flattenRedditComments(comments, fullname, own));
			} catch (error) {
				// Deleted post (404) or a subreddit we can no longer read (403 + reason): skip it.
				if (isProviderError(error) && error.kind === "invalid_request") continue;
				throw error;
			}
		}
		return finalizeItems(items, input.since);
	}

	/**
	 * POST /api/comment answers a post (t3_) or comment (t1_). Like /api/submit,
	 * failures come back as HTTP 200 + `json.errors`, all raised before anything
	 * was created (RATELIMIT, THREAD_LOCKED, DELETED_COMMENT, TOO_LONG...).
	 * https://www.reddit.com/dev/api#POST_api_comment
	 */
	private async replyToThing(
		channel: ChannelContext,
		input: { toExternalId: string; text: string },
	): Promise<{ externalId: string; url: string | null }> {
		if (!/^t[13]_[a-z0-9]+$/i.test(input.toExternalId)) {
			throw new ProviderError("invalid_request", this.id, "Not a Reddit post or comment id");
		}
		const text = checkReplyText(this.id, input.text, REDDIT_MAX_COMMENT_CHARS);
		const res = await providerJson<{
			json?: {
				errors?: RedditApiError[];
				ratelimit?: number;
				data?: { things?: RedditThing<{ name?: string; permalink?: string }>[] };
			};
		}>(this.id, `${API}/api/comment`, {
			method: "POST",
			mutating: true,
			headers: {
				...this.headers(channel.accessToken),
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: form({ api_type: "json", thing_id: input.toExternalId, text }),
		});
		const errors = res.json?.errors ?? [];
		if (errors.length > 0) throw redditErrorsToProviderError(this.id, errors, res.json?.ratelimit);
		const created = res.json?.data?.things?.[0]?.data;
		if (!created?.name) {
			throw new ProviderError(
				"unknown_outcome",
				this.id,
				"Reddit accepted the comment but returned no id",
			);
		}
		return {
			externalId: created.name,
			url: created.permalink ? `${REDDIT_WEB}${created.permalink}` : null,
		};
	}

	/**
	 * Site-wide search for posts (not comments), newest first, `t` just wide
	 * enough to cover `since`, following `after` for at most MAX_PAGES_PER_POST pages.
	 * https://www.reddit.com/dev/api#GET_search
	 */
	private async searchDiscussions(
		channel: ChannelContext,
		input: { query: string; since: string | null; limit: number },
	): Promise<DiscussionItem[]> {
		const q = input.query.trim();
		if (!q) throw new ProviderError("invalid_request", this.id, "Listening query is empty");
		const limit = Math.max(
			1,
			Math.min(Math.floor(input.limit), REDDIT_SEARCH_PAGE * MAX_PAGES_PER_POST),
		);
		const t = redditSearchWindow(input.since);
		const links: RedditSearchLink[] = [];
		let after: string | null | undefined;
		for (let page = 0; page < MAX_PAGES_PER_POST && links.length < limit; page++) {
			const res = await providerJson<RedditListing<RedditSearchLink>>(
				this.id,
				`${API}/search?${form({
					q,
					sort: "new",
					t,
					type: "link",
					restrict_sr: "false",
					limit: String(Math.min(REDDIT_SEARCH_PAGE, limit)),
					raw_json: "1",
					...(after ? { after } : {}),
				})}`,
				{ headers: this.headers(channel.accessToken) },
			);
			links.push(...(res.data?.children ?? []).map((c) => c.data));
			after = res.data?.after;
			if (!after) break;
		}
		const items: DiscussionItem[] = [];
		for (const l of links) {
			const createdAt = l.created_utc !== undefined ? toIso(l.created_utc * 1000) : null;
			if (!l.name || !createdAt) continue;
			items.push({
				externalId: l.name,
				author: redditAuthor(l.author, l.author_fullname),
				title: l.title ?? null,
				text: l.selftext ?? "",
				url: l.permalink ? `${REDDIT_WEB}${l.permalink}` : null,
				community: l.subreddit_name_prefixed ?? null,
				createdAt,
				score: num(l.score) ?? null,
				commentCount: num(l.num_comments) ?? null,
			});
		}
		// Newest `limit` items, oldest first like every other engagement list.
		return finalizeItems(items, input.since).slice(-limit);
	}

	validate(input: PublishInput<Settings>): string[] {
		// /api/submit has no body field for kind=link; silently dropping text would surprise users.
		return input.settings.url && input.text.trim()
			? ["Reddit link posts cannot have body text — remove the text or the link"]
			: [];
	}

	/** https://github.com/reddit-archive/reddit/wiki/OAuth2 */
	async getAuthorizationUrl({ redirectUri, state }: { redirectUri: string; state: string }) {
		const url = new URL(AUTH_URL);
		url.search = form({
			client_id: this.config.clientId,
			response_type: "code",
			state,
			redirect_uri: redirectUri,
			duration: "permanent",
			scope: SCOPES.join(" "),
		});
		return { url: url.toString() };
	}

	private headers(accessToken?: string): Record<string, string> {
		return {
			"User-Agent": this.config.userAgent,
			...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
		};
	}

	private async requestToken(
		params: Record<string, string>,
	): Promise<TokenResponse & { access_token: string }> {
		const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString(
			"base64",
		);
		const t = await providerJson<TokenResponse>(this.id, TOKEN_URL, {
			method: "POST",
			headers: {
				...this.headers(),
				Authorization: `Basic ${basic}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: form(params),
			classify: classifyToken(this.id),
		});
		if (t.error || !t.access_token) {
			throw new ProviderError(
				"auth",
				this.id,
				`Reddit token request failed: ${t.error ?? "no access token"}`,
				{
					platformCode: t.error,
				},
			);
		}
		return { ...t, access_token: t.access_token };
	}

	private toTokens(
		t: TokenResponse & { access_token: string },
		fallbackRefresh: string | null,
	): TokenSet {
		return {
			accessToken: t.access_token,
			refreshToken: t.refresh_token ?? fallbackRefresh,
			expiresAt: expiresAtFrom(t.expires_in),
			scopes: t.scope?.split(/[ ,]/).filter(Boolean) ?? SCOPES,
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
		// https://www.reddit.com/dev/api#GET_api_v1_me
		const me = await providerJson<{
			id: string;
			name: string;
			icon_img?: string;
			snoovatar_img?: string;
		}>(this.id, `${API}/api/v1/me`, { headers: this.headers(tokens.accessToken) });
		// Reddit returns HTML-escaped URLs in JSON (&amp;).
		const avatar = (me.snoovatar_img || me.icon_img || "").replace(/&amp;/g, "&") || null;
		return {
			tokens,
			accounts: [
				{
					externalId: me.id,
					name: me.name,
					username: me.name,
					avatarUrl: avatar,
					profileUrl: `https://www.reddit.com/user/${me.name}`,
					metadata: { username: me.name },
				},
			],
		};
	}

	/** Reddit does not rotate refresh tokens: keep the one we have if none comes back. */
	async refreshTokens(refreshToken: string): Promise<TokenSet> {
		return this.toTokens(
			await this.requestToken({ grant_type: "refresh_token", refresh_token: refreshToken }),
			refreshToken,
		);
	}

	/** https://www.reddit.com/dev/api#POST_api_submit */
	async publish(channel: ChannelContext, input: PublishInput<Settings>): Promise<PublishOutcome> {
		const s = input.settings;
		const res = await providerJson<SubmitResponse>(this.id, `${API}/api/submit`, {
			method: "POST",
			mutating: true,
			headers: {
				...this.headers(channel.accessToken),
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: form({
				api_type: "json",
				sr: s.subreddit,
				title: s.title,
				...(s.url ? { kind: "link", url: s.url } : { kind: "self", text: input.text }),
				...(s.flairId ? { flair_id: s.flairId } : {}),
				nsfw: String(s.nsfw),
				spoiler: String(s.spoiler),
				resubmit: "true",
				sendreplies: "true",
			}),
		});

		const errors = res.json?.errors ?? [];
		if (errors.length > 0) throw redditErrorsToProviderError(this.id, errors, res.json?.ratelimit);

		const data = res.json?.data;
		if (!data?.name) {
			// 200 with neither errors nor a post id: we cannot tell whether it went through.
			throw new ProviderError(
				"unknown_outcome",
				this.id,
				"Reddit accepted the submission but returned no id",
			);
		}
		return { status: "published", externalId: data.name, url: data.url ?? null };
	}
}
