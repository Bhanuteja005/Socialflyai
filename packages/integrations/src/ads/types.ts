import type { Logger } from "@socialfly/core/logger";
import type { AuthorizationRequest, MediaItem, OAuthConfig, TokenSet } from "../types";

/**
 * Ad platforms (Phase 7). Separate from SocialProvider: an ad account is a
 * different connection (different OAuth permissions, often a different app and
 * access approval) from the page or profile we publish organic posts to.
 *
 * MONEY SAFETY — rules every adapter follows:
 *  1. `createCampaign` ALWAYS creates everything PAUSED. Spending starts only
 *     through an explicit `setStatus(..., "active")` the user confirmed.
 *  2. Every create/update/status call is MUTATING: an unknown outcome is
 *     ProviderError kind "unknown_outcome" and is never retried automatically.
 *  3. Budgets are validated before any call (`validate`), in the ad account's
 *     currency, and the caller enforces a hard daily ceiling on top.
 */

export type AdsProviderId =
	| "meta_ads"
	| "google_ads"
	| "linkedin_ads"
	| "tiktok_ads"
	| "pinterest_ads"
	| "x_ads";

export type AdObjective =
	| "awareness"
	| "traffic"
	| "engagement"
	| "leads"
	| "sales"
	| "video_views"
	| "app_installs";

export type AdFormat = "image" | "video" | "carousel" | "search";

export type AdAccount = {
	externalId: string;
	name: string;
	/** ISO 4217, e.g. "USD". Budgets and spend are in this currency. */
	currency: string;
	timezone: string | null;
	/** Platform account status normalised: can we create campaigns in it right now? */
	status: "active" | "disabled" | "pending";
	metadata?: Record<string, unknown>;
};

export type TargetingOption = {
	id: string;
	name: string;
	type: "interest" | "location" | "job_title" | "industry" | "keyword";
};

export type Targeting = {
	/** ISO 3166-1 alpha-2 country codes. At least one. */
	countries: string[];
	/** Finer locations from searchTargeting (cities/regions), optional. */
	locations?: TargetingOption[];
	ageMin?: number;
	ageMax?: number;
	genders?: ("male" | "female")[];
	/** ISO 639-1. */
	languages?: string[];
	interests?: TargetingOption[];
	/** Search keywords (Google) or B2B facets (LinkedIn job titles/industries). */
	keywords?: string[];
	jobTitles?: TargetingOption[];
	industries?: TargetingOption[];
};

export type AdDraft = {
	name: string;
	format: AdFormat;
	/** Main copy shown above/with the creative. */
	primaryText: string;
	headline?: string;
	description?: string;
	/** Platform-neutral CTA; adapters map to their enum or reject. */
	callToAction?:
		| "learn_more"
		| "shop_now"
		| "sign_up"
		| "contact_us"
		| "download"
		| "book_now"
		| "get_quote"
		| "subscribe";
	destinationUrl: string;
	/** Public URLs from our storage (same shape publishing uses). */
	media: MediaItem[];
	/** Responsive search ads: 3–15 headlines, 2–4 descriptions. */
	searchHeadlines?: string[];
	searchDescriptions?: string[];
};

export type CampaignDraft = {
	name: string;
	objective: AdObjective;
	/** Exactly one of daily or lifetime, in the account currency's major units (e.g. 25.50). */
	dailyBudget?: number;
	lifetimeBudget?: number;
	startAt: string; // ISO
	endAt: string | null; // required with lifetimeBudget
	targeting: Targeting;
	ads: AdDraft[];
};

/** The ad account as the adapter sees it: identity + fresh token. */
export type AdsContext = {
	accountExternalId: string;
	accessToken: string;
	/** OAuth 1.0a (X Ads) needs the user's token secret too. */
	accessTokenSecret?: string | null;
	currency: string;
	metadata: Record<string, unknown>;
	logger: Logger;
};

export type CreatedCampaign = {
	campaignExternalId: string;
	/** Platform ids of every object created (ad sets/groups, creatives, ads) — kept for cleanup and sync. */
	objects: { type: "ad_set" | "creative" | "ad" | "asset"; externalId: string }[];
	/** Always "paused" (rule 1). */
	status: "paused";
	/** Link to the campaign in the platform's ads manager. */
	manageUrl: string | null;
};

export type CampaignInsightsDay = {
	campaignExternalId: string;
	/** Account-timezone day, YYYY-MM-DD. */
	date: string;
	spend: number; // account currency major units
	impressions?: number;
	reach?: number;
	clicks?: number;
	conversions?: number;
	videoViews?: number;
};

export type AdsCapabilities = {
	objectives: AdObjective[];
	formats: AdFormat[];
	/** Smallest daily budget the platform accepts, in USD-equivalent guidance (adapters validate exactly). */
	minDailyBudgetUsd: number;
	maxAdsPerCampaign: number;
	/** Platform-specific text limits for validation in the UI. */
	textLimits: { primaryText: number; headline?: number; description?: number };
};

export interface AdsProvider {
	readonly id: AdsProviderId;
	readonly displayName: string;
	readonly capabilities: AdsCapabilities;
	/** OAuth permissions requested (documented; checked on connect). */
	readonly scopes: string[];
	/** Conservative rate for mutating calls, enforced by the worker like publishing. */
	readonly writeRateLimit: { max: number; durationMs: number };

	isConfigured(): boolean;
	getAuthorizationUrl(config: OAuthConfig): Promise<AuthorizationRequest>;
	exchangeCode(input: { code: string; redirectUri: string; codeVerifier?: string }): Promise<{
		tokens: TokenSet & { tokenSecret?: string | null };
		accounts: AdAccount[];
	}>;
	refreshTokens?(refreshToken: string): Promise<TokenSet>;

	/** Pure: errors a user can fix before anything is sent (budget minimums, text limits, required media). */
	validate(draft: CampaignDraft, account: { currency: string }): string[];
	/** Interest / location / job-title search for the targeting picker. Read-only. */
	searchTargeting?(
		ctx: AdsContext,
		input: { type: TargetingOption["type"]; query: string; limit: number },
	): Promise<TargetingOption[]>;
	/**
	 * Creates campaign → ad sets → creatives → ads, all PAUSED. If a step fails after
	 * some objects exist, the adapter deletes what it created (best effort) and throws;
	 * the thrown ProviderError's details carry any ids it could not clean up.
	 */
	createCampaign(ctx: AdsContext, draft: CampaignDraft): Promise<CreatedCampaign>;
	/** The only call that starts (or stops) spending. Mutating. */
	setStatus(
		ctx: AdsContext,
		campaignExternalId: string,
		status: "active" | "paused",
	): Promise<void>;
	/** Archive/delete on the platform where supported (spend stops). Mutating. */
	archiveCampaign?(ctx: AdsContext, campaignExternalId: string): Promise<void>;
	/** Current status as the platform reports it (a user may pause it in the ads manager). */
	getCampaignStatus(
		ctx: AdsContext,
		campaignExternalId: string,
	): Promise<"active" | "paused" | "archived" | "deleted" | "in_review" | "rejected">;
	getInsights(
		ctx: AdsContext,
		input: { campaignExternalIds: string[]; since: string; until: string },
	): Promise<CampaignInsightsDay[]>;
}
