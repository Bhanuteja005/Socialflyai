import { ProviderError } from "../errors";
import { providerJson } from "../http";
import {
	classifyGoogleError,
	googleAuthorizationUrl,
	googleTokenSet,
	requestGoogleToken,
} from "../providers/youtube";
import type { OAuthConfig, TokenSet } from "../types";
import {
	decimal,
	draftBudget,
	draftRejected,
	fromMicros,
	toMicros,
	validateDraftBasics,
} from "./common";
import type {
	AdAccount,
	AdsCapabilities,
	AdsContext,
	AdsProvider,
	CampaignDraft,
	CampaignInsightsDay,
	CreatedCampaign,
	TargetingOption,
} from "./types";

/**
 * Google Ads — Search campaigns with Responsive Search Ads, through the REST
 * interface of the Google Ads API.
 *
 * Only the "search" format: image/video/carousel would mean Performance Max or
 * Demand Gen, which are asset-group campaigns with their own asset requirements
 * (logos, several aspect ratios, YouTube-hosted video), conversion-goal setup and
 * Google-driven automation. They do not fit the one-draft-many-platforms model
 * and are out of scope; validate() says so rather than creating something else.
 *
 * Creation is ONE atomic googleAds:mutate with temporary (negative) resource ids:
 * either every object is created or none is, so no rollback is ever needed.
 *
 * Docs:
 *  mutate       https://developers.google.com/google-ads/api/rest/common/mutate
 *  temp ids     https://developers.google.com/google-ads/api/docs/mutating/best-practices#temporary_resource_names
 *  Campaign     https://developers.google.com/google-ads/api/reference/rpc/v23/Campaign
 *  RSA          https://developers.google.com/google-ads/api/reference/rpc/v23/ResponsiveSearchAdInfo
 *  statuses     https://developers.google.com/google-ads/api/reference/rpc/v23/CampaignPrimaryStatusEnum.CampaignPrimaryStatus
 *  suggest      https://developers.google.com/google-ads/api/reference/rpc/v23/SuggestGeoTargetConstantsRequest
 *  customers    https://developers.google.com/google-ads/api/docs/account-management/listing-accounts
 */

export type GoogleAdsEnv = {
	GOOGLE_ADS_CLIENT_ID: string;
	GOOGLE_ADS_CLIENT_SECRET: string;
	GOOGLE_ADS_DEVELOPER_TOKEN: string;
	GOOGLE_ADS_LOGIN_CUSTOMER_ID: string;
	GOOGLE_ADS_API_VERSION: string;
};

const PROVIDER = "google_ads";
const API = "https://googleads.googleapis.com";
const SCOPES = ["https://www.googleapis.com/auth/adwords"];

/**
 * RSA: 3-15 headlines of ≤30 chars, 2-4 descriptions of ≤90 chars; at most 3
 * enabled RSAs per ad group. Keywords: ≤80 chars and ≤10 words.
 * https://support.google.com/google-ads/answer/7684791
 * https://developers.google.com/google-ads/api/docs/keywords/overview
 * (Google counts double-width CJK characters as 2; we count code points.)
 */
export const RSA_LIMITS = {
	headlines: { min: 3, max: 15, chars: 30 },
	descriptions: { min: 2, max: 4, chars: 90 },
	keywordChars: 80,
	keywordWords: 10,
} as const;

const capabilities: AdsCapabilities = {
	objectives: ["traffic", "leads", "sales"],
	formats: ["search"],
	// No platform minimum beyond the currency's smallest unit; guidance only.
	minDailyBudgetUsd: 1,
	maxAdsPerCampaign: 3,
	textLimits: { primaryText: 90, headline: 30, description: 90 },
};

type MatchType = "BROAD" | "PHRASE" | "EXACT";

/**
 * Keywords keep Google's own syntax so power users are not surprised:
 * `"running shoes"` = phrase, `[running shoes]` = exact, bare = broad.
 */
