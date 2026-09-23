import { afterEach, describe, expect, test } from "bun:test";
import { isProviderError, type ProviderError } from "../errors";
import {
	channel,
	graphErrorResponse,
	jsonResponse,
	mockFetch,
	type RecordedCall,
} from "../testing/fetch-mock";
import {
	createMetaAdsProvider,
	mapMetaAccountStatus,
	mapMetaCampaignStatus,
	mapMetaInsightsRow,
	metaTargetingSpec,
	toMetaAmount,
} from "./meta-ads";
import type { AdDraft, AdsContext, CampaignDraft } from "./types";

const env = { META_APP_ID: "app", META_APP_SECRET: "secret", META_GRAPH_VERSION: "v24.0" };
const provider = createMetaAdsProvider(env, { videoPollIntervalMs: 0, videoPollMaxAttempts: 3 });

const ctx = (over: Partial<AdsContext> = {}): AdsContext => ({
	accountExternalId: "123",
	accessToken: "tok",
	currency: "USD",
	metadata: { pageId: "page-1", instagramUserId: "ig-1" },
	logger: channel().logger,
	...over,
});

const draft = (over: Partial<CampaignDraft> = {}): CampaignDraft => ({
	name: "Autumn sale",
	objective: "traffic",
	dailyBudget: 25.5,
	startAt: "2026-10-01T00:00:00.000Z",
	endAt: null,
	targeting: {
		countries: ["US", "CA"],
		ageMin: 25,
		ageMax: 45,
		genders: ["female"],
		interests: [{ id: "6003139266461", name: "Running", type: "interest" }],
	},
	ads: [
		{
			name: "Ad",
			format: "image",
			primaryText: "Shoes for fall",
			headline: "50% off",
			callToAction: "shop_now",
			destinationUrl: "https://shop.test/fall",
			media: [
				{ url: "https://cdn.test/a.jpg", kind: "image", mimeType: "image/jpeg", sizeBytes: 1 },
			],
		},
	],
	...over,
});

const body = (call: RecordedCall | undefined) => JSON.parse(String(call?.init.body ?? "{}"));
const posts = (calls: RecordedCall[], suffix: string) =>
	calls.filter((c) => c.init.method === "POST" && c.url.pathname.endsWith(suffix));

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

describe("pure mapping", () => {
	test("budgets use Meta's offsets exactly", () => {
		expect(toMetaAmount(25.5, "USD")).toBe("2550");
		expect(toMetaAmount(0.29, "EUR")).toBe("29");
		// JPY/HUF/TWD etc. have offset 1: whole units.
		expect(toMetaAmount(1500, "JPY")).toBe("1500");
		expect(toMetaAmount(1500, "HUF")).toBe("1500");
		expect(() => toMetaAmount(10.5, "JPY")).toThrow();
	});

	test("account status", () => {
		expect(mapMetaAccountStatus(1)).toBe("active");
		expect(mapMetaAccountStatus(9)).toBe("active");
		expect(mapMetaAccountStatus(7)).toBe("pending");
		expect(mapMetaAccountStatus(2)).toBe("disabled");
		expect(mapMetaAccountStatus(101)).toBe("disabled");
	});

	test("campaign status combines effective_status with ad review", () => {
		expect(mapMetaCampaignStatus("PAUSED", [])).toBe("paused");
		expect(mapMetaCampaignStatus("ARCHIVED", [])).toBe("archived");
		expect(mapMetaCampaignStatus("DELETED", [])).toBe("deleted");
		expect(mapMetaCampaignStatus("WITH_ISSUES", [])).toBe("rejected");
		expect(mapMetaCampaignStatus("ACTIVE", ["PENDING_REVIEW"])).toBe("in_review");
		expect(mapMetaCampaignStatus("ACTIVE", ["DISAPPROVED", "DISAPPROVED"])).toBe("rejected");
		expect(mapMetaCampaignStatus("ACTIVE", ["ACTIVE", "PENDING_REVIEW"])).toBe("active");
	});

	test("targeting spec", () => {
		expect(metaTargetingSpec(draft().targeting)).toEqual({
			geo_locations: { countries: ["US", "CA"] },
			age_min: 25,
			age_max: 45,
			genders: [2],
			flexible_spec: [{ interests: [{ id: "6003139266461", name: "Running" }] }],
			targeting_automation: { advantage_audience: 0 },
		});
		const spec = metaTargetingSpec({
			countries: ["US"],
			locations: [
				{ id: "city:2418779", name: "Austin", type: "location" },
				{ id: "region:3847", name: "Texas", type: "location" },
			],
		});
		expect(spec.geo_locations).toEqual({
			cities: [{ key: "2418779" }],
			regions: [{ key: "3847" }],
		});
	});

	test("insights: spend is major units; conversions = purchase + lead", () => {
		expect(
			mapMetaInsightsRow("c1", {
				date_start: "2026-10-01",
				spend: "12.34",
				impressions: "1000",
				reach: "800",
				clicks: "40",
				actions: [
					{ action_type: "purchase", value: "2" },
					{ action_type: "lead", value: "3" },
					{ action_type: "offsite_conversion.fb_pixel_purchase", value: "2" },
					{ action_type: "video_view", value: "50" },
				],
			}),
		).toEqual({
			campaignExternalId: "c1",
			date: "2026-10-01",
			spend: 12.34,
			impressions: 1000,
			reach: 800,
			clicks: 40,
			conversions: 5,
			videoViews: 50,
		});
	});
});

