import { afterEach, describe, expect, test } from "bun:test";
import { isProviderError, type ProviderError } from "../errors";
import { channel, header, jsonResponse, mockFetch, type RecordedCall } from "../testing/fetch-mock";
import {
	classifyGoogleAdsError,
	createGoogleAdsProvider,
	googleSchedule,
	mapGoogleCampaignStatus,
	mapGoogleCustomerStatus,
	mapGoogleInsightsRow,
	parseKeyword,
} from "./google-ads";
import type { AdDraft, AdsContext, CampaignDraft } from "./types";

const env = {
	GOOGLE_ADS_CLIENT_ID: "cid",
	GOOGLE_ADS_CLIENT_SECRET: "secret",
	GOOGLE_ADS_DEVELOPER_TOKEN: "devtok",
	GOOGLE_ADS_LOGIN_CUSTOMER_ID: "",
	GOOGLE_ADS_API_VERSION: "v23",
};
const provider = createGoogleAdsProvider(env);

const ctx = (over: Partial<AdsContext> = {}): AdsContext => ({
	accountExternalId: "1234567890",
	accessToken: "tok",
	currency: "USD",
	metadata: { loginCustomerId: "1234567890", timeZone: "America/New_York" },
	logger: channel().logger,
	...over,
});

const draft = (over: Partial<CampaignDraft> = {}): CampaignDraft => ({
	name: "Search Q4",
	objective: "traffic",
	dailyBudget: 25.5,
	startAt: "2026-10-01T12:00:00.000Z",
	endAt: "2026-10-31T12:00:00.000Z",
	targeting: {
		countries: ["US", "CA"],
		languages: ["en"],
		keywords: ["running shoes", '"trail shoes"', "[shoe store]"],
	},
	ads: [
		{
			name: "RSA",
			format: "search",
			primaryText: "",
			destinationUrl: "https://shop.test",
			media: [],
			searchHeadlines: ["Shoes on sale", "Free shipping", "Shop today"],
			searchDescriptions: ["Great shoes for every runner.", "Order now, delivered fast."],
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

const adsFailure = (status: number, errorCode: Record<string, string>, message = "nope") =>
	JSON.stringify({
		error: {
			code: status,
			message: "Request contains an invalid argument.",
			details: [
				{
					"@type": "type.googleapis.com/google.ads.googleads.v23.errors.GoogleAdsFailure",
					errors: [{ errorCode, message }],
				},
			],
		},
	});

describe("pure mapping", () => {
	test("keyword match types follow Google's syntax", () => {
		expect(parseKeyword("running shoes")).toEqual({ text: "running shoes", matchType: "BROAD" });
		expect(parseKeyword('"trail shoes"')).toEqual({ text: "trail shoes", matchType: "PHRASE" });
		expect(parseKeyword("[shoe store]")).toEqual({ text: "shoe store", matchType: "EXACT" });
	});

	test("schedule fields follow the API version and the account time zone", () => {
		expect(googleSchedule("v23", "2026-10-01T02:00:00Z", null, "America/Los_Angeles")).toEqual({
			startDateTime: "2026-09-30 00:00:00",
		});
		expect(googleSchedule("v22", "2026-10-01T12:00:00Z", "2026-10-31T12:00:00Z", null)).toEqual({
			startDate: "2026-10-01",
			endDate: "2026-10-31",
		});
	});

	test("customer and campaign status", () => {
		expect(mapGoogleCustomerStatus("ENABLED", false)).toBe("active");
		expect(mapGoogleCustomerStatus("ENABLED", true)).toBe("disabled");
		expect(mapGoogleCustomerStatus("CANCELED", false)).toBe("disabled");
		expect(mapGoogleCampaignStatus("PAUSED", "PAUSED")).toBe("paused");
		expect(mapGoogleCampaignStatus("REMOVED", "REMOVED")).toBe("deleted");
		expect(mapGoogleCampaignStatus("ENABLED", "ENDED")).toBe("archived");
		expect(mapGoogleCampaignStatus("ENABLED", "NOT_ELIGIBLE", ["HAS_ADS_DISAPPROVED"])).toBe(
			"rejected",
		);
		expect(mapGoogleCampaignStatus("ENABLED", "LIMITED", ["MOST_ADS_UNDER_REVIEW"])).toBe(
			"in_review",
		);
		expect(mapGoogleCampaignStatus("ENABLED", "ELIGIBLE")).toBe("active");
	});

	test("insights: cost from micros", () => {
		expect(
			mapGoogleInsightsRow({
				campaign: { id: "99" },
				segments: { date: "2026-10-02" },
				metrics: { costMicros: "12340000", impressions: "1000", clicks: "25", conversions: 1.5 },
			}),
		).toEqual({
			campaignExternalId: "99",
			date: "2026-10-02",
			spend: 12.34,
			impressions: 1000,
			clicks: 25,
			conversions: 1.5,
		});
	});

	test("error classification", () => {
		expect(
			classifyGoogleAdsError(429, adsFailure(429, { quotaError: "RESOURCE_TEMPORARILY_EXHAUSTED" }))
				?.kind,
		).toBe("rate_limited");
		const dev = classifyGoogleAdsError(
			403,
			adsFailure(403, { authorizationError: "DEVELOPER_TOKEN_NOT_APPROVED" }),
		);
		expect(dev?.kind).toBe("invalid_request");
		expect(dev?.details.platformCode).toBe("authorizationError.DEVELOPER_TOKEN_NOT_APPROVED");
		// Permission problems keep the default 403 → auth mapping.
		expect(
			classifyGoogleAdsError(
				403,
				adsFailure(403, { authorizationError: "USER_PERMISSION_DENIED" }),
			),
		).toBeUndefined();
		expect(
			classifyGoogleAdsError(400, adsFailure(400, { rangeError: "TOO_LOW" }, "Budget too low"))
				?.message,
		).toBe("Budget too low");
		expect(classifyGoogleAdsError(503, "{}")).toBeUndefined();
	});
});

describe("validate", () => {
	test("a good draft passes", () => {
		expect(provider.validate(draft(), { currency: "USD" })).toEqual([]);
	});

	test("RSA limits, formats, lifetime, keywords, targeting", () => {
		const errors = provider.validate(
			draft({
				dailyBudget: undefined,
				lifetimeBudget: 100,
				targeting: { countries: ["US"], genders: ["male"], keywords: ["x ".repeat(11).trim()] },
				ads: [
					{
						...(draft().ads[0] as AdDraft),
						searchHeadlines: ["a", "b"],
						searchDescriptions: ["x".repeat(91), "ok"],
					},
					{
						name: "img",
						format: "image",
						primaryText: "hi",
						destinationUrl: "https://x.test",
						media: [],
					},
				],
			}),
			{ currency: "USD" },
		);
		expect(errors).toContain("Google Ads campaigns here support daily budgets only");
		expect(errors).toContain(
			"Google Ads gender targeting is not supported yet — remove it to continue",
		);
		expect(errors).toContain("Ad 1: A search ad needs 3-15 headlines");
		expect(errors).toContain("Ad 1: Each description must be 1-90 characters");
		expect(
			errors.some((e) => e.startsWith("Ad 2: Google Ads image/video ads need Performance Max")),
		).toBe(true);
		expect(errors.some((e) => e.includes("more than 10 words"))).toBe(true);
		expect(
			provider.validate(draft({ targeting: { countries: ["US"] } }), { currency: "USD" }),
		).toContain("A search campaign needs at least one keyword (it cannot serve without one)");
	});
});

describe("OAuth + accounts", () => {
	test("isConfigured requires the developer token", () => {
		expect(provider.isConfigured()).toBe(true);
		expect(createGoogleAdsProvider({ ...env, GOOGLE_ADS_DEVELOPER_TOKEN: "" }).isConfigured()).toBe(
			false,
		);
	});

	test("authorization URL: adwords scope, offline, consent", async () => {
		const { url } = await provider.getAuthorizationUrl({
			redirectUri: "https://app.test/cb",
			state: "s",
		});
		const q = new URL(url).searchParams;
		expect(q.get("scope")).toBe("https://www.googleapis.com/auth/adwords");
		expect(q.get("access_type")).toBe("offline");
		expect(q.get("prompt")).toBe("consent");
	});

	test("exchange → accessible customers → described accounts", async () => {
		const mock = mockFetch((url) => {
			if (url.hostname === "oauth2.googleapis.com") {
				return jsonResponse({ access_token: "at", refresh_token: "rt", expires_in: 3600 });
			}
			if (url.pathname === "/v23/customers:listAccessibleCustomers") {
				return jsonResponse({ resourceNames: ["customers/111", "customers/222", "customers/333"] });
			}
			if (url.pathname === "/v23/customers/111/googleAds:search") {
				return jsonResponse({
					results: [
						{
							customer: {
								id: "111",
								descriptiveName: "Shop",
								currencyCode: "EUR",
								timeZone: "Europe/Berlin",
								status: "ENABLED",
								manager: false,
							},
						},
					],
				});
			}
			if (url.pathname === "/v23/customers/222/googleAds:search") {
				return jsonResponse({
					results: [{ customer: { id: "222", status: "ENABLED", manager: true } }],
				});
			}
			return new Response(adsFailure(400, { authorizationError: "CUSTOMER_NOT_ENABLED" }), {
				status: 400,
			});
		});
		restore = mock.restore;
		const res = await provider.exchangeCode({ code: "c", redirectUri: "https://app.test/cb" });
		expect(res.tokens).toMatchObject({ accessToken: "at", refreshToken: "rt" });
		expect(res.accounts).toEqual([
			{
				externalId: "111",
				name: "Shop",
				currency: "EUR",
				timezone: "Europe/Berlin",
				status: "active",
				metadata: {
					loginCustomerId: "111",
					manager: false,
					testAccount: false,
					timeZone: "Europe/Berlin",
				},
			},
			expect.objectContaining({ externalId: "222", status: "disabled" }),
			expect.objectContaining({ externalId: "333", status: "disabled" }),
		]);
		const search = mock.calls.find((c) => c.url.pathname.endsWith("/111/googleAds:search"));
		expect(header(search?.init ?? {}, "developer-token")).toBe("devtok");
		expect(header(search?.init ?? {}, "login-customer-id")).toBe("111");
	});
});

describe("createCampaign", () => {
	const lookups = (url: URL, init: RequestInit) => {
		const q = String(JSON.parse(String(init.body ?? "{}")).query ?? "");
		if (url.pathname.endsWith("googleAds:search") && q.includes("FROM geo_target_constant")) {
			return jsonResponse({
				results: [
					{ geoTargetConstant: { resourceName: "geoTargetConstants/2840", countryCode: "US" } },
					{ geoTargetConstant: { resourceName: "geoTargetConstants/2124", countryCode: "CA" } },
				],
			});
		}
		if (url.pathname.endsWith("googleAds:search") && q.includes("FROM language_constant")) {
			return jsonResponse({
				results: [{ languageConstant: { resourceName: "languageConstants/1000", code: "en" } }],
			});
		}
		return undefined;
	};

	test("one atomic mutate: budget in micros, everything PAUSED, criteria, keywords, RSA", async () => {
		const mock = mockFetch((url, init) => {
			const hit = lookups(url, init);
			if (hit) return hit;
			if (url.pathname.endsWith("googleAds:mutate")) {
				return jsonResponse({
					mutateOperationResponses: [
						{ campaignBudgetResult: { resourceName: "customers/1234567890/campaignBudgets/7" } },
						{ campaignResult: { resourceName: "customers/1234567890/campaigns/8" } },
						{ adGroupResult: { resourceName: "customers/1234567890/adGroups/9" } },
						{ adGroupAdResult: { resourceName: "customers/1234567890/adGroupAds/9~10" } },
					],
				});
			}
			return jsonResponse({}, 404);
		});
		restore = mock.restore;
		const res = await provider.createCampaign(ctx(), draft());
		expect(res).toEqual({
			campaignExternalId: "8",
			objects: [
				{ type: "ad_set", externalId: "customers/1234567890/adGroups/9" },
				{ type: "ad", externalId: "customers/1234567890/adGroupAds/9~10" },
			],
			status: "paused",
			manageUrl: null,
		});
		const mutates = mock.calls.filter((c) => c.url.pathname.endsWith("googleAds:mutate"));
		expect(mutates).toHaveLength(1);
		const ops = body(mutates[0]).mutateOperations as Record<
			string,
			{ create: Record<string, unknown> }
		>[];
		const c = "customers/1234567890";
		expect(ops[0]?.campaignBudgetOperation?.create).toMatchObject({
			resourceName: `${c}/campaignBudgets/-1`,
			amountMicros: "25500000",
			deliveryMethod: "STANDARD",
			explicitlyShared: false,
		});
		expect(ops[1]?.campaignOperation?.create).toMatchObject({
			resourceName: `${c}/campaigns/-2`,
			status: "PAUSED",
			advertisingChannelType: "SEARCH",
			campaignBudget: `${c}/campaignBudgets/-1`,
			targetSpend: {},
			containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
			startDateTime: "2026-10-01 00:00:00",
			endDateTime: "2026-10-31 23:59:59",
			networkSettings: { targetGoogleSearch: true, targetContentNetwork: false },
		});
		const criteria = ops
			.filter((o) => o.campaignCriterionOperation)
			.map((o) => o.campaignCriterionOperation?.create);
		expect(criteria).toEqual([
			{ campaign: `${c}/campaigns/-2`, location: { geoTargetConstant: "geoTargetConstants/2840" } },
			{ campaign: `${c}/campaigns/-2`, location: { geoTargetConstant: "geoTargetConstants/2124" } },
			{ campaign: `${c}/campaigns/-2`, language: { languageConstant: "languageConstants/1000" } },
		]);
		const adGroup = ops.find((o) => o.adGroupOperation)?.adGroupOperation?.create;
		expect(adGroup).toMatchObject({ resourceName: `${c}/adGroups/-3`, status: "PAUSED" });
		const keywords = ops
			.filter((o) => o.adGroupCriterionOperation)
			.map((o) => o.adGroupCriterionOperation?.create.keyword);
		expect(keywords).toEqual([
			{ text: "running shoes", matchType: "BROAD" },
			{ text: "trail shoes", matchType: "PHRASE" },
			{ text: "shoe store", matchType: "EXACT" },
		]);
		const ad = ops.find((o) => o.adGroupAdOperation)?.adGroupAdOperation?.create;
		expect(ad).toEqual({
			adGroup: `${c}/adGroups/-3`,
			status: "PAUSED",
			ad: {
				finalUrls: ["https://shop.test"],
				responsiveSearchAd: {
					headlines: [{ text: "Shoes on sale" }, { text: "Free shipping" }, { text: "Shop today" }],
					descriptions: [
						{ text: "Great shoes for every runner." },
						{ text: "Order now, delivered fast." },
					],
				},
			},
		});
		expect(header(mutates[0]?.init ?? {}, "login-customer-id")).toBe("1234567890");
	});

	test("unknown country: rejected before any mutate", async () => {
		const mock = mockFetch((url, init) => lookups(url, init) ?? jsonResponse({}, 404));
		restore = mock.restore;
		const err = await thrown(
			provider.createCampaign(
				ctx(),
				draft({ targeting: { ...draft().targeting, countries: ["US", "XK"] } }),
			),
		);
		expect(err.kind).toBe("invalid_request");
		expect(err.message).toContain("XK");
		expect(mock.calls.some((c) => c.url.pathname.endsWith("googleAds:mutate"))).toBe(false);
	});

	test("mutate timeout → unknown_outcome, sent once, nothing to clean up (atomic)", async () => {
		const mock = mockFetch((url, init) => {
			const hit = lookups(url, init);
			if (hit) return hit;
			throw new DOMException("timed out", "TimeoutError");
		});
		restore = mock.restore;
		const err = await thrown(provider.createCampaign(ctx(), draft()));
		expect(err.kind).toBe("unknown_outcome");
		expect(mock.calls.filter((c) => c.url.pathname.endsWith("googleAds:mutate"))).toHaveLength(1);
		expect(err.details.orphanedExternalIds).toBeUndefined();
	});

	test("mutate rejected → invalid_request with Google's message", async () => {
		const mock = mockFetch((url, init) => {
			const hit = lookups(url, init);
			if (hit) return hit;
			return new Response(
				adsFailure(
					400,
					{ campaignBudgetError: "NON_MULTIPLE_OF_MINIMUM_CURRENCY_UNIT" },
					"Budget unit",
				),
				{
					status: 400,
				},
			);
		});
		restore = mock.restore;
		const err = await thrown(provider.createCampaign(ctx(), draft()));
		expect(err.kind).toBe("invalid_request");
		expect(err.message).toBe("Budget unit");
	});
});

describe("status, insights, targeting", () => {
	test("activate enables paused ad groups/ads and the campaign in one mutate", async () => {
		const mock = mockFetch((_url, init) => {
			const q = String(JSON.parse(String(init.body ?? "{}")).query ?? "");
			if (q.includes("FROM ad_group_ad")) {
				return jsonResponse({
					results: [{ adGroupAd: { resourceName: "customers/1234567890/adGroupAds/9~10" } }],
				});
			}
			if (q.includes("FROM ad_group ")) {
				return jsonResponse({
					results: [{ adGroup: { resourceName: "customers/1234567890/adGroups/9" } }],
				});
			}
			return jsonResponse({ mutateOperationResponses: [] });
		});
		restore = mock.restore;
		await provider.setStatus(ctx(), "8", "active");
		const mutate = mock.calls.filter((c) => c.url.pathname.endsWith("googleAds:mutate"));
		expect(mutate).toHaveLength(1);
		expect(body(mutate[0]).mutateOperations).toEqual([
			{
				adGroupOperation: {
					update: { resourceName: "customers/1234567890/adGroups/9", status: "ENABLED" },
					updateMask: "status",
				},
			},
			{
				adGroupAdOperation: {
					update: { resourceName: "customers/1234567890/adGroupAds/9~10", status: "ENABLED" },
					updateMask: "status",
				},
			},
			{
				campaignOperation: {
					update: { resourceName: "customers/1234567890/campaigns/8", status: "ENABLED" },
					updateMask: "status",
				},
			},
		]);

		mock.calls.length = 0;
		await provider.setStatus(ctx(), "8", "paused");
		expect(mock.calls).toHaveLength(1);
		expect(body(mock.calls[0]).mutateOperations).toEqual([
			{
				campaignOperation: {
					update: { resourceName: "customers/1234567890/campaigns/8", status: "PAUSED" },
					updateMask: "status",
				},
			},
		]);
	});

	test("getCampaignStatus + insights via GAQL", async () => {
		const mock = mockFetch((_url, init) => {
			const q = String(JSON.parse(String(init.body ?? "{}")).query ?? "");
			if (q.includes("segments.date")) {
				return jsonResponse({
					results: [
						{
							campaign: { id: "8" },
							segments: { date: "2026-10-02" },
							metrics: { costMicros: "5000000", clicks: "3" },
						},
					],
				});
			}
			return jsonResponse({
				results: [{ campaign: { status: "ENABLED", primaryStatus: "ELIGIBLE" } }],
			});
		});
		restore = mock.restore;
		expect(await provider.getCampaignStatus(ctx(), "8")).toBe("active");
		const rows = await provider.getInsights(ctx(), {
			campaignExternalIds: ["8"],
			since: "2026-10-01",
			until: "2026-10-07",
		});
		expect(rows).toEqual([
			{
				campaignExternalId: "8",
				date: "2026-10-02",
				spend: 5,
				impressions: 0,
				clicks: 3,
				conversions: 0,
			},
		]);
		const query = body(mock.calls[1]).query as string;
		expect(query).toContain("campaign.id IN (8)");
		expect(query).toContain("segments.date BETWEEN '2026-10-01' AND '2026-10-07'");
	});

	test("searchTargeting suggests geo targets", async () => {
		const mock = mockFetch(() =>
			jsonResponse({
				geoTargetConstantSuggestions: [
					{
						geoTargetConstant: {
							resourceName: "geoTargetConstants/1026339",
							name: "Austin",
							canonicalName: "Austin,Texas,United States",
						},
					},
				],
			}),
		);
		restore = mock.restore;
		expect(
			await provider.searchTargeting?.(ctx(), { type: "location", query: "Austin", limit: 5 }),
		).toEqual([
			{ id: "geoTargetConstants/1026339", name: "Austin,Texas,United States", type: "location" },
		]);
		expect(body(mock.calls[0])).toEqual({ locale: "en", locationNames: { names: ["Austin"] } });
		expect(
			await provider.searchTargeting?.(ctx(), { type: "keyword", query: "x", limit: 5 }),
		).toEqual([]);
	});
});