export function parseKeyword(raw: string): { text: string; matchType: MatchType } {
	const trimmed = raw.trim();
	if (/^".+"$/.test(trimmed)) return { text: trimmed.slice(1, -1).trim(), matchType: "PHRASE" };
	if (/^\[.+\]$/.test(trimmed)) return { text: trimmed.slice(1, -1).trim(), matchType: "EXACT" };
	return { text: trimmed, matchType: "BROAD" };
}

/**
 * customer.status → can we create campaigns? Manager (MCC) accounts cannot hold
 * campaigns, so they are listed but disabled.
 */
export function mapGoogleCustomerStatus(
	status: string | undefined,
	manager: boolean,
): AdAccount["status"] {
	if (manager) return "disabled";
	if (status === "ENABLED") return "active";
	if (status === "CANCELED" || status === "SUSPENDED" || status === "CLOSED") return "disabled";
	return "pending";
}

/**
 * campaign.status is what the user set; primary_status/reasons say why an
 * ENABLED campaign is not serving (review, disapproval, end date).
 */
export function mapGoogleCampaignStatus(
	status: string | undefined,
	primaryStatus: string | undefined,
	reasons: string[] = [],
): "active" | "paused" | "archived" | "deleted" | "in_review" | "rejected" {
	if (status === "REMOVED") return "deleted";
	if (status === "PAUSED") return "paused";
	if (primaryStatus === "ENDED") return "archived";
	if (reasons.includes("HAS_ADS_DISAPPROVED") && primaryStatus === "NOT_ELIGIBLE")
		return "rejected";
	if (reasons.includes("MOST_ADS_UNDER_REVIEW")) return "in_review";
	return "active";
}

/** GAQL string literal: single quotes escaped. */
const gaqlString = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
const digitsOnly = (id: string) => id.replace(/\D/g, "");

/**
 * The Google Ads API validates dates in the ACCOUNT's time zone. v23 replaced
 * start_date/end_date ("yyyy-MM-dd") with start_date_time/end_date_time
 * ("yyyy-MM-dd HH:mm:ss"), so the field set follows the configured version.
 */
export function googleSchedule(
	apiVersion: string,
	startAt: string,
	endAt: string | null,
	timeZone: string | null,
): Record<string, string> {
	const day = (iso: string) => {
		const d = new Date(iso);
		try {
			return new Intl.DateTimeFormat("en-CA", {
				timeZone: timeZone ?? "UTC",
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
			}).format(d);
		} catch {
			return d.toISOString().slice(0, 10);
		}
	};
	const major = Number(apiVersion.replace(/^v/, "").split(".")[0]);
	if (Number.isFinite(major) && major >= 23) {
		return {
			startDateTime: `${day(startAt)} 00:00:00`,
			...(endAt ? { endDateTime: `${day(endAt)} 23:59:59` } : {}),
		};
	}
	return { startDate: day(startAt), ...(endAt ? { endDate: day(endAt) } : {}) };
}

type GoogleAdsFailure = {
	error?: {
		code?: number;
		message?: string;
		status?: string;
		details?: {
			errors?: { errorCode?: Record<string, string>; message?: string }[];
			requestId?: string;
		}[];
	};
};

/** Configuration problems a reconnect cannot fix — surfaced, not treated as `auth`. */
const DEVELOPER_TOKEN_ERRORS = new Set([
	"DEVELOPER_TOKEN_NOT_APPROVED",
	"DEVELOPER_TOKEN_PROHIBITED",
	"DEVELOPER_TOKEN_NOT_ON_ALLOWLIST",
	"INVALID_DEVELOPER_TOKEN",
]);

/**
 * Google Ads error bodies: GoogleAdsFailure in error.details[].errors[] with an
 * `errorCode` oneof such as {quotaError: "RESOURCE_EXHAUSTED"}.
 * https://developers.google.com/google-ads/api/docs/best-practices/error-types
 * Returns undefined for 5xx so providerFetch applies the mutating rule.
 */
