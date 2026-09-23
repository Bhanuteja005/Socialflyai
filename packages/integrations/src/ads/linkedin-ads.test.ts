import { afterEach, describe, expect, test } from "bun:test";
import { isProviderError, type ProviderError } from "../errors";
import { channel, header, jsonResponse, mockFetch, type RecordedCall } from "../testing/fetch-mock";
import {
	createLinkedInAdsProvider,
	linkedInMoney,
	mapLinkedInAccountStatus,
	mapLinkedInAnalyticsRow,
	mapLinkedInCampaignStatus,
} from "./linkedin-ads";
import type { AdDraft, AdsContext, CampaignDraft } from "./types";

const env = {
	LINKEDIN_CLIENT_ID: "cid",
	LINKEDIN_CLIENT_SECRET: "secret",
	LINKEDIN_API_VERSION: "202609",
};
const provider = createLinkedInAdsProvider(env);
const ORG = "urn:li:organization:42";

const ctx = (over: Partial<AdsContext> = {}): AdsContext => ({
	accountExternalId: "500",
	accessToken: "tok",
	currency: "USD",
	metadata: { organizationUrn: ORG },
	logger: channel().logger,
	...over,
});

const draft = (over: Partial<CampaignDraft> = {}): CampaignDraft => ({
	name: "B2B launch",
	objective: "traffic",
	dailyBudget: 50.5,
	startAt: "2026-10-01T00:00:00.000Z",
	endAt: null,
	targeting: {
		countries: ["US"],
		jobTitles: [{ id: "urn:li:title:9", name: "Engineer", type: "job_title" }],
		industries: [{ id: "urn:li:industry:4", name: "Software", type: "industry" }],
	},
	ads: [
		{
			name: "Ad",
			format: "image",
			primaryText: "Ship faster (really)",
			headline: "Try it",
			callToAction: "sign_up",
			destinationUrl: "https://saas.test",
			media: [
				{ url: "https://cdn.test/a.png", kind: "image", mimeType: "image/png", sizeBytes: 3 },
			],
		},
	],
	...over,
});

const body = (call: RecordedCall | undefined) => JSON.parse(String(call?.init.body ?? "{}"));

let restore: (() => void) | undefined;
afterEach(() => restore?.());

async function thrown(p: Promise<unknown>): Promise<ProviderError> {
	try {
		await p;
	} catch (e) {
		if (isProviderError(e)) return e;
		throw e;
	}
	throw new Error("expected a ProviderError");
}

const created = (id: string) => new Response(null, { status: 201, headers: { "x-restli-id": id } });

/** Happy-path LinkedIn API: typeahead, uploads, creates. */
const api = (overrides: (url: URL, init: RequestInit) => Response | undefined = () => undefined) =>
	mockFetch((url, init) => {
		const o = overrides(url, init);
		if (o) return o;
		const p = url.pathname;
		if (p === "/rest/adTargetingEntities") {
			return jsonResponse({ elements: [{ urn: "urn:li:geo:103644278", name: "United States" }] });
		}
		if (p === "/rest/images" && url.searchParams.get("action") === "initializeUpload") {
			return jsonResponse({
				value: { uploadUrl: "https://upload.test/img", image: "urn:li:image:I1" },
			});
		}
		if (url.hostname === "cdn.test") return new Response(new Uint8Array([1, 2, 3]));
		if (url.hostname === "upload.test") return new Response(null, { status: 201 });
		if (p === "/rest/adAccounts/500/adCampaignGroups") return created("777");
		if (p === "/rest/adAccounts/500/adCampaigns") return created("888");
		if (p === "/rest/adAccounts/500/creatives") return created("urn:li:sponsoredCreative:999");
		return jsonResponse({}, 200);
	});

