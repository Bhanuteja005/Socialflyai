import { ProviderError } from "../errors";
import { form, providerFetch, providerJson } from "../http";
import {
	escapeLittleText,
	LINKEDIN_API,
	linkedInAuthorizationUrl,
	linkedInHeaders,
	linkedInTokenSet,
	requestLinkedInToken,
	restliList,
	uploadLinkedInImage,
	uploadLinkedInVideo,
} from "../providers/linkedin";
import type { MediaItem, OAuthConfig, TokenSet } from "../types";
import {
	type CreatedStep,
	countMedia,
	currencyDigits,
	decimal,
	draftBudget,
	draftRejected,
	formatScaled,
	rollbackAndThrow,
	toScaledInteger,
	validateDraftBasics,
} from "./common";
import type {
	AdAccount,
	AdDraft,
	AdObjective,
	AdsCapabilities,
	AdsContext,
	AdsProvider,
	CampaignDraft,
	CampaignInsightsDay,
	CreatedCampaign,
	TargetingOption,
} from "./types";

/**
 * LinkedIn ads — Sponsored Content (single image / single video) through the
 * Advertising API, on the same LinkedIn app as organic posting. The app needs
 * the "Advertising API" product approved (Development tier, then Standard for
 * production use) — see docs/ads.md.
 *
 * Structure: campaign group → campaign (budget, targeting, objective) → creative.
 * The creative is created with `createInline`, which creates the sponsored
 * ("dark") post for the organization and the creative in one call, so no
 * orphaned post can be left behind between two steps.
 *
 * Docs (Marketing API, versioned; examples checked against li-lms-2026-09):
 *  groups      https://learn.microsoft.com/linkedin/marketing/integrations/ads/account-structure/create-and-manage-campaign-groups
 *  campaigns   https://learn.microsoft.com/linkedin/marketing/integrations/ads/account-structure/create-and-manage-campaigns
 *  creatives   https://learn.microsoft.com/linkedin/marketing/integrations/ads/account-structure/create-and-manage-creatives
 *  objectives  https://learn.microsoft.com/linkedin/marketing/integrations/ads-reporting/ad-budget-pricing-type-combinations
 *  accounts    https://learn.microsoft.com/linkedin/marketing/integrations/ads/account-structure/create-and-manage-accounts
 *  users       https://learn.microsoft.com/linkedin/marketing/integrations/ads/account-structure/create-and-manage-account-users
 *  reporting   https://learn.microsoft.com/linkedin/marketing/integrations/ads-reporting/ads-reporting
 *  targeting   https://learn.microsoft.com/linkedin/marketing/integrations/ads/advertising-targeting/ads-targeting
 */

export type LinkedInAdsEnv = {
	LINKEDIN_CLIENT_ID: string;
	LINKEDIN_CLIENT_SECRET: string;
	LINKEDIN_API_VERSION: string;
};

const PROVIDER = "linkedin_ads";
const API = LINKEDIN_API;
const SCOPES = ["r_ads", "rw_ads", "r_ads_reporting", "r_organization_social"];

type ObjectiveSpec = {
	objectiveType: string;
	optimizationTargetType: string;
	costType: "CPM" | "CPC" | "CPV";
};

/**
 * Auto-bidding combinations from the objective table: BRAND_AWARENESS allows
 * MAX_IMPRESSION, WEBSITE_VISIT and ENGAGEMENT allow MAX_CLICK, VIDEO_VIEW allows
 * MAX_VIDEO_VIEW. Auto-bidding bills on CPM (the docs' sample video campaign uses
 * CPV, which is what "maximum delivery" video views are charged on).
 * Leads (Lead Gen Forms) and sales (WEBSITE_CONVERSION, needs a conversion
 * associated before activation) are not offered yet.
 */
const OBJECTIVES: Partial<Record<AdObjective, ObjectiveSpec>> = {
	awareness: {
		objectiveType: "BRAND_AWARENESS",
		optimizationTargetType: "MAX_IMPRESSION",
		costType: "CPM",
	},
	traffic: { objectiveType: "WEBSITE_VISIT", optimizationTargetType: "MAX_CLICK", costType: "CPM" },
	engagement: { objectiveType: "ENGAGEMENT", optimizationTargetType: "MAX_CLICK", costType: "CPM" },
	video_views: {
		objectiveType: "VIDEO_VIEW",
		optimizationTargetType: "MAX_VIDEO_VIEW",
		costType: "CPV",
	},
};