export function classifyGoogleAdsError(status: number, body: string): ProviderError | undefined {
	const oauth = classifyGoogleError(PROVIDER, status, body);
	if (oauth) return oauth;
	if (status >= 500) return undefined;
	let parsed: GoogleAdsFailure;
	try {
		parsed = JSON.parse(body) as GoogleAdsFailure;
	} catch {
		return undefined;
	}
	const first = parsed.error?.details?.flatMap((d) => d.errors ?? [])[0];
	const [kind, code] = Object.entries(first?.errorCode ?? {})[0] ?? [];
	const message = first?.message ?? parsed.error?.message ?? `Google Ads error ${status}`;
	const details = { status, body, platformCode: kind && code ? `${kind}.${code}` : undefined };

	if (kind === "quotaError") {
		return new ProviderError("rate_limited", PROVIDER, message, {
			...details,
			// RESOURCE_EXHAUSTED is the daily operations quota (Basic access: 15,000/day).
			retryAfterMs: code === "RESOURCE_TEMPORARILY_EXHAUSTED" ? 60_000 : 60 * 60_000,
		});
	}
	if (kind === "authorizationError" && code && DEVELOPER_TOKEN_ERRORS.has(code)) {
		return new ProviderError(
			"invalid_request",
			PROVIDER,
			`Google Ads developer token problem (${code}): ${message}`,
			details,
		);
	}
	if (status === 401 || status === 403 || status === 429) return undefined;
	return new ProviderError("invalid_request", PROVIDER, message, details);
}

type SearchResponse<T> = { results?: T[]; nextPageToken?: string };

type CustomerRow = {
	customer?: {
		id?: string;
		descriptiveName?: string;
		currencyCode?: string;
		timeZone?: string;
		status?: string;
		manager?: boolean;
		testAccount?: boolean;
	};
};

type MutateResponse = {
	mutateOperationResponses?: Record<string, { resourceName?: string } | undefined>[];
};

const idFromResourceName = (name: string) => name.split("/").pop() ?? name;

class GoogleAdsProvider implements AdsProvider {
	readonly id = "google_ads" as const;
	readonly displayName = "Google Ads";
	readonly capabilities = capabilities;
	readonly scopes = SCOPES;
	// Basic access is 15,000 operations/day for the whole developer token.
	readonly writeRateLimit = { max: 10, durationMs: 60_000 };

	constructor(private readonly env: GoogleAdsEnv) {}

	private get base() {
		return `${API}/${this.env.GOOGLE_ADS_API_VERSION}`;
	}

	isConfigured() {
		return Boolean(
			this.env.GOOGLE_ADS_CLIENT_ID &&
				this.env.GOOGLE_ADS_CLIENT_SECRET &&
				this.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
				this.env.GOOGLE_ADS_API_VERSION,
		);
	}

	private get client() {
		return {
			clientId: this.env.GOOGLE_ADS_CLIENT_ID,
			clientSecret: this.env.GOOGLE_ADS_CLIENT_SECRET,
		};
	}

	async getAuthorizationUrl(config: OAuthConfig) {
		return googleAuthorizationUrl(this.env.GOOGLE_ADS_CLIENT_ID, SCOPES, config);
	}

	async exchangeCode(input: { code: string; redirectUri: string }) {
		const tokens = googleTokenSet(
			await requestGoogleToken(PROVIDER, this.client, {
				grant_type: "authorization_code",
				code: input.code,
				redirect_uri: input.redirectUri,
			}),
			null,
			SCOPES,
		);
		return { tokens, accounts: await this.listAdAccounts(tokens.accessToken) };
	}

	async refreshTokens(refreshToken: string): Promise<TokenSet> {
		return googleTokenSet(
			await requestGoogleToken(PROVIDER, this.client, {
				grant_type: "refresh_token",
				refresh_token: refreshToken,
			}),
			refreshToken,
			SCOPES,
		);
	}