describe("pure mapping", () => {
	test("money is {amount, currencyCode} strings built from integers", () => {
		expect(linkedInMoney(50.5, "USD")).toEqual({ amount: "50.50", currencyCode: "USD" });
		expect(linkedInMoney(0.29, "eur")).toEqual({ amount: "0.29", currencyCode: "EUR" });
		expect(linkedInMoney(5000, "JPY")).toEqual({ amount: "5000", currencyCode: "JPY" });
		expect(() => linkedInMoney(10.001, "USD")).toThrow();
	});

	test("account status uses the member's role", () => {
		expect(mapLinkedInAccountStatus("ACTIVE", "CAMPAIGN_MANAGER")).toBe("active");
		expect(mapLinkedInAccountStatus("ACTIVE", "VIEWER")).toBe("disabled");
		expect(mapLinkedInAccountStatus("DRAFT", "ACCOUNT_MANAGER")).toBe("pending");
		expect(mapLinkedInAccountStatus("CANCELED", "ACCOUNT_MANAGER")).toBe("disabled");
	});

	test("campaign status", () => {
		expect(mapLinkedInCampaignStatus("PAUSED", [])).toBe("paused");
		expect(mapLinkedInCampaignStatus("COMPLETED", [])).toBe("archived");
		expect(mapLinkedInCampaignStatus("PENDING_DELETION", [])).toBe("deleted");
		expect(mapLinkedInCampaignStatus("ACTIVE", ["PENDING"])).toBe("in_review");
		expect(mapLinkedInCampaignStatus("ACTIVE", ["REJECTED"])).toBe("rejected");
		expect(mapLinkedInCampaignStatus("ACTIVE", ["APPROVED", "PENDING"])).toBe("active");
	});

	test("analytics row", () => {
		expect(
			mapLinkedInAnalyticsRow({
				dateRange: { start: { year: 2026, month: 10, day: 2 } },
				pivotValues: ["urn:li:sponsoredCampaign:888"],
				costInLocalCurrency: "19.87",
				impressions: 500,
				clicks: 12,
				externalWebsiteConversions: 2,
				videoViews: 0,
			}),
		).toEqual({
			campaignExternalId: "888",
			date: "2026-10-02",
			spend: 19.87,
			impressions: 500,
			clicks: 12,
			conversions: 2,
			videoViews: 0,
		});
	});
});

describe("validate", () => {
	test("a good draft passes", () => {
		expect(provider.validate(draft(), { currency: "USD" })).toEqual([]);
	});

	test("minimums, objectives, CTA, formats, languages, targeting", () => {
		const errors = provider.validate(
			draft({
				objective: "leads",
				dailyBudget: 9,
				targeting: { countries: ["US"], languages: ["en", "fr"], genders: ["male"] },
				ads: [
					{ ...(draft().ads[0] as AdDraft), callToAction: "shop_now" },
					{ ...(draft().ads[0] as AdDraft), format: "video" },
				],
			}),
			{ currency: "USD" },
		);
		expect(errors).toContain("LinkedIn requires a daily budget of at least 10 USD");
		expect(errors).toContain('LinkedIn does not support the "leads" objective here');
		expect(errors).toContain("A LinkedIn campaign runs in one language");
		expect(errors).toContain(
			"LinkedIn gender targeting is not supported yet — remove it to continue",
		);
		expect(errors).toContain("A LinkedIn campaign has one ad format (all image or all video)");
		expect(errors).toContain('Ad 1: LinkedIn has no "shop_now" button');
		expect(errors).toContain("Ad 2: A video ad needs exactly one video");
		expect(
			provider.validate(
				draft({ dailyBudget: undefined, lifetimeBudget: 99, endAt: "2026-11-01T00:00:00.000Z" }),
				{ currency: "USD" },
			),
		).toContain("LinkedIn requires a lifetime budget of at least 100 USD");
	});
});