/** CallToActionLabel enum (creatives doc). shop_now, contact_us and book_now have no equivalent. */
const CTA: Partial<Record<NonNullable<AdDraft["callToAction"]>, string>> = {
	learn_more: "LEARN_MORE",
	sign_up: "SIGN_UP",
	download: "DOWNLOAD",
	get_quote: "VIEW_QUOTE",
	subscribe: "SUBSCRIBE",
};

/**
 * Campaign locale must be one of LinkedIn's supported language/country pairs;
 * the language comes from targeting.languages (at most one), default English.
 * https://learn.microsoft.com/linkedin/shared/references/reference-tables/language-codes
 */
const LOCALES: Record<string, string> = {
	ar: "AE",
	cs: "CZ",
	da: "DK",
	de: "DE",
	en: "US",
	es: "ES",
	fr: "FR",
	in: "ID",
	id: "ID",
	it: "IT",
	ja: "JP",
	ko: "KR",
	ms: "MY",
	nl: "NL",
	no: "NO",
	pl: "PL",
	pt: "BR",
	ro: "RO",
	ru: "RU",
	sv: "SE",
	th: "TH",
	tl: "PH",
	tr: "TR",
	zh: "CN",
};

/**
 * Minimums: $10/day daily budget and $100 lifetime for a new campaign ("for any
 * ad format"). Other currencies have their own table that LinkedIn enforces.
 * https://www.linkedin.com/help/lms/answer/a9486341
 * Text: introductory text 600, headline 200 (Sponsored Content ad specs,
 * https://www.linkedin.com/help/lms/answer/a426534). 15 ads per campaign is the
 * Campaign Manager cap on active Sponsored Content ads per campaign.
 */
const capabilities: AdsCapabilities = {
	objectives: ["awareness", "traffic", "engagement", "video_views"],
	formats: ["image", "video"],
	minDailyBudgetUsd: 10,
	maxAdsPerCampaign: 15,
	textLimits: { primaryText: 600, headline: 200 },
};

/** Roles that may create campaigns (VIEWER and CREATIVE_MANAGER cannot). */
const CAMPAIGN_ROLES = new Set(["ACCOUNT_BILLING_ADMIN", "ACCOUNT_MANAGER", "CAMPAIGN_MANAGER"]);

export function mapLinkedInAccountStatus(
	status: string | undefined,
	role: string | undefined,
): AdAccount["status"] {
	if (status === "DRAFT") return "pending";
	if (status !== "ACTIVE") return "disabled";
	return role && !CAMPAIGN_ROLES.has(role) ? "disabled" : "active";
}

/** Campaign status + its creatives' review status (review starts on activation). */
export function mapLinkedInCampaignStatus(
	status: string | undefined,
	reviews: string[],
): "active" | "paused" | "archived" | "deleted" | "in_review" | "rejected" {
	switch (status) {
		case "PAUSED":
		case "DRAFT":
			return "paused";
		case "ARCHIVED":
		case "COMPLETED":
		case "CANCELED":
			return "archived";
		case "PENDING_DELETION":
		case "REMOVED":
			return "deleted";
	}
	if (reviews.length > 0) {
		if (reviews.every((r) => r === "REJECTED")) return "rejected";
		if (
			!reviews.includes("APPROVED") &&
			reviews.some((r) => r === "PENDING" || r === "NEEDS_REVIEW")
		) {
			return "in_review";
		}
	}
	return "active";
}

/** {amount, currencyCode} with the amount formatted from integer minor units. */
export function linkedInMoney(amount: number, currency: string) {
	const code = currency.toUpperCase();
	const digits = currencyDigits(code);
	const scaled = digits === null ? null : toScaledInteger(amount, digits);
	if (digits === null || scaled === null) {
		throw draftRejected(PROVIDER, [`Budget ${amount} cannot be expressed exactly in ${currency}`]);
	}
	return { amount: formatScaled(scaled, digits), currencyCode: code };
}

const idOf = (urnOrId: string) => urnOrId.split(":").pop() ?? urnOrId;
const accountUrn = (id: string) => `urn:li:sponsoredAccount:${idOf(id)}`;