	/**
	 * login-customer-id names the account whose access we act through. For an
	 * account the user reaches directly that is the account itself (stored on
	 * connect); the env value covers accounts reached through a manager.
	 */
	private headers(accessToken: string, loginCustomerId?: string | null): Record<string, string> {
		const login = digitsOnly(loginCustomerId || this.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "");
		return {
			Authorization: `Bearer ${accessToken}`,
			"developer-token": this.env.GOOGLE_ADS_DEVELOPER_TOKEN,
			"Content-Type": "application/json",
			...(login ? { "login-customer-id": login } : {}),
		};
	}

	private ctxHeaders(ctx: AdsContext) {
		const login = ctx.metadata.loginCustomerId;
		return this.headers(ctx.accessToken, typeof login === "string" ? login : null);
	}

	private classify = (status: number, body: string) => classifyGoogleAdsError(status, body);

	/** GAQL search with nextPageToken pagination (bounded). */
	private async search<T>(
		customerId: string,
		query: string,
		headers: Record<string, string>,
		maxPages = 10,
	): Promise<T[]> {
		const out: T[] = [];
		let pageToken: string | undefined;
		for (let page = 0; page < maxPages; page++) {
			const res: SearchResponse<T> = await providerJson<SearchResponse<T>>(
				PROVIDER,
				`${this.base}/customers/${digitsOnly(customerId)}/googleAds:search`,
				{
					method: "POST",
					headers,
					body: JSON.stringify({ query, ...(pageToken ? { pageToken } : {}) }),
					classify: this.classify,
				},
			);
			out.push(...(res.results ?? []));
			pageToken = res.nextPageToken;
			if (!pageToken) break;
		}
		return out;
	}

	private async mutate(ctx: AdsContext, operations: unknown[]): Promise<MutateResponse> {
		return providerJson<MutateResponse>(
			PROVIDER,
			`${this.base}/customers/${digitsOnly(ctx.accountExternalId)}/googleAds:mutate`,
			{
				method: "POST",
				mutating: true,
				headers: this.ctxHeaders(ctx),
				body: JSON.stringify({ mutateOperations: operations }),
				classify: this.classify,
			},
		);
	}

	/**
	 * customers:listAccessibleCustomers returns the accounts the user can reach
	 * directly; each is then described with a GAQL read on itself. Client accounts
	 * that are only reachable through a manager are not expanded (see docs/ads.md).
	 */
	async listAdAccounts(accessToken: string): Promise<AdAccount[]> {
		const list = await providerJson<{ resourceNames?: string[] }>(
			PROVIDER,
			`${this.base}/customers:listAccessibleCustomers`,
			{ headers: this.headers(accessToken, null), classify: this.classify },
		);
		const accounts: AdAccount[] = [];
		for (const resourceName of (list.resourceNames ?? []).slice(0, 50)) {
			const id = idFromResourceName(resourceName);
			try {
				const [row] = await this.search<CustomerRow>(
					id,
					"SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.status, customer.manager, customer.test_account FROM customer LIMIT 1",
					this.headers(accessToken, id),
					1,
				);
				const c = row?.customer ?? {};
				const manager = c.manager === true;
				accounts.push({
					externalId: id,
					name: c.descriptiveName || `Google Ads ${id}`,
					currency: c.currencyCode ?? "USD",
					timezone: c.timeZone ?? null,
					status: mapGoogleCustomerStatus(c.status, manager),
					metadata: {
						loginCustomerId: id,
						manager,
						testAccount: c.testAccount === true,
						timeZone: c.timeZone ?? null,
					},
				});
			} catch (error) {
				// A cancelled or unreadable customer must not hide the others.
				if (error instanceof ProviderError && error.kind === "invalid_request") {
					accounts.push({
						externalId: id,
						name: `Google Ads ${id}`,
						currency: "USD",
						timezone: null,
						status: "disabled",
						metadata: { loginCustomerId: id, error: error.message },
					});
					continue;
				}
				throw error;
			}
		}
		return accounts;
	}

