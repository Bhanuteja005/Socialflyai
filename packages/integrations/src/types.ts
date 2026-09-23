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

/**
 * Normalised engagement numbers. Every field is optional: platforms expose
 * different metrics (X has no "saves", LinkedIn pages no "video views") and a
 * missing number must stay "unknown", never become 0.
 */
export type PostMetrics = {
	impressions?: number;
	reach?: number;
	likes?: number;
	comments?: number;
	shares?: number;
	saves?: number;
	clicks?: number;
	videoViews?: number;
};

export type AccountMetricsDay = {
	/** UTC calendar day, YYYY-MM-DD. */
	date: string;
	followers?: number;
	impressions?: number;
	reach?: number;
	profileViews?: number;
};

/**
 * Read-only analytics. Optional per provider: a platform (or a scope we do not
 * hold) without an analytics API simply lacks this and is skipped. Stateless
 * like publishing: token in, numbers out, typed ProviderError on failure.
 */
export interface AnalyticsSupport {
	/**
	 * Metrics for published posts, keyed by the externalId publish() returned.
	 * Posts the platform no longer knows (deleted) are omitted from the result.
	 * Callers pass at most `maxPostsPerCall` ids.
	 */
	getPostMetrics(
		channel: ChannelContext,
		externalIds: string[],
	): Promise<Record<string, PostMetrics>>;
	readonly maxPostsPerCall: number;
	/** Daily account-level numbers for [since, until] (UTC days, inclusive). */
	getAccountMetrics?(
		channel: ChannelContext,
		range: { since: string; until: string },
	): Promise<AccountMetricsDay[]>;
}

/** Someone on the platform. Never trusted for anything but display. */
export type EngagementAuthor = {
	externalId: string | null;
	name: string | null;
	/** @handle / username without the @. */
	handle: string | null;
	avatarUrl: string | null;
	profileUrl: string | null;
};

/**
 * One thing a person said that the brand may want to answer: a comment on our
 * post, a reply in a thread under it, or a public mention of the account.
 */
export type EngagementItem = {
	/** Platform id of the comment/reply/mention — what `reply()` answers. */
	externalId: string;
	kind: "comment" | "reply" | "mention";
	/** externalId of OUR post it belongs to (as publish() returned it); null for mentions. */
	postExternalId: string | null;
	/** Direct parent (a comment id for replies); null for top-level comments and mentions. */
	parentExternalId: string | null;
	author: EngagementAuthor;
	/** True when the author is the channel itself (our own replies) — shown, never answered. */
	fromSelf: boolean;
	text: string;
	url: string | null;
	createdAt: string; // ISO
};

/** A public post found by keyword listening (not addressed to us). */
export type DiscussionItem = {
	externalId: string;
	author: EngagementAuthor;
	title: string | null;
	text: string;
	url: string | null;
	/** Where it was found, e.g. "r/marketing". */
	community: string | null;
	createdAt: string;
	score: number | null;
	commentCount: number | null;
};

/**
 * Comments, mentions, replies and listening. Optional per provider, like
 * analytics. `reply` creates a VISIBLE public post: it is mutating, and an
 * unknown outcome must be reported as ProviderError kind `unknown_outcome` so
 * the caller marks it unconfirmed instead of retrying into a double reply.
 */
export interface EngagementSupport {
	/** OAuth scopes needed (checked against channels.scopes to explain what a reconnect unlocks). */
	readonly requiredScopes: { read: string[]; reply: string[] };
	/**
	 * Comments/replies on the given posts newer than `since`. Posts the platform no
	 * longer knows are skipped silently.
	 */
	listComments(
		channel: ChannelContext,
		input: { postExternalIds: string[]; since: string | null },
	): Promise<EngagementItem[]>;
	readonly maxPostsPerCall: number;
	/** Public mentions of the account newer than `since` (where the platform exposes them). */
	listMentions?(
		channel: ChannelContext,
		input: { since: string | null },
	): Promise<EngagementItem[]>;
	/** Post a public reply. Returns the new item's id and link. */
	reply(
		channel: ChannelContext,
		input: {
			toExternalId: string;
			kind: EngagementItem["kind"];
			postExternalId: string | null;
			text: string;
		},
	): Promise<{ externalId: string; url: string | null }>;
	readonly maxReplyLength: number;
	/** Keyword listening across the platform's public content (Reddit search, X recent search). */
	searchDiscussions?(
		channel: ChannelContext,
		input: { query: string; since: string | null; limit: number },
	): Promise<DiscussionItem[]>;
}

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

	/** Present when the platform exposes analytics we can read with the granted scopes. */
	readonly analytics?: AnalyticsSupport;

	/** Present when the platform lets us read and answer comments/mentions. */
	readonly engagement?: EngagementSupport;
	checkStatus?(
		channel: ChannelContext,
		pendingData: Record<string, unknown>,
	): Promise<PublishOutcome>;
}