describe("validate", () => {
	test("a good draft passes", () => {
		expect(provider.validate(draft(), { currency: "USD" })).toEqual([]);
	});

	test("documented USD minimum, lifetime needs end, unsupported targeting, media per format", () => {
		const errors = provider.validate(
			draft({
				dailyBudget: 1,
				targeting: { countries: ["US"], keywords: ["shoes"], ageMin: 10 },
				ads: [
					{ ...(draft().ads[0] as AdDraft), format: "carousel" },
					{ ...(draft().ads[0] as AdDraft), format: "video" },
				],
			}),
			{ currency: "USD" },
		);
		expect(errors).toContain("Meta requires a daily budget of at least 2.5 USD");
		expect(errors).toContain("Meta keyword targeting is not supported yet — remove it to continue");
		expect(errors).toContain("Meta ages must be between 13 and 65");
		expect(errors).toContain("Ad 1: A carousel needs 2-10 images");
		expect(errors).toContain(
			"Ad 2: A video ad needs exactly one video (plus optionally one thumbnail image)",
		);
		expect(
			provider.validate(draft({ dailyBudget: undefined, lifetimeBudget: 100 }), {
				currency: "USD",
			}),
		).toContain("A lifetime budget needs an end date");
		expect(provider.validate(draft({ objective: "app_installs" }), { currency: "USD" })).toContain(
			'Meta does not support the "app_installs" objective here',
		);
		expect(provider.validate(draft({ dailyBudget: 10.5 }), { currency: "JPY" })).toContain(
			"Meta budgets in JPY must be whole amounts",
		);
	});
});

describe("OAuth + accounts", () => {
	test("authorization URL asks for the ads permissions", async () => {
		const { url } = await provider.getAuthorizationUrl({
			redirectUri: "https://app.test/cb",
			state: "s",
		});
		const u = new URL(url);
		expect(u.pathname).toBe("/v24.0/dialog/oauth");
		expect(u.searchParams.get("scope")).toBe(
			"ads_management,ads_read,business_management,pages_show_list,pages_read_engagement,instagram_basic",
		);
	});

	test("exchange → long-lived token → ad accounts with pages in metadata", async () => {
		const mock = mockFetch((url) => {
			if (url.pathname.endsWith("/oauth/access_token")) {
				return jsonResponse({
					access_token: url.searchParams.get("fb_exchange_token") ? "long" : "short",
					expires_in: 5_184_000,
				});
			}
			if (url.pathname.endsWith("/me/adaccounts")) {
				return jsonResponse({
					data: [
						{
							account_id: "123",
							name: "Main",
							currency: "EUR",
							timezone_name: "Europe/Berlin",
							account_status: 1,
							min_daily_budget: 100,
						},
						{ account_id: "456", account_status: 2 },
					],
				});
			}
			if (url.pathname.endsWith("/me/accounts")) {
				return jsonResponse({
					data: [{ id: "p1", name: "Shop", instagram_business_account: { id: "ig1" } }],
				});
			}
			return jsonResponse({}, 404);
		});
		restore = mock.restore;
		const res = await provider.exchangeCode({ code: "c", redirectUri: "https://app.test/cb" });
		expect(res.tokens.accessToken).toBe("long");
		expect(res.accounts).toEqual([
			{
				externalId: "123",
				name: "Main",
				currency: "EUR",
				timezone: "Europe/Berlin",
				status: "active",
				metadata: {
					accountStatus: 1,
					minDailyBudget: 100,
					businessId: null,
					availablePages: [{ id: "p1", name: "Shop", instagramUserId: "ig1" }],
				},
			},
			expect.objectContaining({ externalId: "456", status: "disabled", currency: "USD" }),
		]);
	});
});