describe("OAuth + accounts", () => {
	test("authorization URL requests the ads scopes", async () => {
		const { url } = await provider.getAuthorizationUrl({
			redirectUri: "https://app.test/cb",
			state: "s",
		});
		expect(new URL(url).searchParams.get("scope")).toBe(
			"r_ads rw_ads r_ads_reporting r_organization_social",
		);
	});

	test("exchange → accounts with roles and the advertised organization", async () => {
		const mock = mockFetch((url) => {
			if (url.pathname === "/oauth/v2/accessToken")
				return jsonResponse({ access_token: "at", expires_in: 5_184_000 });
			if (url.pathname === "/rest/adAccounts") {
				return jsonResponse({
					elements: [
						{
							id: 500,
							name: "Acme",
							currency: "EUR",
							status: "ACTIVE",
							type: "BUSINESS",
							reference: ORG,
						},
						{ id: 501, name: "Viewer only", currency: "USD", status: "ACTIVE" },
					],
				});
			}
			if (url.pathname === "/rest/adAccountUsers") {
				return jsonResponse({
					elements: [
						{ account: "urn:li:sponsoredAccount:500", role: "CAMPAIGN_MANAGER" },
						{ account: "urn:li:sponsoredAccount:501", role: "VIEWER" },
					],
				});
			}
			return jsonResponse({}, 404);
		});
		restore = mock.restore;
		const res = await provider.exchangeCode({ code: "c", redirectUri: "https://app.test/cb" });
		expect(res.tokens.accessToken).toBe("at");
		expect(res.accounts).toEqual([
			{
				externalId: "500",
				name: "Acme",
				currency: "EUR",
				timezone: "UTC",
				status: "active",
				metadata: { role: "CAMPAIGN_MANAGER", type: "BUSINESS", test: false, organizationUrn: ORG },
			},
			expect.objectContaining({ externalId: "501", status: "disabled" }),
		]);
		const accounts = mock.calls.find((c) => c.url.pathname === "/rest/adAccounts");
		expect(accounts?.url.searchParams.get("q")).toBe("search");
		expect(header(accounts?.init ?? {}, "LinkedIn-Version")).toBe("202609");
	});
});