type AnalyticsRow = {
	dateRange?: { start?: { year: number; month: number; day: number } };
	pivotValues?: string[];
	costInLocalCurrency?: string;
	impressions?: number;
	clicks?: number;
	externalWebsiteConversions?: number;
	videoViews?: number;
	approximateMemberReach?: number;
};

export function mapLinkedInAnalyticsRow(row: AnalyticsRow): CampaignInsightsDay {
	const s = row.dateRange?.start;
	const pad = (n: number) => String(n).padStart(2, "0");
	return {
		campaignExternalId: idOf(row.pivotValues?.[0] ?? ""),
		date: s ? `${s.year}-${pad(s.month)}-${pad(s.day)}` : "",
		// BigDecimal string in the account currency (major units).
		spend: decimal(row.costInLocalCurrency),
		impressions: decimal(row.impressions),
		clicks: decimal(row.clicks),
		conversions: decimal(row.externalWebsiteConversions),
		videoViews: decimal(row.videoViews),
	};
}

const rangeParam = (since: string, until: string) => {
	const part = (iso: string) => {
		const [y, m, d] = iso.split("-").map(Number);
		return `(year:${y},month:${m},day:${d})`;
	};
	return `(start:${part(since)},end:${part(until)})`;
};

class LinkedInAdsProvider implements AdsProvider {
	readonly id = "linkedin_ads" as const;
	readonly displayName = "LinkedIn Ads";
	readonly capabilities = capabilities;
	readonly scopes = SCOPES;
	readonly writeRateLimit = { max: 10, durationMs: 60_000 };

	constructor(private readonly env: LinkedInAdsEnv) {}

	private get client() {
		return { clientId: this.env.LINKEDIN_CLIENT_ID, clientSecret: this.env.LINKEDIN_CLIENT_SECRET };
	}

	private headers(accessToken: string, json = true) {
		return linkedInHeaders(accessToken, this.env.LINKEDIN_API_VERSION, json);
	}

	isConfigured() {
		return Boolean(
			this.env.LINKEDIN_CLIENT_ID &&
				this.env.LINKEDIN_CLIENT_SECRET &&
				this.env.LINKEDIN_API_VERSION,
		);
	}

	async getAuthorizationUrl(config: OAuthConfig) {
		return linkedInAuthorizationUrl(this.env.LINKEDIN_CLIENT_ID, SCOPES, config);
	}

	async exchangeCode(input: { code: string; redirectUri: string }) {
		const tokens = linkedInTokenSet(
			await requestLinkedInToken(PROVIDER, this.client, {
				grant_type: "authorization_code",
				code: input.code,
				redirect_uri: input.redirectUri,
			}),
			SCOPES,
		);
		return { tokens, accounts: await this.listAdAccounts(tokens.accessToken) };
	}

	/** Only partner apps receive refresh tokens; others reconnect every 60 days. */
	async refreshTokens(refreshToken: string): Promise<TokenSet> {
		return linkedInTokenSet(
			await requestLinkedInToken(PROVIDER, this.client, {
				grant_type: "refresh_token",
				refresh_token: refreshToken,
			}),
			SCOPES,
		);
	}

	/**
	 * adAccounts?q=search with no criteria returns every account the member can
	 * access; adAccountUsers?q=authenticatedUser gives their role in each.
	 */
	async listAdAccounts(accessToken: string): Promise<AdAccount[]> {
		const headers = this.headers(accessToken, false);
		const accounts: {
			id: number;
			name?: string;
			currency?: string;
			status?: string;
			type?: string;
			reference?: string;
			test?: boolean;
		}[] = [];
		let pageToken: string | undefined;
		for (let page = 0; page < 10; page++) {
			const res: {
				elements?: typeof accounts;
				metadata?: { nextPageToken?: string };
			} = await providerJson(
				PROVIDER,
				`${API}/rest/adAccounts?${form({ q: "search", pageSize: "100", ...(pageToken ? { pageToken } : {}) })}`,
				{ headers },
			);
			accounts.push(...(res.elements ?? []));
			pageToken = res.metadata?.nextPageToken;
			if (!pageToken) break;
		}
		const users = await providerJson<{ elements?: { account: string; role: string }[] }>(
			PROVIDER,
			`${API}/rest/adAccountUsers?q=authenticatedUser`,
			{ headers },
		);
		const roles = new Map((users.elements ?? []).map((u) => [idOf(u.account), u.role]));
		return accounts.map((a) => {
			const id = String(a.id);
			const role = roles.get(id);
			const org = a.reference?.startsWith("urn:li:organization:") ? a.reference : null;
			return {
				externalId: id,
				name: a.name ?? `LinkedIn ad account ${id}`,
				currency: a.currency ?? "USD",
				// LinkedIn budgets reset and report at midnight UTC.
				timezone: "UTC",
				status: mapLinkedInAccountStatus(a.status, role),
				metadata: {
					role: role ?? null,
					type: a.type ?? null,
					test: a.test === true,
					// The company page the account advertises for: the default author of ads.
					organizationUrn: org,
				},
			};
		});
	}