describe("createCampaign", () => {
	const happy = () =>
		mockFetch((url, init) => {
			const p = url.pathname;
			if (init.method === "POST" && p.endsWith("/act_123/campaigns"))
				return jsonResponse({ id: "c1" });
			if (init.method === "POST" && p.endsWith("/act_123/adsets"))
				return jsonResponse({ id: "s1" });
			if (init.method === "POST" && p.endsWith("/act_123/adcreatives"))
				return jsonResponse({ id: "cr1" });
			if (init.method === "POST" && p.endsWith("/act_123/ads")) return jsonResponse({ id: "ad1" });
			if (init.method === "POST" && p.endsWith("/act_123/advideos"))
				return jsonResponse({ id: "v1" });
			if (p.endsWith("/v1")) return jsonResponse({ status: { video_status: "ready" } });
			return jsonResponse({ error: { message: "unexpected", code: 100 } }, 400);
		});

	test("creates campaign → ad set → creative → ad, all PAUSED, budget in cents", async () => {
		const mock = happy();
		restore = mock.restore;
		const res = await provider.createCampaign(ctx(), draft());
		expect(res).toEqual({
			campaignExternalId: "c1",
			objects: [
				{ type: "ad_set", externalId: "s1" },
				{ type: "creative", externalId: "cr1" },
				{ type: "ad", externalId: "ad1" },
			],
			status: "paused",
			manageUrl:
				"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=123&selected_campaign_ids=c1",
		});
		expect(mock.calls.map((c) => `${c.init.method} ${c.url.pathname}`)).toEqual([
			"POST /v24.0/act_123/campaigns",
			"POST /v24.0/act_123/adsets",
			"POST /v24.0/act_123/adcreatives",
			"POST /v24.0/act_123/ads",
		]);
		const [campaign, adSet, creative, ad] = mock.calls.map(body);
		expect(campaign).toEqual({
			name: "Autumn sale",
			objective: "OUTCOME_TRAFFIC",
			status: "PAUSED",
			special_ad_categories: [],
			buying_type: "AUCTION",
			is_adset_budget_sharing_enabled: false,
		});
		expect(adSet).toMatchObject({
			campaign_id: "c1",
			status: "PAUSED",
			daily_budget: "2550",
			billing_event: "IMPRESSIONS",
			optimization_goal: "LINK_CLICKS",
			bid_strategy: "LOWEST_COST_WITHOUT_CAP",
			start_time: 1790812800,
		});
		expect(adSet.targeting.geo_locations).toEqual({ countries: ["US", "CA"] });
		expect(adSet.lifetime_budget).toBeUndefined();
		expect(creative.object_story_spec).toEqual({
			page_id: "page-1",
			instagram_user_id: "ig-1",
			link_data: {
				link: "https://shop.test/fall",
				message: "Shoes for fall",
				name: "50% off",
				call_to_action: { type: "SHOP_NOW", value: { link: "https://shop.test/fall" } },
				picture: "https://cdn.test/a.jpg",
			},
		});
		expect(ad).toEqual({
			name: "Autumn sale — ad 1",
			adset_id: "s1",
			creative: { creative_id: "cr1" },
			status: "PAUSED",
		});
	});

	test("lifetime budget + leads objective with pixel", async () => {
		const mock = happy();
		restore = mock.restore;
		await provider.createCampaign(
			ctx({ metadata: { pageId: "page-1", pixelId: "px1" } }),
			draft({
				objective: "leads",
				dailyBudget: undefined,
				lifetimeBudget: 300,
				endAt: "2026-10-31T00:00:00.000Z",
			}),
		);
		const adSet = body(posts(mock.calls, "/adsets")[0]);
		expect(adSet.lifetime_budget).toBe("30000");
		expect(adSet.daily_budget).toBeUndefined();
		expect(adSet.end_time).toBe(1793404800);
		expect(adSet.promoted_object).toEqual({ pixel_id: "px1", custom_event_type: "LEAD" });
		expect(body(posts(mock.calls, "/campaigns")[0]).objective).toBe("OUTCOME_LEADS");
	});

	test("video ad: upload by URL, poll until ready, own thumbnail", async () => {
		const mock = happy();
		restore = mock.restore;
		const res = await provider.createCampaign(
			ctx(),
			draft({
				objective: "video_views",
				ads: [
					{
						name: "V",
						format: "video",
						primaryText: "Watch",
						destinationUrl: "https://shop.test",
						media: [
							{ url: "https://cdn.test/v.mp4", kind: "video", mimeType: "video/mp4", sizeBytes: 1 },
							{
								url: "https://cdn.test/t.jpg",
								kind: "image",
								mimeType: "image/jpeg",
								sizeBytes: 1,
							},
						],
					},
				],
			}),
		);
		expect(body(posts(mock.calls, "/advideos")[0])).toEqual({
			file_url: "https://cdn.test/v.mp4",
			name: "Ad video",
		});
		expect(body(posts(mock.calls, "/adsets")[0])).toMatchObject({
			optimization_goal: "THRUPLAY",
			destination_type: "ON_VIDEO",
		});
		expect(body(posts(mock.calls, "/adcreatives")[0]).object_story_spec.video_data).toMatchObject({
			video_id: "v1",
			image_url: "https://cdn.test/t.jpg",
			call_to_action: { type: "LEARN_MORE" },
		});
		expect(res.objects).toContainEqual({ type: "asset", externalId: "v1" });
	});

	test("pre-flight: no page id → invalid_request and nothing is sent", async () => {
		const mock = happy();
		restore = mock.restore;
		const err = await thrown(provider.createCampaign(ctx({ metadata: {} }), draft()));
		expect(err.kind).toBe("invalid_request");
		expect(err.message).toContain("metadata.pageId");
		expect(mock.calls).toHaveLength(0);
	});

	test("pre-flight: below the account's own min_daily_budget", async () => {
		const mock = happy();
		restore = mock.restore;
		const err = await thrown(
			provider.createCampaign(
				ctx({ currency: "EUR", metadata: { pageId: "p", minDailyBudget: 3000 } }),
				draft({ dailyBudget: 25.5 }),
			),
		);
		expect(err.message).toContain("below this ad account's minimum");
		expect(mock.calls).toHaveLength(0);
	});

	test("creative fails → ad set and campaign deleted, error rethrown with no orphans", async () => {
		const mock = mockFetch((url, init) => {
			const p = url.pathname;
			if (init.method === "DELETE") return jsonResponse({ success: true });
			if (p.endsWith("/campaigns")) return jsonResponse({ id: "c1" });
			if (p.endsWith("/adsets")) return jsonResponse({ id: "s1" });
			if (p.endsWith("/adcreatives")) return graphErrorResponse(100, 1487390, "Invalid image");
			return jsonResponse({}, 500);
		});
		restore = mock.restore;
		const err = await thrown(provider.createCampaign(ctx(), draft()));
		expect(err.kind).toBe("invalid_request");
		expect(err.details.orphanedExternalIds).toEqual([]);
		expect(mock.calls.filter((c) => c.init.method === "DELETE").map((c) => c.url.pathname)).toEqual(
			["/v24.0/s1", "/v24.0/c1"],
		);
	});

	test("cleanup that fails reports the orphaned ids", async () => {
		const mock = mockFetch((url, init) => {
			const p = url.pathname;
			if (init.method === "DELETE" && p.endsWith("/c1")) return jsonResponse({}, 500);
			if (init.method === "DELETE") return jsonResponse({ success: true });
			if (p.endsWith("/campaigns")) return jsonResponse({ id: "c1" });
			if (p.endsWith("/adsets")) return jsonResponse({ id: "s1" });
			if (p.endsWith("/adcreatives")) return jsonResponse({ id: "cr1" });
			return graphErrorResponse(100, undefined, "Ad rejected");
		});
		restore = mock.restore;
		const err = await thrown(provider.createCampaign(ctx(), draft()));
		expect(err.details.orphanedExternalIds).toEqual(["c1"]);
		expect(err.message).toContain("could not be removed");
	});

	test("timeout on the campaign create → unknown_outcome, sent exactly once", async () => {
		const mock = mockFetch(() => {
			throw new DOMException("The operation timed out.", "TimeoutError");
		});
		restore = mock.restore;
		const err = await thrown(provider.createCampaign(ctx(), draft()));
		expect(err.kind).toBe("unknown_outcome");
		expect(mock.calls).toHaveLength(1);
	});

	test("5xx on the ad set create → unknown_outcome, campaign cleaned up, no retry", async () => {
		const mock = mockFetch((url, init) => {
			if (init.method === "DELETE") return jsonResponse({ success: true });
			if (url.pathname.endsWith("/campaigns")) return jsonResponse({ id: "c1" });
			return jsonResponse({ error: { message: "boom", code: 2, is_transient: true } }, 500);
		});
		restore = mock.restore;
		const err = await thrown(provider.createCampaign(ctx(), draft()));
		expect(err.kind).toBe("unknown_outcome");
		expect(posts(mock.calls, "/adsets")).toHaveLength(1);
		expect(mock.calls.filter((c) => c.init.method === "DELETE")).toHaveLength(1);
	});
});