	validate(draft: CampaignDraft, account: { currency: string }): string[] {
		const errors = validateDraftBasics(draft, account, {
			platform: "Google Ads",
			capabilities,
			lifetimeBudget: false,
			unsupportedTargeting: ["ageMin", "ageMax", "genders", "interests", "jobTitles", "industries"],
		});
		for (const [i, ad] of draft.ads.entries()) {
			const prefix = `Ad ${i + 1}: `;
			if (ad.format !== "search") {
				errors.push(
					`${prefix}Google Ads image/video ads need Performance Max or Demand Gen, which SocialFly does not create yet — use a search ad`,
				);
				continue;
			}
			const headlines = ad.searchHeadlines ?? [];
			const descriptions = ad.searchDescriptions ?? [];
			const h = RSA_LIMITS.headlines;
			const d = RSA_LIMITS.descriptions;
			if (headlines.length < h.min || headlines.length > h.max) {
				errors.push(`${prefix}A search ad needs ${h.min}-${h.max} headlines`);
			}
			if (headlines.some((x) => !x.trim() || [...x].length > h.chars)) {
				errors.push(`${prefix}Each headline must be 1-${h.chars} characters`);
			}
			if (descriptions.length < d.min || descriptions.length > d.max) {
				errors.push(`${prefix}A search ad needs ${d.min}-${d.max} descriptions`);
			}
			if (descriptions.some((x) => !x.trim() || [...x].length > d.chars)) {
				errors.push(`${prefix}Each description must be 1-${d.chars} characters`);
			}
			if (ad.media.length > 0) errors.push(`${prefix}Search ads have no images or videos`);
		}
		const keywords = draft.targeting.keywords ?? [];
		if (keywords.length === 0) {
			errors.push("A search campaign needs at least one keyword (it cannot serve without one)");
		}
		for (const raw of keywords) {
			const { text } = parseKeyword(raw);
			if (!text) errors.push("Keywords cannot be empty");
			else if ([...text].length > RSA_LIMITS.keywordChars) {
				errors.push(`Keyword "${text}" is longer than ${RSA_LIMITS.keywordChars} characters`);
			} else if (text.split(/\s+/).length > RSA_LIMITS.keywordWords) {
				errors.push(`Keyword "${text}" has more than ${RSA_LIMITS.keywordWords} words`);
			}
		}
		return errors;
	}

	/**
	 * Country codes → geoTargetConstants and ISO 639-1 → languageConstants, read
	 * BEFORE the mutate so an unknown code fails the draft with nothing created.
	 */
	private async resolveCriteria(ctx: AdsContext, draft: CampaignDraft) {
		const headers = this.ctxHeaders(ctx);
		const t = draft.targeting;
		let geo: string[];
		if (t.locations && t.locations.length > 0) {
			geo = t.locations.map((l) => l.id);
		} else {
			const rows = await this.search<{
				geoTargetConstant?: { resourceName?: string; countryCode?: string };
			}>(
				ctx.accountExternalId,
				`SELECT geo_target_constant.resource_name, geo_target_constant.country_code FROM geo_target_constant WHERE geo_target_constant.target_type = 'Country' AND geo_target_constant.status = 'ENABLED' AND geo_target_constant.country_code IN (${t.countries.map(gaqlString).join(", ")})`,
				headers,
				1,
			);
			const byCode = new Map(
				rows.map((r) => [r.geoTargetConstant?.countryCode, r.geoTargetConstant?.resourceName]),
			);
			const missing = t.countries.filter((c) => !byCode.get(c));
			if (missing.length > 0) {
				throw draftRejected(PROVIDER, [`Google Ads cannot target: ${missing.join(", ")}`]);
			}
			geo = t.countries.map((c) => byCode.get(c) as string);
		}

		let languages: string[] = [];
		if (t.languages && t.languages.length > 0) {
			const rows = await this.search<{
				languageConstant?: { resourceName?: string; code?: string };
			}>(
				ctx.accountExternalId,
				`SELECT language_constant.resource_name, language_constant.code FROM language_constant WHERE language_constant.code IN (${t.languages.map(gaqlString).join(", ")})`,
				headers,
				1,
			);
			const byCode = new Map(
				rows.map((r) => [r.languageConstant?.code, r.languageConstant?.resourceName]),
			);
			const missing = t.languages.filter((l) => !byCode.get(l));
			if (missing.length > 0) {
				throw draftRejected(PROVIDER, [`Google Ads has no language "${missing.join(", ")}"`]);
			}
			languages = t.languages.map((l) => byCode.get(l) as string);
		}
		return { geo, languages };
	}

