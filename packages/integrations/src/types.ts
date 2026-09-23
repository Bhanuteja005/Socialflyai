import type { Logger } from "@socialfly/core/logger";
import type { z } from "zod";

/**
 * The contract every social platform adapter implements.
 *
 * Design rules (they exist because each one was a production incident somewhere):
 *
 *  1. Adapters are STATELESS and never touch the database or queues. They get
 *     tokens and media URLs in, and return results out. Persistence, retries and
 *     scheduling belong to apps/worker; OAuth state belongs to apps/api.
 *  2. Every failure is a `ProviderError` with a `kind` that tells the caller what
 *     is SAFE to do next (see errors.ts). An adapter never retries a mutating call
 *     itself: only the caller knows whether a retry could double-post.
 *  3. Platform limits (length, media count, formats) are declared as data in
 *     `capabilities`, so the web composer validates before the user schedules,
 *     instead of the worker failing at publish time.
 */

export type ProviderId =
	| "linkedin"
	| "linkedin_page"
	| "facebook"
	| "instagram"
	| "threads"
	| "x"
	| "reddit"
	| "youtube";

export type MediaKind = "image" | "video";

export type Capabilities = {
	/** Max characters of post text (platform counting rules applied by `textLength`). */
	maxTextLength: number;
	/** Text is optional when media is present (IG, YouTube) — or required (X, LinkedIn). */
	requiresText: boolean;
	requiresMedia: boolean;
	maxImages: number;
	maxVideos: number;
	/** Can images and videos be mixed in one post (IG carousel can; LinkedIn cannot). */
	mixedMedia: boolean;
	imageMimeTypes: string[];
	videoMimeTypes: string[];
	maxImageBytes: number;
	maxVideoBytes: number;
	maxVideoDurationSeconds?: number;
};

export type OAuthConfig = {
	redirectUri: string;
	/** Opaque CSRF state generated and verified by the API. */
	state: string;
};

export type AuthorizationRequest = {
	url: string;
	/** PKCE verifier; the API stores it next to `state` and hands it back on callback. */
	codeVerifier?: string;
};

export type TokenSet = {
	accessToken: string;
	refreshToken?: string | null;
	expiresAt?: Date | null;
	scopes: string[];
};

/** One publishable destination discovered during OAuth (a profile, page, IG account...). */
export type DiscoveredAccount = {
	externalId: string;
	name: string;
	username?: string | null;
	avatarUrl?: string | null;
	profileUrl?: string | null;
	/** Tokens specific to this account (Facebook page tokens). Falls back to the connection's tokens. */
	tokens?: TokenSet;
	metadata?: Record<string, unknown>;
};

export type ConnectResult = {
	tokens: TokenSet;
	/**
	 * Accounts the user can add. Personal-profile providers return exactly one;
	 * page-based providers (Facebook, Instagram, LinkedIn pages) may return many
	 * and the web app asks the user which to connect.
	 */
	accounts: DiscoveredAccount[];
};

export type MediaItem = {
	/** Publicly fetchable URL (platforms like IG/Threads pull media themselves). */
	url: string;
	kind: MediaKind;
	mimeType: string;
	sizeBytes: number;
	width?: number | null;
	height?: number | null;
	durationMs?: number | null;
	altText?: string | null;
};

export type PublishInput<TSettings = Record<string, unknown>> = {
	text: string;
	media: MediaItem[];
	/** Already validated against the provider's `settingsSchema`. */
	settings: TSettings;
};

/** The channel as the adapter sees it: identity + a decrypted, fresh access token. */
export type ChannelContext = {
	externalId: string;
	accessToken: string;
	metadata: Record<string, unknown>;
	logger: Logger;
};

export type PublishOutcome =
	| { status: "published"; externalId: string; url: string | null }
	/**
	 * Accepted but still processing on the platform side (IG video container,
	 * YouTube upload). The worker calls `checkStatus` with `pendingData` until it
	 * resolves. `pendingData` must be JSON-serialisable.
	 */
	| { status: "processing"; pendingData: Record<string, unknown>; pollAfterMs: number };

export interface SocialProvider<
	TSettings extends Record<string, unknown> = Record<string, unknown>,
> {
	readonly id: ProviderId;
	readonly displayName: string;
	readonly capabilities: Capabilities;
	/** Per-target options (subreddit, video title, first comment...). */
	readonly settingsSchema: z.ZodType<TSettings>;
	/**
	 * App-wide publish rate the worker enforces with a BullMQ limiter on this
	 * provider's queue. Conservative by design: being throttled is cheap, getting
	 * the app's API access suspended is not.
	 */
	readonly publishRateLimit: { max: number; durationMs: number };

	/** False when the app credentials are missing — the provider is hidden, not broken. */
	isConfigured(): boolean;

	getAuthorizationUrl(config: OAuthConfig): Promise<AuthorizationRequest>;
	exchangeCode(input: {
		code: string;
		redirectUri: string;
		codeVerifier?: string;
	}): Promise<ConnectResult>;
	/** Absent for platforms whose tokens cannot be refreshed (the user reconnects instead). */
	refreshTokens?(refreshToken: string): Promise<TokenSet>;

	/** Platform-specific checks beyond `capabilities` (e.g. IG needs 4:5..1.91:1 images). */
	validate?(input: PublishInput<TSettings>): string[];

	publish(channel: ChannelContext, input: PublishInput<TSettings>): Promise<PublishOutcome>;
	checkStatus?(
		channel: ChannelContext,
		pendingData: Record<string, unknown>,
	): Promise<PublishOutcome>;
}