describe("status, insights, targeting", () => {
	test("activate: paused children first, campaign last; pause: campaign only", async () => {
		const mock = mockFetch((url) => {
			if (url.pathname.endsWith("/c1/adsets"))
				return jsonResponse({ data: [{ id: "s1", status: "PAUSED" }] });
			if (url.pathname.endsWith("/c1/ads")) {
				return jsonResponse({
					data: [
						{ id: "a1", status: "PAUSED" },
						{ id: "a2", status: "ACTIVE" },
					],
				});
			}
			return jsonResponse({ success: true });
		});
		restore = mock.restore;
		await provider.setStatus(ctx(), "c1", "active");
		const writes = mock.calls.filter((c) => c.init.method === "POST");
		expect(writes.map((c) => [c.url.pathname, body(c)])).toEqual([
			["/v24.0/s1", { status: "ACTIVE" }],
			["/v24.0/a1", { status: "ACTIVE" }],
			["/v24.0/c1", { status: "ACTIVE" }],
		]);

		mock.calls.length = 0;
		await provider.setStatus(ctx(), "c1", "paused");
		expect(mock.calls.map((c) => [c.url.pathname, body(c)])).toEqual([
			["/v24.0/c1", { status: "PAUSED" }],
		]);
	});

	test("setStatus timeout → unknown_outcome", async () => {
		const mock = mockFetch(() => {
			throw new DOMException("timed out", "TimeoutError");
		});
		restore = mock.restore;
		expect((await thrown(provider.setStatus(ctx(), "c1", "paused"))).kind).toBe("unknown_outcome");
		expect(mock.calls).toHaveLength(1);
	});

	test("getCampaignStatus reads the ads' review state when active", async () => {
		const mock = mockFetch((url) =>
			url.pathname.endsWith("/c1/ads")
				? jsonResponse({ data: [{ effective_status: "PENDING_REVIEW" }] })
				: jsonResponse({ effective_status: "ACTIVE" }),
		);
		restore = mock.restore;
		expect(await provider.getCampaignStatus(ctx(), "c1")).toBe("in_review");
	});

	test("insights request daily rows over the range", async () => {
		const mock = mockFetch(() =>
			jsonResponse({ data: [{ date_start: "2026-10-01", spend: "3.50", impressions: "100" }] }),
		);
		restore = mock.restore;
		const rows = await provider.getInsights(ctx(), {
			campaignExternalIds: ["c1"],
			since: "2026-10-01",
			until: "2026-10-07",
		});
		expect(rows[0]).toMatchObject({
			campaignExternalId: "c1",
			date: "2026-10-01",
			spend: 3.5,
			impressions: 100,
		});
		const q = mock.calls[0]?.url.searchParams;
		expect(q?.get("time_increment")).toBe("1");
		expect(JSON.parse(q?.get("time_range") ?? "{}")).toEqual({
			since: "2026-10-01",
			until: "2026-10-07",
		});
	});

	test("searchTargeting maps interests and typed locations", async () => {
		const mock = mockFetch((url) =>
			url.searchParams.get("type") === "adinterest"
				? jsonResponse({ data: [{ id: "600", name: "Running" }] })
				: jsonResponse({
						data: [
							{
								key: "2418779",
								name: "Austin",
								type: "city",
								region: "Texas",
								country_name: "United States",
							},
						],
					}),
		);
		restore = mock.restore;
		expect(
			await provider.searchTargeting?.(ctx(), { type: "interest", query: "run", limit: 5 }),
		).toEqual([{ id: "600", name: "Running", type: "interest" }]);
		expect(
			await provider.searchTargeting?.(ctx(), { type: "location", query: "aus", limit: 5 }),
		).toEqual([{ id: "city:2418779", name: "Austin, Texas, United States", type: "location" }]);
	});
});