describe("createCampaign", () => {
	test("group (DRAFT) → campaign (PAUSED) → inline creative (DRAFT)", async () => {
		const mock = api();
		restore = mock.restore;
		const res = await provider.createCampaign(ctx(), draft());
		expect(res).toEqual({
			campaignExternalId: "888",
			objects: [
				{ type: "ad_set", externalId: "urn:li:sponsoredCampaignGroup:777" },
				{ type: "creative", externalId: "urn:li:sponsoredCreative:999" },
			],
			status: "paused",
			manageUrl: "https://www.linkedin.com/campaignmanager/accounts/500/campaigns/888/details",
		});

		const typeahead = mock.calls.find((c) => c.url.pathname === "/rest/adTargetingEntities");
		expect(typeahead?.url.searchParams.get("query")).toBe("United States");

		const group = body(mock.calls.find((c) => c.url.pathname.endsWith("/adCampaignGroups")));
		expect(group).toEqual({
			account: "urn:li:sponsoredAccount:500",
			name: "B2B launch",
			runSchedule: { start: 1790812800000 },
			status: "DRAFT",
		});
		const campaign = body(mock.calls.find((c) => c.url.pathname.endsWith("/adCampaigns")));
		expect(campaign).toEqual({
			account: "urn:li:sponsoredAccount:500",
			campaignGroup: "urn:li:sponsoredCampaignGroup:777",
			name: "B2B launch",
			type: "SPONSORED_UPDATES",
			format: "STANDARD_UPDATE",
			objectiveType: "WEBSITE_VISIT",
			optimizationTargetType: "MAX_CLICK",
			costType: "CPM",
			unitCost: { amount: "0", currencyCode: "USD" },
			dailyBudget: { amount: "50.50", currencyCode: "USD" },
			locale: { language: "en", country: "US" },
			targetingCriteria: {
				include: {
					and: [
						{ or: { "urn:li:adTargetingFacet:locations": ["urn:li:geo:103644278"] } },
						{ or: { "urn:li:adTargetingFacet:titles": ["urn:li:title:9"] } },
						{ or: { "urn:li:adTargetingFacet:industries": ["urn:li:industry:4"] } },
					],
				},
			},
			runSchedule: { start: 1790812800000 },
			audienceExpansionEnabled: false,
			offsiteDeliveryEnabled: false,
			politicalIntent: "NOT_POLITICAL",
			status: "PAUSED",
		});
		const creativeCall = mock.calls.find((c) => c.url.pathname.endsWith("/creatives"));
		expect(creativeCall?.url.searchParams.get("action")).toBe("createInline");
		expect(body(creativeCall)).toEqual({
			creative: {
				name: "B2B launch — ad 1",
				campaign: "urn:li:sponsoredCampaign:888",
				intendedStatus: "DRAFT",
				inlineContent: {
					post: {
						adContext: { dscAdAccount: "urn:li:sponsoredAccount:500", dscStatus: "ACTIVE" },
						author: ORG,
						commentary: "Ship faster \\(really\\)",
						visibility: "PUBLIC",
						lifecycleState: "PUBLISHED",
						isReshareDisabledByAuthor: false,
						contentLandingPage: "https://saas.test",
						contentCallToActionLabel: "SIGN_UP",
						content: { media: { id: "urn:li:image:I1", title: "Try it" } },
					},
				},
			},
		});
		const imageInit = mock.calls.find((c) => c.url.pathname === "/rest/images");
		expect(body(imageInit)).toEqual({ initializeUploadRequest: { owner: ORG } });
	});

	test("lifetime budget → totalBudget with lifetime pacing and an end", async () => {
		const mock = api();
		restore = mock.restore;
		await provider.createCampaign(
			ctx(),
			draft({ dailyBudget: undefined, lifetimeBudget: 1000, endAt: "2026-10-31T00:00:00.000Z" }),
		);
		const campaign = body(mock.calls.find((c) => c.url.pathname.endsWith("/adCampaigns")));
		expect(campaign.totalBudget).toEqual({ amount: "1000.00", currencyCode: "USD" });
		expect(campaign.pacingStrategy).toBe("LIFETIME");
		expect(campaign.dailyBudget).toBeUndefined();
		expect(campaign.runSchedule).toEqual({ start: 1790812800000, end: 1793404800000 });
	});

	test("no organization → invalid_request before anything is sent", async () => {
		const mock = api();
		restore = mock.restore;
		const err = await thrown(provider.createCampaign(ctx({ metadata: {} }), draft()));
		expect(err.kind).toBe("invalid_request");
		expect(mock.calls).toHaveLength(0);
	});

	test("creative fails → campaign to PENDING_DELETION, draft group deleted", async () => {
		const mock = api((url, init) =>
			url.pathname.endsWith("/creatives") && init.method === "POST"
				? jsonResponse({ message: "Invalid landing page", status: 422 }, 422)
				: undefined,
		);
		restore = mock.restore;
		const err = await thrown(provider.createCampaign(ctx(), draft()));
		expect(err.kind).toBe("invalid_request");
		expect(err.details.orphanedExternalIds).toEqual([]);
		const campaignPatch = mock.calls.find(
			(c) => c.url.pathname === "/rest/adAccounts/500/adCampaigns/888",
		);
		expect(header(campaignPatch?.init ?? {}, "X-RestLi-Method")).toBe("PARTIAL_UPDATE");
		expect(body(campaignPatch)).toEqual({ patch: { $set: { status: "PENDING_DELETION" } } });
		const groupDelete = mock.calls.find((c) => c.init.method === "DELETE");
		expect(groupDelete?.url.pathname).toBe("/rest/adAccounts/500/adCampaignGroups/777");
	});

	test("cleanup failure lists the orphans", async () => {
		const mock = api((url, init) => {
			if (url.pathname.endsWith("/creatives") && init.method === "POST")
				return jsonResponse({}, 400);
			if (init.method === "DELETE") return jsonResponse({}, 500);
			return undefined;
		});
		restore = mock.restore;
		const err = await thrown(provider.createCampaign(ctx(), draft()));
		expect(err.details.orphanedExternalIds).toEqual(["urn:li:sponsoredCampaignGroup:777"]);
	});

	test("campaign create times out → unknown_outcome, not retried, group cleaned", async () => {
		const mock = api((url) => {
			if (url.pathname.endsWith("/adCampaigns"))
				throw new DOMException("timed out", "TimeoutError");
			return undefined;
		});
		restore = mock.restore;
		const err = await thrown(provider.createCampaign(ctx(), draft()));
		expect(err.kind).toBe("unknown_outcome");
		expect(mock.calls.filter((c) => c.url.pathname.endsWith("/adCampaigns"))).toHaveLength(1);
		expect(mock.calls.some((c) => c.init.method === "DELETE")).toBe(true);
	});
});

