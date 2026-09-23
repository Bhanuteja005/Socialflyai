import { afterEach, describe, expect, test } from "bun:test";
import { channel, header, jsonResponse, mockFetch, type RecordedCall } from "../testing/fetch-mock";
import {
	createTikTokAdsProvider,
	mapAdvertiserStatus,
	mapTikTokStatus,
	tiktokAgeGroups,
	tiktokBudget,
	tiktokErrorKind,
	tiktokTime,
} from "./tiktok";
import type { AdsContext, CampaignDraft } from "./types";

const provider = createTikTokAdsProvider({
	TIKTOK_ADS_APP_ID: "app",
	TIKTOK_ADS_APP_SECRET: "sec",
});

const ctx = (overrides: Partial<AdsContext> = {}): AdsContext => ({
	accountExternalId: "7000",
	accessToken: "tok",
	currency: "USD",
	metadata: { identityId: "id-1", identityType: "CUSTOMIZED_USER" },
	logger: channel().logger,
	...overrides,
});

const draft = (overrides: Partial<CampaignDraft> = {}): CampaignDraft => ({
	name: "Autumn drop",
	objective: "traffic",
	dailyBudget: 25.5,
	startAt: "2026-10-01T08:30:00.000Z",
	endAt: null,
	targeting: {
		countries: ["us"],
		ageMin: 25,
		ageMax: 44,
		genders: ["male"],
		languages: ["en"],
		interests: [{ id: "10101", name: "Games", type: "interest" }],
	},
	ads: [
		{
			name: "Ad A",
			format: "video",
			primaryText: "New colours are here",
			headline: "Acme",
			callToAction: "shop_now",
			destinationUrl: "https://shop.example.com",
			media: [
				{
					url: "https://cdn.example.com/v.mp4",
					kind: "video",
					mimeType: "video/mp4",
					sizeBytes: 3,
				},
			],
		},
	],
	...overrides,
});

const ok = (data: unknown) => jsonResponse({ code: 0, message: "OK", request_id: "r", data });
const fail = (code: number, message = "nope") => jsonResponse({ code, message, request_id: "r" });
const body = (c: RecordedCall | undefined) => JSON.parse(String(c?.init.body));
const route = (c: RecordedCall) =>
	`${c.init.method ?? "GET"} ${c.url.pathname.replace("/open_api/v1.3", "")}`;

let fetchMock: ReturnType<typeof mockFetch> | undefined;
afterEach(() => fetchMock?.restore());

describe("pure helpers", () => {
	test("budgets keep exact 2-decimal major units", () => {
		expect(tiktokBudget(25.5, "USD")).toBe(25.5);
		expect(tiktokBudget(0.29 + 20, "USD")).toBe(20.29);
		expect(tiktokBudget(19.999, "USD")).toBeNull();
		expect(tiktokBudget(3000, "JPY")).toBe(3000);
		expect(tiktokBudget(3000.5, "JPY")).toBeNull();
	});

	test("schedule time is UTC 'YYYY-MM-DD HH:MM:SS'", () => {
		expect(tiktokTime("2026-10-01T10:30:00+02:00")).toBe("2026-10-01 08:30:00");
	});

	test("age groups only on bucket edges; 13–17 never", () => {
		expect(tiktokAgeGroups()).toBeUndefined();
		expect(tiktokAgeGroups(25, 44)).toEqual(["AGE_25_34", "AGE_35_44"]);
		expect(tiktokAgeGroups(18)).toEqual([
			"AGE_18_24",
			"AGE_25_34",
			"AGE_35_44",
			"AGE_45_54",
			"AGE_55_100",
		]);
		expect(tiktokAgeGroups(55, 65)).toEqual(["AGE_55_100"]);
		expect(tiktokAgeGroups(13, 24)).toBeNull();
		expect(tiktokAgeGroups(30, 40)).toBeNull();
	});

	test("error codes → kinds", () => {
		expect(tiktokErrorKind(40100, true)).toBe("rate_limited");
		expect(tiktokErrorKind(40105, false)).toBe("auth");
		expect(tiktokErrorKind(40102, false)).toBe("auth");
		expect(tiktokErrorKind(40002, true)).toBe("invalid_request");
		expect(tiktokErrorKind(50002, true)).toBe("unknown_outcome");
		expect(tiktokErrorKind(50000, false)).toBe("transient");
	});

	test("status mapping", () => {
		expect(
			mapTikTokStatus({ operation_status: "ENABLE", secondary_status: "CAMPAIGN_STATUS_ENABLE" }),
		).toBe("active");
		expect(mapTikTokStatus({ operation_status: "DISABLE" })).toBe("paused");
		expect(mapTikTokStatus({ secondary_status: "CAMPAIGN_STATUS_DELETE" })).toBe("deleted");
		expect(mapTikTokStatus({ secondary_status: "CAMPAIGN_STATUS_ADVERTISER_AUDIT" })).toBe(
			"in_review",
		);
		expect(mapTikTokStatus({ secondary_status: "CAMPAIGN_STATUS_REVIEW_DISAPPROVED" })).toBe(
			"rejected",
		);
		expect(mapAdvertiserStatus("STATUS_ENABLE")).toBe("active");
		expect(mapAdvertiserStatus("STATUS_LIMIT")).toBe("disabled");
		expect(mapAdvertiserStatus("STATUS_PENDING_CONFIRM")).toBe("pending");
	});
});