	validate(draft: CampaignDraft, account: { currency: string }): string[] {
		const errors = validateDraftBasics(draft, account, {
			platform: "LinkedIn",
			capabilities,
			lifetimeBudget: true,
			minDaily: { USD: 10 },
			minLifetime: { USD: 100 },
			unsupportedTargeting: ["ageMin", "ageMax", "genders", "interests", "keywords"],
		});
		const languages = draft.targeting.languages ?? [];
		if (languages.length > 1) errors.push("A LinkedIn campaign runs in one language");
		if (languages[0] && !LOCALES[languages[0]]) {
			errors.push(`LinkedIn does not support ads in "${languages[0]}"`);
		}
		const formats = new Set(draft.ads.map((a) => a.format));
		if (formats.size > 1)
			errors.push("A LinkedIn campaign has one ad format (all image or all video)");
		if (draft.objective === "video_views" && draft.ads.some((a) => a.format !== "video")) {
			errors.push("The video views objective needs video ads");
		}
		for (const [i, ad] of draft.ads.entries()) {
			const prefix = `Ad ${i + 1}: `;
			if (ad.format === "image" && (countMedia(ad, "image") !== 1 || countMedia(ad, "video"))) {
				errors.push(`${prefix}An image ad needs exactly one image`);
			}
			if (ad.format === "video" && (countMedia(ad, "video") !== 1 || countMedia(ad, "image"))) {
				errors.push(`${prefix}A video ad needs exactly one video`);
			}
			if (ad.callToAction && !CTA[ad.callToAction]) {
				errors.push(`${prefix}LinkedIn has no "${ad.callToAction}" button`);
			}
		}
		return errors;
	}

	private async jsonCreate(accessToken: string, path: string, body: unknown): Promise<string> {
		const res = await providerFetch(PROVIDER, `${API}${path}`, {
			method: "POST",
			mutating: true,
			headers: this.headers(accessToken),
			body: JSON.stringify(body),
		});
		// Created ids come back in a header, not the body.
		const id = res.headers.get("x-restli-id") ?? res.headers.get("x-linkedin-id");
		if (!id) {
			throw new ProviderError(
				"unknown_outcome",
				PROVIDER,
				`LinkedIn accepted ${path} but returned no id`,
			);
		}
		return id;
	}

	private async patch(accessToken: string, path: string, set: Record<string, unknown>) {
		await providerFetch(PROVIDER, `${API}${path}`, {
			method: "POST",
			mutating: true,
			headers: { ...this.headers(accessToken), "X-RestLi-Method": "PARTIAL_UPDATE" },
			body: JSON.stringify({ patch: { $set: set } }),
		});
	}

	private async remove(accessToken: string, path: string) {
		await providerFetch(PROVIDER, `${API}${path}`, {
			method: "DELETE",
			mutating: true,
			headers: this.headers(accessToken, false),
		});
	}

	/**
	 * Country code → urn:li:geo via the locations typeahead (English country name,
	 * exact match). Read-only and done before anything is created.
	 */
	private async resolveGeos(ctx: AdsContext, draft: CampaignDraft): Promise<string[]> {
		const t = draft.targeting;
		if (t.locations && t.locations.length > 0) return t.locations.map((l) => l.id);
		const names = new Intl.DisplayNames(["en"], { type: "region" });
		const urns: string[] = [];
		const missing: string[] = [];
		for (const code of t.countries) {
			const name = names.of(code) ?? code;
			const found = await this.typeahead(ctx.accessToken, "locations", name);
			const match = found.find((e) => e.name.toLowerCase() === name.toLowerCase());
			if (match) urns.push(match.urn);
			else missing.push(code);
		}
		if (missing.length > 0) {
			throw draftRejected(PROVIDER, [`LinkedIn location not found for: ${missing.join(", ")}`]);
		}
		return urns;
	}

