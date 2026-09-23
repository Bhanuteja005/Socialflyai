import { z } from "zod";
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
	Capabilities,
	ChannelContext,
	ConnectResult,
	MediaItem,
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
 * are always 23, CJK/emoji count 2) — that counting is not implemented yet, so
 * the composer's plain count can accept a post X then rejects, or vice versa.
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