	/** Builds the atomic operation list; exported through the class for tests via createCampaign. */
	private operations(
		customerId: string,
		draft: CampaignDraft,
		criteria: { geo: string[]; languages: string[] },
		timeZone: string | null,
	): unknown[] {
		const c = `customers/${customerId}`;
		const budgetName = `${c}/campaignBudgets/-1`;
		const campaignName = `${c}/campaigns/-2`;
		const adGroupName = `${c}/adGroups/-3`;
		const budget = draftBudget(draft);
		const amountMicros = toMicros(budget.amount);
		if (amountMicros === null) throw draftRejected(PROVIDER, ["The budget is not a valid amount"]);

		const ops: unknown[] = [
			{
				campaignBudgetOperation: {
					create: {
						resourceName: budgetName,
						name: `${draft.name} budget ${Date.now()}`,
						amountMicros,
						deliveryMethod: "STANDARD",
						// A shared budget could be drained by other campaigns' changes.
						explicitlyShared: false,
					},
				},
			},
			{
				campaignOperation: {
					create: {
						resourceName: campaignName,
						name: draft.name,
						// The API defaults new campaigns to ENABLED — PAUSED must be explicit.
						status: "PAUSED",
						advertisingChannelType: "SEARCH",
						campaignBudget: budgetName,
						// Traffic → Maximize clicks; leads/sales → Maximize conversions (needs
						// conversion tracking in the account to optimise meaningfully).
						...(draft.objective === "traffic" ? { targetSpend: {} } : { maximizeConversions: {} }),
						networkSettings: {
							targetGoogleSearch: true,
							targetSearchNetwork: true,
							targetContentNetwork: false,
							targetPartnerSearchNetwork: false,
						},
						// PRESENCE: people IN the countries, not merely interested in them.
						geoTargetTypeSetting: { positiveGeoTargetType: "PRESENCE" },
						// Required declaration (EU political ads regulation); the UI must
						// have the user confirm it — the draft has no field for it yet.
						containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
						...googleSchedule(
							this.env.GOOGLE_ADS_API_VERSION,
							draft.startAt,
							draft.endAt,
							timeZone,
						),
					},
				},
			},
			...criteria.geo.map((geoTargetConstant) => ({
				campaignCriterionOperation: {
					create: { campaign: campaignName, location: { geoTargetConstant } },
				},
			})),
			...criteria.languages.map((languageConstant) => ({
				campaignCriterionOperation: {
					create: { campaign: campaignName, language: { languageConstant } },
				},
			})),
			{
				adGroupOperation: {
					create: {
						resourceName: adGroupName,
						name: `${draft.name} ad group`,
						campaign: campaignName,
						status: "PAUSED",
						type: "SEARCH_STANDARD",
					},
				},
			},
			...(draft.targeting.keywords ?? []).map((raw) => ({
				adGroupCriterionOperation: {
					create: {
						adGroup: adGroupName,
						status: "ENABLED",
						keyword: parseKeyword(raw),
					},
				},
			})),
			...draft.ads.map((ad) => ({
				adGroupAdOperation: {
					create: {
						adGroup: adGroupName,
						status: "PAUSED",
						ad: {
							finalUrls: [ad.destinationUrl],
							responsiveSearchAd: {
								headlines: (ad.searchHeadlines ?? []).map((text) => ({ text })),
								descriptions: (ad.searchDescriptions ?? []).map((text) => ({ text })),
							},
						},
					},
				},
			})),
		];
		return ops;
	}

