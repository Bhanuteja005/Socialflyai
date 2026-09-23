import type { AdsProvider } from "@socialfly/integrations";

/**
 * What the ads module needs from a registry of ads adapters: the real one from
 * @socialfly/integrations (createAdsRegistry) and the fakes the tests build both fit.
 */
export interface AdsProviders {
	all(): AdsProvider[];
	get(id: string): AdsProvider | undefined;
}

/**
 * The identity an ad account's ads run as, chosen after connecting (a Facebook Page, a
 * LinkedIn company page, a TikTok identity, a Pinterest board, an X funding instrument).
 * These are the only metadata keys users may set; everything else in `metadata` came
 * from the platform at connect time and is not shown or editable.
 */
export type IdentityField = {
	key: string;
	label: string;
	/** Required before any campaign on the account can be submitted. */
	required: boolean;
	pattern?: RegExp;
	/** Allowed values, for enum-like fields. */
	values?: readonly string[];
	hint?: string;
};

export const IDENTITY_FIELDS: Record<string, IdentityField[]> = {
	meta_ads: [
		{
			key: "pageId",
			label: "Facebook Page",
			required: true,
			pattern: /^\d{3,30}$/,
			hint: "The Page every ad is published as",
		},
		{
			key: "instagramUserId",
			label: "Instagram account",
			required: false,
			pattern: /^\d{3,30}$/,
			hint: "Optional: shows the ads under this Instagram account",
		},
		{
			key: "pixelId",
			label: "Meta pixel",
			required: false,
			pattern: /^\d{3,30}$/,
			hint: "Needed for leads and sales campaigns (Events Manager → pixel id)",
		},
	],
	google_ads: [],
	linkedin_ads: [
		{
			key: "organizationUrn",
			label: "LinkedIn company page",
			required: true,
			pattern: /^urn:li:organization:\d{1,30}$/,
			hint: "The company page sponsored content is published as",
		},
	],
	tiktok_ads: [
		{
			key: "identityId",
			label: "TikTok identity",
			required: true,
			pattern: /^[\w-]{1,100}$/,
			hint: "Identity id from TikTok Ads Manager (Assets → Identities)",
		},
		{
			key: "identityType",
			label: "Identity type",
			required: false,
			values: ["CUSTOMIZED_USER", "AUTH_CODE", "TT_USER", "BC_AUTH_TT"],
		},
	],
	pinterest_ads: [
		{
			key: "boardId",
			label: "Pinterest board",
			required: true,
			pattern: /^\d{1,30}$/,
			hint: "The board the ad Pins are saved to",
		},
	],
	x_ads: [
		{
			key: "fundingInstrumentId",
			label: "Funding instrument",
			required: true,
			pattern: /^[\w-]{1,100}$/,
			hint: "The payment method campaigns are billed to (X Ads → Billing)",
		},
		{
			key: "promotableUserId",
			label: "Promotable account",
			required: false,
			pattern: /^\d{1,30}$/,
		},
	],
};

export const identityFields = (provider: string) => IDENTITY_FIELDS[provider] ?? [];

/** The identity part of an account's metadata (what the API shows and lets admins set). */
export function identityMetadata(provider: string, metadata: Record<string, unknown>) {
	const out: Record<string, string> = {};
	for (const f of identityFields(provider)) {
		const v = metadata[f.key];
		if (typeof v === "string" && v) out[f.key] = v;
	}
	return out;
}

/** Required identity keys the account has not set yet. */
export function identityRequired(provider: string, metadata: Record<string, unknown>) {
	const set = identityMetadata(provider, metadata);
	return identityFields(provider)
		.filter((f) => f.required && !set[f.key])
		.map((f) => f.key);
}

/**
 * The daily-budget ceiling for an organization: the lower of ADS_MAX_DAILY_BUDGET (0 =
 * none) and the organization's own limit; null = no ceiling. The worker re-checks the
 * same rule before activating (apps/worker/src/ads/draft.ts).
 */
export function effectiveCeiling(serverCeiling: number, orgCeiling: number | null) {
	const limits = [serverCeiling > 0 ? serverCeiling : null, orgCeiling].filter(
		(n): n is number => n !== null && n > 0,
	);
	return limits.length ? Math.min(...limits) : null;
}

/** Days a lifetime budget is spread over (at least one). */
export const campaignDays = (startAt: Date, endAt: Date | null) =>
	endAt ? Math.max(1, Math.ceil((endAt.getTime() - startAt.getTime()) / 86_400_000)) : 1;

/** Money compares in cents: 25.5 typed as 25.50 is the same amount. */
export const cents = (n: number) => Math.round(n * 100);
