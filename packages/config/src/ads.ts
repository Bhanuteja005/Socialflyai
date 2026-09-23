import { z } from "zod";

/**
 * Ad platforms (Phase 7). Each is optional: a platform without credentials is
 * hidden. Several need separate approval before production use (Google Ads
 * developer token "Basic access", LinkedIn Advertising API, TikTok Marketing API,
 * X Ads API) — see docs/ads.md.
 *
 * Meta (Facebook + Instagram ads) reuses META_APP_ID/SECRET from integrations
 * with the ads_management / ads_read permissions; LinkedIn reuses
 * LINKEDIN_CLIENT_ID/SECRET with the Advertising API products enabled.
 */
export const adsEnv = {
	/** Google Ads: OAuth client (can be the same Google Cloud project as YouTube) + developer token. */
	GOOGLE_ADS_CLIENT_ID: z.string().default(""),
	GOOGLE_ADS_CLIENT_SECRET: z.string().default(""),
	GOOGLE_ADS_DEVELOPER_TOKEN: z.string().default(""),
	/** Manager (MCC) account id without dashes, when accounts are accessed through one. */
	GOOGLE_ADS_LOGIN_CUSTOMER_ID: z.string().default(""),
	// Google sunsets versions roughly yearly; v21 and v22 are gone as of Sept 2026.
	GOOGLE_ADS_API_VERSION: z.string().default("v23"),

	TIKTOK_ADS_APP_ID: z.string().default(""),
	TIKTOK_ADS_APP_SECRET: z.string().default(""),

	PINTEREST_APP_ID: z.string().default(""),
	PINTEREST_APP_SECRET: z.string().default(""),

	/** X Ads API uses OAuth 1.0a user context with the app's consumer keys. */
	X_ADS_CONSUMER_KEY: z.string().default(""),
	X_ADS_CONSUMER_SECRET: z.string().default(""),

	/**
	 * Hard ceiling on the DAILY budget of any single campaign SocialFly creates, in the
	 * ad account's currency units. A typo like 5000 instead of 50 must not reach the
	 * platform. Organizations can lower it, never raise it. 0 = no ceiling.
	 */
	ADS_MAX_DAILY_BUDGET: z.coerce.number().min(0).default(500),
} as const;