	async createCampaign(ctx: AdsContext, draft: CampaignDraft): Promise<CreatedCampaign> {
		const errors = this.validate(draft, { currency: ctx.currency });
		if (errors.length > 0) throw draftRejected(PROVIDER, errors);
		const customerId = digitsOnly(ctx.accountExternalId);
		const criteria = await this.resolveCriteria(ctx, draft);
		const timeZone = typeof ctx.metadata.timeZone === "string" ? ctx.metadata.timeZone : null;

		// Atomic: Google applies all operations or none (partialFailure defaults to
		// false), so there is nothing to roll back on failure.
		const res = await this.mutate(ctx, this.operations(customerId, draft, criteria, timeZone));

		const results = (res.mutateOperationResponses ?? []).flatMap((r) =>
			Object.entries(r).map(([key, value]) => ({ key, name: value?.resourceName ?? "" })),
		);
		const campaign = results.find((r) => r.key === "campaignResult")?.name;
		if (!campaign) {
			throw new ProviderError(
				"unknown_outcome",
				PROVIDER,
				"Google Ads accepted the request but returned no campaign",
			);
		}
		return {
			campaignExternalId: idFromResourceName(campaign),
			objects: [
				...results
					.filter((r) => r.key === "adGroupResult")
					.map((r) => ({ type: "ad_set" as const, externalId: r.name })),
				...results
					.filter((r) => r.key === "adGroupAdResult")
					.map((r) => ({ type: "ad" as const, externalId: r.name })),
			],
			status: "paused",
			// Ads UI deep links need an internal account id (ocid) the API does not expose.
			manageUrl: null,
		};
	}

	/**
	 * Activation enables the paused ad groups and ads and the campaign in ONE
	 * atomic mutate (campaign last in the list); pausing touches the campaign only,
	 * which stops everything beneath it.
	 */
	async setStatus(ctx: AdsContext, campaignExternalId: string, status: "active" | "paused") {
		const customerId = digitsOnly(ctx.accountExternalId);
		const id = digitsOnly(campaignExternalId);
		const campaign = `customers/${customerId}/campaigns/${id}`;
		const ops: unknown[] = [];
		if (status === "active") {
			const headers = this.ctxHeaders(ctx);
			const groups = await this.search<{ adGroup?: { resourceName?: string } }>(
				customerId,
				`SELECT ad_group.resource_name FROM ad_group WHERE campaign.id = ${id} AND ad_group.status = 'PAUSED'`,
				headers,
			);
			const ads = await this.search<{ adGroupAd?: { resourceName?: string } }>(
				customerId,
				`SELECT ad_group_ad.resource_name FROM ad_group_ad WHERE campaign.id = ${id} AND ad_group_ad.status = 'PAUSED'`,
				headers,
			);
			for (const g of groups) {
				if (g.adGroup?.resourceName) {
					ops.push({
						adGroupOperation: {
							update: { resourceName: g.adGroup.resourceName, status: "ENABLED" },
							updateMask: "status",
						},
					});
				}
			}
			for (const a of ads) {
				if (a.adGroupAd?.resourceName) {
					ops.push({
						adGroupAdOperation: {
							update: { resourceName: a.adGroupAd.resourceName, status: "ENABLED" },
							updateMask: "status",
						},
					});
				}
			}
		}
		ops.push({
			campaignOperation: {
				update: { resourceName: campaign, status: status === "active" ? "ENABLED" : "PAUSED" },
				updateMask: "status",
			},
		});
		await this.mutate(ctx, ops);
	}