describe("OAuth + accounts", () => {
	test("authorization URL is the TikTok for Business portal", async () => {
		const { url } = await provider.getAuthorizationUrl({
			redirectUri: "https://api.example.com/cb",
			state: "st",
		});
		const u = new URL(url);
		expect(u.origin + u.pathname).toBe("https://business-api.tiktok.com/portal/auth");
		expect(Object.fromEntries(u.searchParams)).toEqual({
			app_id: "app",
			state: "st",
			redirect_uri: "https://api.example.com/cb",
		});
	});

	test("exchangeCode trades auth_code and maps advertisers", async () => {
		fetchMock = mockFetch((url) => {
			if (url.pathname.endsWith("/oauth2/access_token/"))
				return ok({ access_token: "at", advertiser_ids: ["7000", "7001"], scope: [4, 5] });
			return ok({
				list: [
					{
						advertiser_id: "7000",
						name: "Acme",
						status: "STATUS_ENABLE",
						currency: "EUR",
						timezone: "Etc/GMT-1",
						display_timezone: "Europe/Berlin",
						role: "ROLE_ADVERTISER",
					},
					{
						advertiser_id: 7001,
						name: "Pending",
						status: "STATUS_PENDING_CONFIRM",
						currency: "USD",
					},
				],
			});
		});
		const out = await provider.exchangeCode({
			code: "ac",
			redirectUri: "https://api.example.com/cb",
		});
		expect(out.tokens).toEqual({
			accessToken: "at",
			refreshToken: null,
			expiresAt: null,
			scopes: ["4", "5"],
		});
		expect(body(fetchMock.calls[0])).toEqual({ app_id: "app", secret: "sec", auth_code: "ac" });
		expect(out.accounts).toEqual([
			{
				externalId: "7000",
				name: "Acme",
				currency: "EUR",
				timezone: "Europe/Berlin",
				status: "active",
				metadata: { platformStatus: "STATUS_ENABLE", role: "ROLE_ADVERTISER", country: null },
			},
			{
				externalId: "7001",
				name: "Pending",
				currency: "USD",
				timezone: null,
				status: "pending",
				metadata: { platformStatus: "STATUS_PENDING_CONFIRM", role: null, country: null },
			},
		]);
		const info = fetchMock.calls[1];
		expect(info?.url.pathname).toBe("/open_api/v1.3/advertiser/info/");
		expect(info?.url.searchParams.get("advertiser_ids")).toBe('["7000","7001"]');
		expect(header(info?.init ?? {}, "access-token")).toBe("at");
	});

	test("a non-zero code on a read maps to its kind", async () => {
		fetchMock = mockFetch(() => fail(40105, "Access token is invalid"));
		await expect(provider.getCampaignStatus(ctx(), "1")).rejects.toMatchObject({ kind: "auth" });
		fetchMock.restore();
		fetchMock = mockFetch(() => fail(40100));
		await expect(provider.getCampaignStatus(ctx(), "1")).rejects.toMatchObject({
			kind: "rate_limited",
			details: { retryAfterMs: 300_000 },
		});
	});
});