	private async typeahead(accessToken: string, facet: string, query: string) {
		const res = await providerJson<{ elements?: { urn: string; name: string }[] }>(
			PROVIDER,
			`${API}/rest/adTargetingEntities?q=typeahead&queryVersion=QUERY_USES_URNS&facet=${encodeURIComponent(
				`urn:li:adTargetingFacet:${facet}`,
			)}&query=${encodeURIComponent(query)}&locale=(language:en,country:US)`,
			{ headers: this.headers(accessToken, false) },
		);
		return res.elements ?? [];
	}

	/** targetingCriteria: AND of ORs, one clause per facet. */
	private targetingCriteria(draft: CampaignDraft, geos: string[], localeUrn: string | null) {
		const t = draft.targeting;
		const and: Record<string, unknown>[] = [{ or: { "urn:li:adTargetingFacet:locations": geos } }];
		if (localeUrn) and.push({ or: { "urn:li:adTargetingFacet:interfaceLocales": [localeUrn] } });
		if (t.jobTitles?.length) {
			and.push({ or: { "urn:li:adTargetingFacet:titles": t.jobTitles.map((j) => j.id) } });
		}
		if (t.industries?.length) {
			and.push({ or: { "urn:li:adTargetingFacet:industries": t.industries.map((j) => j.id) } });
		}
		return { include: { and } };
	}