	/** REMOVED is final in Google Ads (reporting stays available). */
	async archiveCampaign(ctx: AdsContext, campaignExternalId: string) {
		const customerId = digitsOnly(ctx.accountExternalId);
		await this.mutate(ctx, [
			{
				campaignOperation: {
					remove: `customers/${customerId}/campaigns/${digitsOnly(campaignExternalId)}`,
				},
			},
		]);
	}

	async getCampaignStatus(ctx: AdsContext, campaignExternalId: string) {
		const [row] = await this.search<{
			campaign?: { status?: string; primaryStatus?: string; primaryStatusReasons?: string[] };
		}>(
			ctx.accountExternalId,
			`SELECT campaign.status, campaign.primary_status, campaign.primary_status_reasons FROM campaign WHERE campaign.id = ${digitsOnly(campaignExternalId)}`,
			this.ctxHeaders(ctx),
			1,
		);
		if (!row?.campaign) return "deleted";
		return mapGoogleCampaignStatus(
			row.campaign.status,
			row.campaign.primaryStatus,
			row.campaign.primaryStatusReasons,
		);
	}

	async getInsights(
		ctx: AdsContext,
		input: { campaignExternalIds: string[]; since: string; until: string },
	): Promise<CampaignInsightsDay[]> {
		const ids = input.campaignExternalIds.map(digitsOnly).filter(Boolean);
		if (ids.length === 0) return [];
		const rows = await this.search<{
			campaign?: { id?: string };
			segments?: { date?: string };
			metrics?: {
				costMicros?: string;
				impressions?: string;
				clicks?: string;
				conversions?: number;
			};
		}>(
			ctx.accountExternalId,
			`SELECT campaign.id, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign WHERE campaign.id IN (${ids.join(", ")}) AND segments.date BETWEEN ${gaqlString(input.since)} AND ${gaqlString(input.until)}`,
			this.ctxHeaders(ctx),
		);
		return rows.map((r) => mapGoogleInsightsRow(r));
	}

	/** Locations only; keyword ideas (KeywordPlanIdeaService) are out of scope here. */
	async searchTargeting(
		ctx: AdsContext,
		input: { type: TargetingOption["type"]; query: string; limit: number },
	): Promise<TargetingOption[]> {
		if (input.type !== "location") return [];
		const res = await providerJson<{
			geoTargetConstantSuggestions?: {
				geoTargetConstant?: { resourceName?: string; name?: string; canonicalName?: string };
			}[];
		}>(PROVIDER, `${this.base}/geoTargetConstants:suggest`, {
			method: "POST",
			headers: this.ctxHeaders(ctx),
			body: JSON.stringify({ locale: "en", locationNames: { names: [input.query] } }),
			classify: this.classify,
		});
		return (res.geoTargetConstantSuggestions ?? [])
			.map((s) => s.geoTargetConstant)
			.filter((g): g is { resourceName: string; name?: string; canonicalName?: string } =>
				Boolean(g?.resourceName),
			)
			.slice(0, input.limit)
			.map((g) => ({
				id: g.resourceName,
				name: g.canonicalName ?? g.name ?? g.resourceName,
				type: "location" as const,
			}));
	}
}

export function mapGoogleInsightsRow(r: {
	campaign?: { id?: string };
	segments?: { date?: string };
	metrics?: { costMicros?: string; impressions?: string; clicks?: string; conversions?: number };
}): CampaignInsightsDay {
	return {
		campaignExternalId: r.campaign?.id ?? "",
		date: r.segments?.date ?? "",
		spend: fromMicros(r.metrics?.costMicros),
		impressions: decimal(r.metrics?.impressions),
		clicks: decimal(r.metrics?.clicks),
		// Fractional with data-driven attribution; kept as reported.
		conversions: decimal(r.metrics?.conversions),
	};
}

export function createGoogleAdsProvider(env: GoogleAdsEnv): AdsProvider {
	return new GoogleAdsProvider(env);
}