describe("validate", () => {
	const v = (d: Partial<CampaignDraft>, currency = "USD", metadata?: Record<string, unknown>) =>
		provider.validate(draft(d), { currency, ...(metadata ? { metadata } : {}) } as {
			currency: string;
		});

	test("a well-formed draft passes", () => {
		expect(v({})).toEqual([]);
	});

	test("USD minimums: 20/day, lifetime 20 × days", () => {
		expect(v({ dailyBudget: 19.99 })).toContain("TikTok's minimum daily budget is 20 USD");
		expect(
			v({
				dailyBudget: undefined,
				lifetimeBudget: 100,
				startAt: "2026-10-01T00:00:00Z",
				endAt: "2026-10-11T00:00:00Z",
			}),
		).toContain("TikTok needs a lifetime budget of at least 200 USD (20 × 10 days)");
		// Other currencies: TikTok's table is unconfirmed, TikTok itself validates.
		expect(v({ dailyBudget: 5 }, "EUR")).toEqual([]);
	});

	test("identity, objective, formats, text", () => {
		expect(v({}, "USD", { identityId: "" })[0]).toContain("identity");
		expect(v({ objective: "engagement" })[0]).toContain("engagement");
		const base = draft().ads[0];
		if (!base) throw new Error("fixture");
		expect(v({ ads: [{ ...base, format: "image" }] })[0]).toContain("must be video");
		expect(v({ ads: [{ ...base, primaryText: "x".repeat(101) }] })[0]).toContain("1–100");
		expect(v({ ads: [{ ...base, primaryText: "Hot deals 🔥" }] })[0]).toContain("emoji");
		expect(v({ targeting: { countries: ["us"], ageMin: 16 } })[0]).toContain("age ranges");
		expect(v({ targeting: { countries: [] } })).toContain("Choose at least one country");
		expect(v({ dailyBudget: undefined, lifetimeBudget: 500, endAt: null })).toContain(
			"A lifetime budget needs an end date",
		);
	});
});

