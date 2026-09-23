import { z } from "zod";
import { compact, num } from "../analytics";
import { ProviderError } from "../errors";
import { expiresAtFrom, form, providerJson } from "../http";
import type {
	AnalyticsSupport,
	Capabilities,
	ChannelContext,
	ConnectResult,
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