describe("status, insights, targeting", () => {
	test("activate: group, draft creatives, then campaign; pause: campaign only", async () => {
		const mock = mockFetch((url, init) => {
			if (init.method !== "POST" && url.pathname === "/rest/adAccounts/500/adCampaigns/888") {
				return jsonResponse({
					campaignGroup: "urn:li:sponsoredCampaignGroup:777",
					status: "PAUSED",
				});
			}
			if (url.pathname === "/rest/adAccounts/500/creatives") {
				return jsonResponse({
					elements: [
						{ id: "urn:li:sponsoredCreative:999", intendedStatus: "DRAFT" },
						{ id: "urn:li:sponsoredCreative:1000", intendedStatus: "ARCHIVED" },
					],
				});
			}
			return new Response(null, { status: 204 });
		});
		restore = mock.restore;
		await provider.setStatus(ctx(), "888", "active");
		const writes = mock.calls.filter((c) => c.init.method === "POST");
		expect(writes.map((c) => [decodeURIComponent(c.url.pathname), body(c)])).toEqual([
			["/rest/adAccounts/500/adCampaignGroups/777", { patch: { $set: { status: "ACTIVE" } } }],
			[
				"/rest/adAccounts/500/creatives/urn:li:sponsoredCreative:999",
				{ patch: { $set: { intendedStatus: "ACTIVE" } } },
			],
			["/rest/adAccounts/500/adCampaigns/888", { patch: { $set: { status: "ACTIVE" } } }],
		]);

		mock.calls.length = 0;
		await provider.setStatus(ctx(), "888", "paused");
		expect(mock.calls.map((c) => [c.url.pathname, body(c)])).toEqual([
			["/rest/adAccounts/500/adCampaigns/888", { patch: { $set: { status: "PAUSED" } } }],
		]);
	});

	test("status patch timeout → unknown_outcome", async () => {
		const mock = mockFetch(() => {
			throw new DOMException("timed out", "TimeoutError");
		});
		restore = mock.restore;
		expect((await thrown(provider.setStatus(ctx(), "888", "paused"))).kind).toBe("unknown_outcome");
		expect(mock.calls).toHaveLength(1);
	});

	test("insights query: pivot CAMPAIGN, DAILY, date range, fields", async () => {
		const mock = mockFetch(() =>
			jsonResponse({
				elements: [
					{
						dateRange: { start: { year: 2026, month: 10, day: 1 } },
						pivotValues: ["urn:li:sponsoredCampaign:888"],
						costInLocalCurrency: "7.5",
						impressions: 10,
					},
				],
			}),
		);
		restore = mock.restore;
		const rows = await provider.getInsights(ctx(), {
			campaignExternalIds: ["888"],
			since: "2026-10-01",
			until: "2026-10-07",
		});
		expect(rows[0]).toMatchObject({
			campaignExternalId: "888",
			date: "2026-10-01",
			spend: 7.5,
			impressions: 10,
		});
		const href = mock.calls[0]?.url.href ?? "";
		expect(href).toContain("q=analytics&pivot=CAMPAIGN&timeGranularity=DAILY");
		expect(href).toContain(
			"dateRange=(start:(year:2026,month:10,day:1),end:(year:2026,month:10,day:7))",
		);
		expect(href).toContain("campaigns=List(urn%3Ali%3AsponsoredCampaign%3A888)");
		expect(href).toContain(
			"fields=dateRange,pivotValues,costInLocalCurrency,impressions,clicks,externalWebsiteConversions,videoViews",
		);
	});

	test("searchTargeting uses the typeahead per facet", async () => {
		const mock = mockFetch(() =>
			jsonResponse({ elements: [{ urn: "urn:li:title:9", name: "Engineer" }] }),
		);
		restore = mock.restore;
		expect(
			await provider.searchTargeting?.(ctx(), { type: "job_title", query: "eng", limit: 5 }),
		).toEqual([{ id: "urn:li:title:9", name: "Engineer", type: "job_title" }]);
		expect(mock.calls[0]?.url.searchParams.get("facet")).toBe("urn:li:adTargetingFacet:titles");
		expect(
			await provider.searchTargeting?.(ctx(), { type: "interest", query: "x", limit: 5 }),
		).toEqual([]);
	});
});
