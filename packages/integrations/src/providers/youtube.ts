import { z } from "zod";
import { ProviderError } from "../errors";
import { expiresAtFrom, fetchMediaBytes, form, providerFetch, providerJson } from "../http";
import type {
	Capabilities,
	ChannelContext,
	ConnectResult,
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

const SCOPES = [
	"https://www.googleapis.com/auth/youtube.upload",
	"https://www.googleapis.com/auth/youtube.readonly",
	"https://www.googleapis.com/auth/userinfo.profile",
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
	return undefined;
}

type TokenResponse = {
	access_token: string;
	refresh_token?: string;
	expires_in?: number;
	scope?: string;
};

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