describe("createCampaign", () => {
	const router =
		(overrides: Record<string, () => Response> = {}) =>
		(url: URL, init: RequestInit) => {
			const key = `${init.method ?? "GET"} ${url.pathname.replace("/open_api/v1.3", "")}`;
			const o = overrides[key];
			if (o) return o();
			switch (key) {
				case "GET /tool/region/":
					return ok({
						region_info: [
							{ location_id: "6252001", region_code: "US", level: "COUNTRY" },
							{ location_id: "2635167", region_code: "GB", level: "COUNTRY" },
						],
					});
				case "POST /campaign/create/":
					return ok({ campaign_id: "c1" });
				case "POST /adgroup/create/":
					return ok({ adgroup_id: "ag1" });
				case "POST /file/video/ad/upload/":
					return ok([{ video_id: "v1", video_cover_url: "https://p16.tiktokcdn.com/cover.jpg" }]);
				case "POST /file/image/ad/upload/":
					return ok({ image_id: "img1" });
				case "POST /ad/create/":
					return ok({ ad_ids: ["ad1"] });
				case "GET /campaign/get/":
					return ok({ list: [{ campaign_id: "c1", operation_status: "DISABLE" }] });
				case "POST /campaign/status/update/":
				case "POST /adgroup/status/update/":
				case "POST /ad/status/update/":
					return ok({ status: "ok" });
			}
			return new Response(`unexpected ${key}`, { status: 418 });
		};

	test("creates campaign → ad group → assets → ad, all DISABLE, exact budget", async () => {
		fetchMock = mockFetch(router());
		const out = await provider.createCampaign(ctx(), draft());
		expect(fetchMock.calls.map(route)).toEqual([
			"GET /tool/region/",
			"POST /campaign/create/",
			"POST /adgroup/create/",
			"POST /file/video/ad/upload/",
			"POST /file/image/ad/upload/",
			"POST /ad/create/",
			"GET /campaign/get/",
		]);
		const campaign = body(fetchMock.calls[1]);
		expect(campaign).toMatchObject({
			advertiser_id: "7000",
			campaign_name: "Autumn drop",
			objective_type: "TRAFFIC",
			budget_mode: "BUDGET_MODE_INFINITE",
			operation_status: "DISABLE",
		});
		expect(campaign.request_id).toMatch(/^\d+$/);
		expect(body(fetchMock.calls[2])).toEqual({
			advertiser_id: "7000",
			campaign_id: "c1",
			adgroup_name: "Autumn drop",
			promotion_type: "WEBSITE",
			placement_type: "PLACEMENT_TYPE_NORMAL",
			placements: ["PLACEMENT_TIKTOK"],
			location_ids: ["6252001"],
			age_groups: ["AGE_25_34", "AGE_35_44"],
			gender: "GENDER_MALE",
			languages: ["en"],
			interest_category_ids: ["10101"],
			budget_mode: "BUDGET_MODE_DAY",
			budget: 25.5,
			schedule_type: "SCHEDULE_FROM_NOW",
			schedule_start_time: "2026-10-01 08:30:00",
			optimization_goal: "CLICK",
			billing_event: "CPC",
			bid_type: "BID_TYPE_NO_BID",
			pacing: "PACING_MODE_SMOOTH",
			operation_status: "DISABLE",
		});
		expect(body(fetchMock.calls[3])).toMatchObject({
			upload_type: "UPLOAD_BY_URL",
			video_url: "https://cdn.example.com/v.mp4",
		});
		// No cover supplied: TikTok's extracted frame is re-uploaded as the cover image.
		expect(body(fetchMock.calls[4])).toMatchObject({
			upload_type: "UPLOAD_BY_URL",
			image_url: "https://p16.tiktokcdn.com/cover.jpg",
		});
		expect(body(fetchMock.calls[5])).toEqual({
			advertiser_id: "7000",
			adgroup_id: "ag1",
			creatives: [
				{
					ad_name: "Ad A",
					identity_type: "CUSTOMIZED_USER",
					identity_id: "id-1",
					ad_format: "SINGLE_VIDEO",
					video_id: "v1",
					image_ids: ["img1"],
					ad_text: "New colours are here",
					call_to_action: "SHOP_NOW",
					landing_page_url: "https://shop.example.com",
					display_name: "Acme",
					operation_status: "DISABLE",
				},
			],
		});
		for (const c of fetchMock.calls) expect(String(c.init.body ?? "")).not.toContain('"ENABLE"');
		expect(out).toEqual({
			campaignExternalId: "c1",
			objects: [
				{ type: "ad_set", externalId: "ag1" },
				{ type: "asset", externalId: "v1" },
				{ type: "asset", externalId: "img1" },
				{ type: "ad", externalId: "ad1" },
			],
			status: "paused",
			manageUrl: "https://ads.tiktok.com/i18n/perf/campaign?aadvid=7000",
		});
	});

	test("lifetime budget: BUDGET_MODE_TOTAL with start/end schedule", async () => {
		fetchMock = mockFetch(router());
		await provider.createCampaign(
			ctx(),
			draft({
				objective: "awareness",
				dailyBudget: undefined,
				lifetimeBudget: 620.4,
				startAt: "2026-10-01T00:00:00Z",
				endAt: "2026-10-31T00:00:00Z",
			}),
		);
		const adGroup = body(fetchMock.calls[2]);
		expect(adGroup).toMatchObject({
			budget_mode: "BUDGET_MODE_TOTAL",
			budget: 620.4,
			schedule_type: "SCHEDULE_START_END",
			schedule_end_time: "2026-10-31 00:00:00",
			optimization_goal: "REACH",
			billing_event: "CPM",
		});
		expect(adGroup.promotion_type).toBeUndefined();
	});

	test("a campaign that came back ENABLE is switched off", async () => {
		fetchMock = mockFetch(
			router({
				"GET /campaign/get/": () =>
					ok({ list: [{ campaign_id: "c1", operation_status: "ENABLE" }] }),
			}),
		);
		await provider.createCampaign(ctx(), draft());
		const last = fetchMock.calls.at(-1);
		expect(route(last as RecordedCall)).toBe("POST /campaign/status/update/");
		expect(body(last)).toEqual({
			advertiser_id: "7000",
			campaign_ids: ["c1"],
			operation_status: "DISABLE",
		});
	});

	test("missing identity refuses before any call", async () => {
		fetchMock = mockFetch(router());
		await expect(provider.createCampaign(ctx({ metadata: {} }), draft())).rejects.toMatchObject({
			kind: "invalid_request",
		});
		expect(fetchMock.calls).toHaveLength(0);
	});

	test("an ad rejection deletes ad group then campaign", async () => {
		fetchMock = mockFetch(router({ "POST /ad/create/": () => fail(40002, "ad_text invalid") }));
		const err = await provider.createCampaign(ctx(), draft()).catch((e) => e);
		expect(err.kind).toBe("invalid_request");
		expect(err.message).toContain("ad_text invalid");
		expect(err.details.orphanedExternalIds).toEqual([]);
		expect(fetchMock.calls.map(route).slice(-2)).toEqual([
			"POST /adgroup/status/update/",
			"POST /campaign/status/update/",
		]);
		expect(body(fetchMock.calls.at(-1))).toEqual({
			advertiser_id: "7000",
			campaign_ids: ["c1"],
			operation_status: "DELETE",
		});
	});

	test("failed cleanup lists orphaned ids", async () => {
		fetchMock = mockFetch(
			router({
				"POST /file/video/ad/upload/": () => fail(40903, "URL unavailable"),
				"POST /adgroup/status/update/": () => fail(50000),
				"POST /campaign/status/update/": () => new Response("x", { status: 502 }),
			}),
		);
		const err = await provider.createCampaign(ctx(), draft()).catch((e) => e);
		expect(err.kind).toBe("invalid_request");
		expect(err.details.orphanedExternalIds).toEqual(["ag1", "c1"]);
	});

	test("a system timeout (code 50002) on a create is unknown_outcome, not retried", async () => {
		fetchMock = mockFetch(
			router({ "POST /campaign/create/": () => fail(50002, "system timeout") }),
		);
		await expect(provider.createCampaign(ctx(), draft())).rejects.toMatchObject({
			kind: "unknown_outcome",
		});
		expect(fetchMock.calls.map(route)).toEqual(["GET /tool/region/", "POST /campaign/create/"]);
	});

	test("a network timeout on the ad group is unknown_outcome; the campaign is removed", async () => {
		fetchMock = mockFetch((url, init) => {
			if (url.pathname.endsWith("/adgroup/create/"))
				throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
			return router()(url, init);
		});
		const err = await provider.createCampaign(ctx(), draft()).catch((e) => e);
		expect(err.kind).toBe("unknown_outcome");
		expect(fetchMock.calls.filter((c) => c.url.pathname.endsWith("/adgroup/create/"))).toHaveLength(
			1,
		);
		expect(route(fetchMock.calls.at(-1) as RecordedCall)).toBe("POST /campaign/status/update/");
	});
});