	async createCampaign(ctx: AdsContext, draft: CampaignDraft): Promise<CreatedCampaign> {
		const orgUrn =
			typeof ctx.metadata.organizationUrn === "string" ? ctx.metadata.organizationUrn : "";
		const spec = OBJECTIVES[draft.objective];
		const errors = this.validate(draft, { currency: ctx.currency });
		if (!orgUrn.startsWith("urn:li:organization:")) {
			errors.push("Choose the LinkedIn Page the ads run as (metadata.organizationUrn)");
		}
		if (errors.length > 0 || !spec) throw draftRejected(PROVIDER, errors);

		const token = ctx.accessToken;
		const accountId = idOf(ctx.accountExternalId);
		const base = `/rest/adAccounts/${accountId}`;
		const account = accountUrn(accountId);
		const language = draft.targeting.languages?.[0];
		const locale = { language: language ?? "en", country: LOCALES[language ?? "en"] ?? "US" };
		const budget = draftBudget(draft);
		const money = linkedInMoney(budget.amount, ctx.currency);
		const start = Date.parse(draft.startAt);
		const end = draft.endAt ? Date.parse(draft.endAt) : null;
		const geos = await this.resolveGeos(ctx, draft);

		const created: CreatedStep[] = [];
		const objects: CreatedCampaign["objects"] = [];
		try {
			// 1. Campaign group — DRAFT (groups are created ACTIVE or DRAFT; a DRAFT
			// group serves nothing and can be hard-deleted on rollback).
			const groupId = idOf(
				await this.jsonCreate(token, `${base}/adCampaignGroups`, {
					account,
					name: draft.name,
					runSchedule: { start, ...(end ? { end } : {}) },
					status: "DRAFT",
				}),
			);
			created.push({
				type: "campaign_group",
				externalId: `urn:li:sponsoredCampaignGroup:${groupId}`,
				cleanup: () => this.remove(token, `${base}/adCampaignGroups/${groupId}`),
			});

			// 2. Campaign — PAUSED. Audience expansion and the LinkedIn Audience
			// Network are OFF so the audience is exactly what the user chose.
			const campaignId = idOf(
				await this.jsonCreate(token, `${base}/adCampaigns`, {
					account,
					campaignGroup: `urn:li:sponsoredCampaignGroup:${groupId}`,
					name: draft.name,
					type: "SPONSORED_UPDATES",
					format: draft.ads[0]?.format === "video" ? "SINGLE_VIDEO" : "STANDARD_UPDATE",
					objectiveType: spec.objectiveType,
					optimizationTargetType: spec.optimizationTargetType,
					costType: spec.costType,
					// Auto-bidding ignores unitCost; 0 also means a manual bid could never spend.
					unitCost: { amount: "0", currencyCode: money.currencyCode },
					...(budget.kind === "daily"
						? { dailyBudget: money }
						: { totalBudget: money, pacingStrategy: "LIFETIME" }),
					locale,
					targetingCriteria: this.targetingCriteria(
						draft,
						geos,
						language ? `urn:li:locale:${locale.language}_${locale.country}` : null,
					),
					runSchedule: { start, ...(end ? { end } : {}) },
					audienceExpansionEnabled: false,
					offsiteDeliveryEnabled: false,
					// Declaration LinkedIn requires for EU targeting; the UI must have the
					// user confirm "not political advertising" (the draft has no field yet).
					politicalIntent: "NOT_POLITICAL",
					status: "PAUSED",
				}),
			);
			const campaignUrn = `urn:li:sponsoredCampaign:${campaignId}`;
			created.push({
				type: "campaign",
				externalId: campaignUrn,
				// Only DRAFT campaigns can be hard-deleted; others go to PENDING_DELETION.
				cleanup: () =>
					this.patch(token, `${base}/adCampaigns/${campaignId}`, { status: "PENDING_DELETION" }),
			});

			// 3. Creatives — the dark post is created inline; intendedStatus DRAFT so
			// review only starts when the user activates.
			for (const [i, ad] of draft.ads.entries()) {
				const media = await this.uploadMedia(token, orgUrn, ad);
				const creativeUrn = await this.jsonCreate(token, `${base}/creatives?action=createInline`, {
					creative: {
						name: `${draft.name} — ad ${i + 1}`,
						campaign: campaignUrn,
						intendedStatus: "DRAFT",
						inlineContent: {
							post: {
								adContext: { dscAdAccount: account, dscStatus: "ACTIVE" },
								author: orgUrn,
								commentary: escapeLittleText(ad.primaryText),
								visibility: "PUBLIC",
								lifecycleState: "PUBLISHED",
								isReshareDisabledByAuthor: false,
								contentLandingPage: ad.destinationUrl,
								contentCallToActionLabel: CTA[ad.callToAction ?? "learn_more"] ?? "LEARN_MORE",
								content: { media: { id: media, ...(ad.headline ? { title: ad.headline } : {}) } },
							},
						},
					},
				});
				created.push({
					type: "creative",
					externalId: creativeUrn,
					cleanup: () => this.remove(token, `${base}/creatives/${encodeURIComponent(creativeUrn)}`),
				});
				objects.push({ type: "creative", externalId: creativeUrn });
			}

			return {
				campaignExternalId: campaignId,
				// The contract has no parent-level type; the group is recorded as the
				// "ad_set" level so sync and cleanup know about it.
				objects: [
					{ type: "ad_set", externalId: `urn:li:sponsoredCampaignGroup:${groupId}` },
					...objects,
				],
				status: "paused",
				manageUrl: `https://www.linkedin.com/campaignmanager/accounts/${accountId}/campaigns/${campaignId}/details`,
			};
		} catch (error) {
			return rollbackAndThrow(PROVIDER, created, error, ctx.logger);
		}
	}

	/** Media uploads are invisible until referenced by a post, so they are not rolled back. */
	private async uploadMedia(token: string, orgUrn: string, ad: AdDraft): Promise<string> {
		const version = this.env.LINKEDIN_API_VERSION;
		const video = ad.media.find((m) => m.kind === "video");
		if (video) return uploadLinkedInVideo(PROVIDER, version, token, orgUrn, video);
		return uploadLinkedInImage(PROVIDER, version, token, orgUrn, ad.media[0] as MediaItem);
	}

	/**
	 * Activation: group → ACTIVE, draft/paused creatives → ACTIVE (starts review),
	 * campaign → ACTIVE last, so nothing serves until all of it is in place.
	 * Pausing sets only the campaign, which holds everything beneath it.
	 */
	async setStatus(ctx: AdsContext, campaignExternalId: string, status: "active" | "paused") {
		const token = ctx.accessToken;
		const accountId = idOf(ctx.accountExternalId);
		const base = `/rest/adAccounts/${accountId}`;
		const campaignId = idOf(campaignExternalId);
		if (status === "active") {
			const campaign = await providerJson<{ campaignGroup?: string }>(
				PROVIDER,
				`${API}${base}/adCampaigns/${campaignId}`,
				{ headers: this.headers(token, false) },
			);
			if (campaign.campaignGroup) {
				await this.patch(token, `${base}/adCampaignGroups/${idOf(campaign.campaignGroup)}`, {
					status: "ACTIVE",
				});
			}
			for (const creative of await this.creatives(token, accountId, campaignId)) {
				if (creative.intendedStatus === "DRAFT" || creative.intendedStatus === "PAUSED") {
					await this.patch(token, `${base}/creatives/${encodeURIComponent(creative.id)}`, {
						intendedStatus: "ACTIVE",
					});
				}
			}
		}
		await this.patch(token, `${base}/adCampaigns/${campaignId}`, {
			status: status === "active" ? "ACTIVE" : "PAUSED",
		});
	}

	private async creatives(token: string, accountId: string, campaignId: string) {
		const res = await providerJson<{
			elements?: { id: string; intendedStatus?: string; review?: { status?: string } }[];
		}>(
			PROVIDER,
			`${API}/rest/adAccounts/${accountId}/creatives?q=criteria&campaigns=${restliList([
				`urn:li:sponsoredCampaign:${campaignId}`,
			])}&pageSize=100`,
			{ headers: this.headers(token, false) },
		);
		return res.elements ?? [];
	}

	async archiveCampaign(ctx: AdsContext, campaignExternalId: string) {
		await this.patch(
			ctx.accessToken,
			`/rest/adAccounts/${idOf(ctx.accountExternalId)}/adCampaigns/${idOf(campaignExternalId)}`,
			{ status: "ARCHIVED" },
		);
	}

	async getCampaignStatus(ctx: AdsContext, campaignExternalId: string) {
		const accountId = idOf(ctx.accountExternalId);
		const campaignId = idOf(campaignExternalId);
		const campaign = await providerJson<{ status?: string }>(
			PROVIDER,
			`${API}/rest/adAccounts/${accountId}/adCampaigns/${campaignId}`,
			{ headers: this.headers(ctx.accessToken, false) },
		);
		const reviews =
			campaign.status === "ACTIVE"
				? (await this.creatives(ctx.accessToken, accountId, campaignId))
						.filter((c) => c.intendedStatus === "ACTIVE")
						.map((c) => c.review?.status ?? "")
				: [];
		return mapLinkedInCampaignStatus(campaign.status, reviews);
	}

	/** adAnalytics, pivot CAMPAIGN, DAILY (days in UTC). Needs r_ads_reporting. */
	async getInsights(
		ctx: AdsContext,
		input: { campaignExternalIds: string[]; since: string; until: string },
	): Promise<CampaignInsightsDay[]> {
		if (input.campaignExternalIds.length === 0) return [];
		const campaigns = restliList(
			input.campaignExternalIds.map((id) => `urn:li:sponsoredCampaign:${idOf(id)}`),
		);
		const res = await providerJson<{ elements?: AnalyticsRow[] }>(
			PROVIDER,
			`${API}/rest/adAnalytics?q=analytics&pivot=CAMPAIGN&timeGranularity=DAILY&dateRange=${rangeParam(
				input.since,
				input.until,
			)}&campaigns=${campaigns}&fields=dateRange,pivotValues,costInLocalCurrency,impressions,clicks,externalWebsiteConversions,videoViews`,
			{ headers: this.headers(ctx.accessToken, false) },
		);
		return (res.elements ?? []).map(mapLinkedInAnalyticsRow);
	}

	async searchTargeting(
		ctx: AdsContext,
		input: { type: TargetingOption["type"]; query: string; limit: number },
	): Promise<TargetingOption[]> {
		const facet =
			input.type === "location"
				? "locations"
				: input.type === "job_title"
					? "titles"
					: input.type === "industry"
						? "industries"
						: null;
		if (!facet) return [];
		const found = await this.typeahead(ctx.accessToken, facet, input.query);
		return found.slice(0, input.limit).map((e) => ({ id: e.urn, name: e.name, type: input.type }));
	}
}

export function createLinkedInAdsProvider(env: LinkedInAdsEnv): AdsProvider {
	return new LinkedInAdsProvider(env);
}