describe("status, insights, targeting", () => {
	test("activate enables disabled ad groups and ads first, the campaign last", async () => {
		fetchMock = mockFetch((url) => {
			if (url.pathname.endsWith("/adgroup/get/"))
				return ok({
					list: [
						{ adgroup_id: "ag1", operation_status: "DISABLE" },
						{ adgroup_id: "ag2", operation_status: "ENABLE" },
					],
					page_info: { page: 1, total_page: 1 },
				});
			if (url.pathname.endsWith("/ad/get/"))
				return ok({
					list: [{ ad_id: "ad1", operation_status: "DISABLE" }],
					page_info: { total_page: 1 },
				});
			return ok({});
		});
		await provider.setStatus(ctx(), "c1", "active");
		expect(fetchMock.calls.map(route)).toEqual([
			"GET /adgroup/get/",
			"POST /adgroup/status/update/",
			"GET /ad/get/",
			"POST /ad/status/update/",
			"POST /campaign/status/update/",
		]);
		expect(body(fetchMock.calls[1])).toEqual({
			advertiser_id: "7000",
			adgroup_ids: ["ag1"],
			operation_status: "ENABLE",
		});
		expect(body(fetchMock.calls[4]).operation_status).toBe("ENABLE");
	});

	test("pause touches only the campaign; archive deletes", async () => {
		fetchMock = mockFetch(() => ok({}));
		await provider.setStatus(ctx(), "c1", "paused");
		await provider.archiveCampaign?.(ctx(), "c1");
		expect(fetchMock.calls.map((c) => body(c).operation_status)).toEqual(["DISABLE", "DELETE"]);
	});

	test("status read asks for deleted campaigns too; missing = deleted", async () => {
		fetchMock = mockFetch(() => ok({ list: [] }));
		expect(await provider.getCampaignStatus(ctx(), "c1")).toBe("deleted");
		expect(JSON.parse(fetchMock.calls[0]?.url.searchParams.get("filtering") ?? "{}")).toEqual({
			campaign_ids: ["c1"],
			primary_status: "STATUS_ALL",
		});
	});

	test("insights: string metrics parsed, '-' is unknown, 30-day windows", async () => {
		fetchMock = mockFetch(() =>
			ok({
				list: [
					{
						dimensions: { campaign_id: "c1", stat_time_day: "2026-10-02 00:00:00" },
						metrics: {
							spend: "12.34",
							impressions: "1000",
							reach: "800",
							clicks: "12",
							conversion: "-",
							video_play_actions: "300",
						},
					},
				],
				page_info: { page: 1, total_page: 1 },
			}),
		);
		const out = await provider.getInsights(ctx(), {
			campaignExternalIds: ["c1"],
			since: "2026-09-01",
			until: "2026-10-15",
		});
		expect(fetchMock.calls).toHaveLength(2);
		expect(out[0]).toEqual({
			campaignExternalId: "c1",
			date: "2026-10-02",
			spend: 12.34,
			impressions: 1000,
			reach: 800,
			clicks: 12,
			videoViews: 300,
		});
		const q = fetchMock.calls[0]?.url.searchParams;
		expect(q?.get("data_level")).toBe("AUCTION_CAMPAIGN");
		expect(q?.get("dimensions")).toBe('["campaign_id","stat_time_day"]');
		expect(JSON.parse(q?.get("filtering") ?? "[]")).toEqual([
			{ field_name: "campaign_ids", filter_type: "IN", filter_value: '["c1"]' },
		]);
		expect(q?.get("start_date")).toBe("2026-09-01");
		expect(q?.get("end_date")).toBe("2026-09-30");
	});

	test("insights: a 5xx is transient (reads are never unknown_outcome)", async () => {
		fetchMock = mockFetch(() => new Response("x", { status: 503 }));
		await expect(
			provider.getInsights(ctx(), {
				campaignExternalIds: ["c1"],
				since: "2026-10-01",
				until: "2026-10-01",
			}),
		).rejects.toMatchObject({ kind: "transient" });
	});

	test("searchTargeting: interests filtered locally, locations via fuzzy search", async () => {
		fetchMock = mockFetch((url) =>
			url.pathname.endsWith("/tool/interest_category/")
				? ok({
						interest_categories: [
							{ interest_category_id: "1", interest_category_name: "Games" },
							{ interest_category_id: "2", interest_category_name: "Beauty" },
						],
					})
				: ok({
						targeting_tag_list: [
							{ name: "Berlin", geo: { geo_id: "2950159", description: "Berlin, Germany" } },
						],
					}),
		);
		expect(
			await provider.searchTargeting?.(ctx(), { type: "interest", query: "gam", limit: 5 }),
		).toEqual([{ id: "1", name: "Games", type: "interest" }]);
		expect(
			await provider.searchTargeting?.(ctx(), { type: "location", query: "berlin", limit: 5 }),
		).toEqual([{ id: "2950159", name: "Berlin, Germany", type: "location" }]);
		const q = fetchMock.calls[1]?.url.searchParams;
		expect(q?.get("search_type")).toBe("FUZZY_SEARCH");
		expect(q?.get("keywords")).toBe('["berlin"]');
	});
});
