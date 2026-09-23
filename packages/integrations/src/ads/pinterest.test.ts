import { afterEach, describe, expect, test } from "bun:test";
import { channel, header, jsonResponse, mockFetch, type RecordedCall } from "../testing/fetch-mock";
import {
	classifyPinterestError,
	createPinterestAdsProvider,
	mapPinterestStatus,
	pinterestTargetingSpec,
	toMicro,
} from "./pinterest";
import type { AdsContext, CampaignDraft } from "./types";

const provider = createPinterestAdsProvider(
	{ PINTEREST_APP_ID: "app", PINTEREST_APP_SECRET: "secret" },
	{ pollIntervalMs: 1, maxPollMs: 50 },
);

const ctx = (overrides: Partial<AdsContext> = {}): AdsContext => ({
	accountExternalId: "549",
	accessToken: "tok",
	currency: "USD",
	metadata: { boardId: "board-1" },
	logger: channel().logger,
	...overrides,
});

const draft = (overrides: Partial<CampaignDraft> = {}): CampaignDraft => ({
	name: "Autumn sale",
	objective: "traffic",
	dailyBudget: 25.5,
	startAt: "2026-10-01T00:00:00.000Z",
	endAt: null,
	targeting: { countries: ["us"], ageMin: 25, ageMax: 44, genders: ["female"], languages: ["en"] },
	ads: [
		{
			name: "Ad A",
			format: "image",
			primaryText: "Fresh picks for autumn",
			headline: "Autumn picks",
			destinationUrl: "https://shop.example.com/autumn",
			media: [
				{
					url: "https://cdn.example.com/a.jpg",
					kind: "image",
					mimeType: "image/jpeg",
					sizeBytes: 1000,
				},
			],
		},
	],
	...overrides,
});

const body = (call: RecordedCall | undefined) => JSON.parse(String(call?.init.body));
const route = (c: RecordedCall) => `${c.init.method ?? "GET"} ${c.url.pathname}`;
const bulk = (data: Record<string, unknown>) => jsonResponse({ items: [{ data, exceptions: [] }] });

let fetchMock: ReturnType<typeof mockFetch> | undefined;
afterEach(() => fetchMock?.restore());

describe("pure helpers", () => {
	test("budgets become exact integer micro-currency", () => {
		expect(toMicro(25.5, "USD")).toBe(25_500_000);
		expect(toMicro(0.29, "USD")).toBe(290_000);
		expect(toMicro(19.99, "EUR")).toBe(19_990_000);
		expect(toMicro(1000, "JPY")).toBe(1_000_000_000);
		expect(toMicro(10.005, "USD")).toBeNull();
		expect(toMicro(1000.5, "JPY")).toBeNull();
	});

	test("targeting spec: countries or finer locations, ages, gender, locale, interests", () => {
		expect(
			pinterestTargetingSpec({
				countries: ["us", "ca"],
				ageMin: 18,
				ageMax: 70,
				genders: ["male"],
				languages: ["en"],
				interests: [{ id: "924581335376", name: "Food", type: "interest" }],
			}),
		).toEqual({
			LOCATION: ["US", "CA"],
			MINIMUM_AGE: ["18"],
			MAXIMUM_AGE: ["65+"],
			GENDER: ["male"],
			LOCALE: ["en"],
			INTEREST: ["924581335376"],
		});
		expect(
			pinterestTargetingSpec({
				countries: ["us"],
				locations: [{ id: "501", name: "New York", type: "location" }],
			}),
		).toEqual({ LOCATION: ["501"] });
	});

	test("status mapping", () => {
		expect(mapPinterestStatus("ACTIVE")).toBe("active");
		expect(mapPinterestStatus("PAUSED")).toBe("paused");
		expect(mapPinterestStatus("DRAFT")).toBe("paused");
		expect(mapPinterestStatus("ARCHIVED")).toBe("archived");
		expect(mapPinterestStatus("DELETED_DRAFT")).toBe("deleted");
	});

	test("error bodies with a message are invalid_request; invalid_grant is auth", () => {
		const err = classifyPinterestError(400, JSON.stringify({ code: 2, message: "Bad budget" }));
		expect(err).toMatchObject({ kind: "invalid_request", message: "Bad budget" });
		expect(classifyPinterestError(400, JSON.stringify({ error: "invalid_grant" }))?.kind).toBe(
			"auth",
		);
		expect(classifyPinterestError(503, "{}")).toBeUndefined();
	});
});

describe("OAuth + accounts", () => {
	test("authorization URL requests ads + pin scopes (incl. boards:write)", async () => {
		const { url } = await provider.getAuthorizationUrl({
			redirectUri: "https://api.example.com/cb",
			state: "st",
		});
		const u = new URL(url);
		expect(u.origin + u.pathname).toBe("https://www.pinterest.com/oauth/");
		expect(u.searchParams.get("scope")).toBe(
			"ads:read,ads:write,boards:read,boards:write,pins:read,pins:write,user_accounts:read",
		);
		expect(u.searchParams.get("state")).toBe("st");
		expect(u.searchParams.get("response_type")).toBe("code");
	});

	test("exchangeCode uses Basic auth and maps ad accounts by role", async () => {
		fetchMock = mockFetch((url) => {
			if (url.pathname === "/v5/oauth/token")
				return jsonResponse({
					access_token: "at",
					refresh_token: "pinr.1",
					expires_in: 2592000,
					scope: "ads:read,ads:write",
				});
			return jsonResponse({
				items: [
					{
						id: "549",
						name: "Shop",
						currency: "EUR",
						time_zone: "Europe/Berlin",
						permissions: ["OWNER"],
					},
					{ id: "550", name: "Viewer", currency: "USD", permissions: ["ANALYST"] },
				],
				bookmark: null,
			});
		});
		const out = await provider.exchangeCode({
			code: "c",
			redirectUri: "https://api.example.com/cb",
		});
		expect(out.tokens.accessToken).toBe("at");
		expect(out.tokens.refreshToken).toBe("pinr.1");
		expect(out.tokens.scopes).toEqual(["ads:read", "ads:write"]);
		expect(out.accounts).toEqual([
			{
				externalId: "549",
				name: "Shop",
				currency: "EUR",
				timezone: "Europe/Berlin",
				status: "active",
				metadata: { country: null, permissions: ["OWNER"], ownerUsername: null },
			},
			{
				externalId: "550",
				name: "Viewer",
				currency: "USD",
				timezone: null,
				status: "disabled",
				metadata: { country: null, permissions: ["ANALYST"], ownerUsername: null },
			},
		]);
		const token = fetchMock.calls[0];
		expect(header(token?.init ?? {}, "authorization")).toBe(
			`Basic ${Buffer.from("app:secret").toString("base64")}`,
		);
		expect(String(token?.init.body)).toContain("grant_type=authorization_code");
		expect(header(fetchMock.calls[1]?.init ?? {}, "authorization")).toBe("Bearer at");
	});

	test("refreshTokens uses the refresh_token grant", async () => {
		fetchMock = mockFetch(() => jsonResponse({ access_token: "new", refresh_token: "pinr.2" }));
		const t = await provider.refreshTokens?.("pinr.1");
		expect(t?.accessToken).toBe("new");
		expect(String(fetchMock.calls[0]?.init.body)).toContain("grant_type=refresh_token");
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

	test("budget rules", () => {
		expect(v({ dailyBudget: undefined, lifetimeBudget: 100, endAt: null })).toContain(
			"A lifetime budget needs an end date",
		);
		expect(v({ dailyBudget: 10, lifetimeBudget: 100 })).toContain(
			"Set exactly one of a daily or a lifetime budget",
		);
		expect(v({ dailyBudget: 10.001 })).toContain("Budget can have at most 2 decimal places");
		expect(v({ dailyBudget: 500.5 }, "JPY")).toContain("JPY budgets must be whole amounts");
		expect(v({}, "ZAR")).toContain("Pinterest ad accounts cannot use the currency ZAR");
	});

	test("objective, targeting and board", () => {
		expect(v({ objective: "sales" })[0]).toContain("sales");
		expect(v({ targeting: { countries: ["us"], keywords: ["shoes"] } })).toContain(
			"Keyword targeting is not supported for Pinterest ads",
		);
		expect(v({ targeting: { countries: ["us"], ageMin: 16 } })).toContain(
			"Pinterest ads target ages 18+",
		);
		expect(v({}, "USD", { boardId: "" })).toContain("Choose a Pinterest board to hold the ad Pins");
	});

	test("media and text per format", () => {
		const base = draft().ads[0];
		if (!base) throw new Error("fixture");
		expect(v({ ads: [{ ...base, format: "carousel" }] })[0]).toContain("carousel needs 2–5 images");
		expect(v({ ads: [{ ...base, format: "video" }] })[0]).toContain("exactly one video");
		expect(v({ ads: [{ ...base, headline: "x".repeat(101) }] })[0]).toContain("100 characters");
		expect(v({ ads: [{ ...base, primaryText: "x".repeat(801) }] })[0]).toContain("800 characters");
		expect(v({ ads: [{ ...base, destinationUrl: "http://insecure.example.com" }] })[0]).toContain(
			"https URL",
		);
		expect(v({ objective: "video_views" })).toContain(
			"Ad 1: a video views campaign needs video ads",
		);
	});
});

describe("createCampaign", () => {
	/** Happy-path router; `fail` overrides one route. */
	const router =
		(fail: Record<string, () => Response> = {}) =>
		(url: URL, init: RequestInit) => {
			const key = `${init.method ?? "GET"} ${url.pathname}`;
			const override = fail[key];
			if (override) return override();
			switch (key) {
				case "POST /v5/ad_accounts/549/campaigns":
					return bulk({ id: "c1", status: "PAUSED" });
				case "POST /v5/ad_accounts/549/ad_groups":
					return bulk({ id: "ag1" });
				case "POST /v5/pins":
					return jsonResponse({ id: "pin1" });
				case "POST /v5/ad_accounts/549/ads":
					return bulk({ id: "ad1" });
				case "PATCH /v5/ad_accounts/549/campaigns":
					return bulk({ id: "c1", status: "ARCHIVED" });
				case "DELETE /v5/pins/pin1":
					return new Response(null, { status: 204 });
			}
			return new Response("unexpected", { status: 418 });
		};

	test("creates campaign → ad group → pin → ad, all PAUSED, budget in micro", async () => {
		fetchMock = mockFetch(router());
		const out = await provider.createCampaign(ctx(), draft());
		expect(fetchMock.calls.map(route)).toEqual([
			"POST /v5/ad_accounts/549/campaigns",
			"POST /v5/ad_accounts/549/ad_groups",
			"POST /v5/pins",
			"POST /v5/ad_accounts/549/ads",
		]);
		const [campaign] = body(fetchMock.calls[0]);
		expect(campaign).toEqual({
			name: "Autumn sale",
			status: "PAUSED",
			objective_type: "CONSIDERATION",
			is_campaign_budget_optimization: true,
			daily_spend_cap: 25_500_000,
			start_time: 1790812800,
		});
		const [adGroup] = body(fetchMock.calls[1]);
		expect(adGroup).toMatchObject({
			campaign_id: "c1",
			status: "PAUSED",
			budget_type: "CBO_ADGROUP",
			billable_event: "CLICKTHROUGH",
			bid_strategy_type: "AUTOMATIC_BID",
			auto_targeting_enabled: false,
			targeting_spec: {
				LOCATION: ["US"],
				MINIMUM_AGE: ["25"],
				MAXIMUM_AGE: ["44"],
				GENDER: ["female"],
				LOCALE: ["en"],
			},
		});
		expect(fetchMock.calls[2]?.url.searchParams.get("ad_account_id")).toBe("549");
		expect(body(fetchMock.calls[2])).toMatchObject({
			board_id: "board-1",
			title: "Autumn picks",
			description: "Fresh picks for autumn",
			link: "https://shop.example.com/autumn",
			media_source: { source_type: "image_url", url: "https://cdn.example.com/a.jpg" },
		});
		expect(body(fetchMock.calls[3])).toEqual([
			{
				ad_group_id: "ag1",
				pin_id: "pin1",
				creative_type: "REGULAR",
				status: "PAUSED",
				name: "Ad A",
			},
		]);
		// Nothing anywhere is created ACTIVE.
		for (const c of fetchMock.calls) expect(String(c.init.body)).not.toContain("ACTIVE");
		expect(out).toEqual({
			campaignExternalId: "c1",
			objects: [
				{ type: "ad_set", externalId: "ag1" },
				{ type: "creative", externalId: "pin1" },
				{ type: "ad", externalId: "ad1" },
			],
			status: "paused",
			manageUrl: "https://ads.pinterest.com/advertiser/549/",
		});
	});

	test("lifetime budget goes to lifetime_spend_cap with end_time", async () => {
		fetchMock = mockFetch(router());
		await provider.createCampaign(
			ctx({ currency: "JPY" }),
			draft({ dailyBudget: undefined, lifetimeBudget: 30000, endAt: "2026-10-31T00:00:00.000Z" }),
		);
		const [campaign] = body(fetchMock.calls[0]);
		expect(campaign.lifetime_spend_cap).toBe(30_000_000_000);
		expect(campaign.daily_spend_cap).toBeUndefined();
		expect(campaign.end_time).toBe(1793404800);
	});

	test("refuses before any call when the board is missing", async () => {
		fetchMock = mockFetch(router());
		await expect(provider.createCampaign(ctx({ metadata: {} }), draft())).rejects.toMatchObject({
			kind: "invalid_request",
		});
		expect(fetchMock.calls).toHaveLength(0);
	});

	test("a rejected ad archives the campaign and deletes the pin", async () => {
		fetchMock = mockFetch(
			router({
				"POST /v5/ad_accounts/549/ads": () =>
					jsonResponse({
						items: [{ data: null, exceptions: { code: 7, message: "Pin not eligible" } }],
					}),
			}),
		);
		const err = await provider.createCampaign(ctx(), draft()).catch((e) => e);
		expect(err).toMatchObject({ kind: "invalid_request" });
		expect(err.message).toContain("Pin not eligible");
		expect(err.details.orphanedExternalIds).toEqual([]);
		expect(fetchMock.calls.map(route).slice(4)).toEqual([
			"DELETE /v5/pins/pin1",
			"PATCH /v5/ad_accounts/549/campaigns",
		]);
		expect(body(fetchMock.calls[5])).toEqual([{ id: "c1", status: "ARCHIVED" }]);
	});

	test("failed cleanup reports orphaned ids", async () => {
		fetchMock = mockFetch(
			router({
				"POST /v5/pins": () => jsonResponse({ code: 1, message: "Board not found" }, 404),
				"PATCH /v5/ad_accounts/549/campaigns": () => new Response("down", { status: 503 }),
			}),
		);
		const err = await provider.createCampaign(ctx(), draft()).catch((e) => e);
		expect(err.kind).toBe("invalid_request");
		expect(err.details.orphanedExternalIds).toEqual(["c1", "ag1"]);
		expect(err.message).toContain("cleanup incomplete");
	});

	test("a timeout on a create is unknown_outcome and is not retried", async () => {
		fetchMock = mockFetch(() => {
			throw Object.assign(new Error("The operation timed out."), { name: "TimeoutError" });
		});
		await expect(provider.createCampaign(ctx(), draft())).rejects.toMatchObject({
			kind: "unknown_outcome",
		});
		expect(fetchMock.calls).toHaveLength(1);
	});

	test("a 5xx on the ad group keeps unknown_outcome and still cleans up", async () => {
		fetchMock = mockFetch(
			router({ "POST /v5/ad_accounts/549/ad_groups": () => new Response("x", { status: 502 }) }),
		);
		const err = await provider.createCampaign(ctx(), draft()).catch((e) => e);
		expect(err.kind).toBe("unknown_outcome");
		expect(err.details.orphanedExternalIds).toEqual([]);
		expect(fetchMock.calls.map(route)).toEqual([
			"POST /v5/ad_accounts/549/campaigns",
			"POST /v5/ad_accounts/549/ad_groups",
			"PATCH /v5/ad_accounts/549/campaigns",
		]);
	});

	test("video ads register, upload and poll media before the pin", async () => {
		let polls = 0;
		fetchMock = mockFetch((url, init) => {
			const key = `${init.method ?? "GET"} ${url.pathname}`;
			if (key === "POST /v5/media")
				return jsonResponse({
					media_id: "m1",
					upload_url: "https://pinterest-media-upload.s3.amazonaws.com/",
					upload_parameters: { key: "k", policy: "p" },
				});
			if (url.hostname === "cdn.example.com") return new Response(new Uint8Array([1, 2, 3]));
			if (url.hostname === "pinterest-media-upload.s3.amazonaws.com")
				return new Response(null, { status: 204 });
			if (key === "GET /v5/media/m1")
				return jsonResponse({ status: ++polls < 2 ? "processing" : "succeeded" });
			return router()(url, init);
		});
		await provider.createCampaign(
			ctx(),
			draft({
				objective: "video_views",
				ads: [
					{
						name: "Vid",
						format: "video",
						primaryText: "Watch",
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
			}),
		);
		const pinCall = fetchMock.calls.find((c) => c.url.pathname === "/v5/pins");
		expect(body(pinCall).media_source).toEqual({
			source_type: "video_id",
			media_id: "m1",
			cover_image_key_frame_time: 0,
		});
		const ads = fetchMock.calls.find((c) => c.url.pathname === "/v5/ad_accounts/549/ads");
		expect(body(ads)[0].creative_type).toBe("VIDEO");
		const [adGroup] = body(fetchMock.calls.find((c) => c.url.pathname.endsWith("/ad_groups")));
		expect(adGroup.billable_event).toBe("VIDEO_V_50_MRC");
		expect(polls).toBe(2);
	});
});

describe("status, insights, targeting", () => {
	test("activating resumes paused ad groups and ads first, the campaign last", async () => {
		fetchMock = mockFetch((url, init) => {
			if (init.method === "PATCH") return bulk({ id: "x" });
			if (url.pathname.endsWith("/ad_groups"))
				return jsonResponse({ items: [{ id: "ag1", status: "PAUSED" }], bookmark: null });
			return jsonResponse({ items: [{ id: "ad1", status: "PAUSED" }], bookmark: null });
		});
		await provider.setStatus(ctx(), "c1", "active");
		expect(fetchMock.calls.map(route)).toEqual([
			"GET /v5/ad_accounts/549/ad_groups",
			"PATCH /v5/ad_accounts/549/ad_groups",
			"GET /v5/ad_accounts/549/ads",
			"PATCH /v5/ad_accounts/549/ads",
			"PATCH /v5/ad_accounts/549/campaigns",
		]);
		expect(fetchMock.calls[0]?.url.searchParams.get("campaign_ids")).toBe("c1");
		expect(body(fetchMock.calls[4])).toEqual([{ id: "c1", status: "ACTIVE" }]);
	});

	test("pausing only touches the campaign; a timeout is unknown_outcome", async () => {
		fetchMock = mockFetch(() => bulk({ id: "c1" }));
		await provider.setStatus(ctx(), "c1", "paused");
		expect(fetchMock.calls.map(route)).toEqual(["PATCH /v5/ad_accounts/549/campaigns"]);
		expect(body(fetchMock.calls[0])).toEqual([{ id: "c1", status: "PAUSED" }]);
		fetchMock.restore();

		fetchMock = mockFetch(() => {
			throw Object.assign(new Error("reset"), { code: "ECONNRESET" });
		});
		await expect(provider.setStatus(ctx(), "c1", "paused")).rejects.toMatchObject({
			kind: "unknown_outcome",
		});
		expect(fetchMock.calls).toHaveLength(1);
	});

	test("archive and status read", async () => {
		fetchMock = mockFetch((_url, init) =>
			init.method === "PATCH" ? bulk({ id: "c1" }) : jsonResponse({ id: "c1", status: "ARCHIVED" }),
		);
		await provider.archiveCampaign?.(ctx(), "c1");
		expect(body(fetchMock.calls[0])).toEqual([{ id: "c1", status: "ARCHIVED" }]);
		expect(await provider.getCampaignStatus(ctx(), "c1")).toBe("archived");
	});

	test("insights: DAY rows in micro-currency, repeated campaign_ids", async () => {
		fetchMock = mockFetch(() =>
			jsonResponse([
				{
					CAMPAIGN_ID: 111,
					DATE: "2026-10-02",
					SPEND_IN_MICRO_DOLLAR: 12_340_000,
					TOTAL_IMPRESSION: 1000,
					TOTAL_IMPRESSION_USER: 800,
					TOTAL_CLICKTHROUGH: 12,
				},
			]),
		);
		const out = await provider.getInsights(ctx(), {
			campaignExternalIds: ["111", "222"],
			since: "2026-10-01",
			until: "2026-10-07",
		});
		expect(out).toEqual([
			{
				campaignExternalId: "111",
				date: "2026-10-02",
				spend: 12.34,
				impressions: 1000,
				reach: 800,
				clicks: 12,
			},
		]);
		const q = fetchMock.calls[0]?.url.searchParams;
		expect(q?.getAll("campaign_ids")).toEqual(["111", "222"]);
		expect(q?.get("granularity")).toBe("DAY");
		expect(q?.get("columns")).toContain("SPEND_IN_MICRO_DOLLAR");
	});

	test("insights split ranges over 90 days", async () => {
		fetchMock = mockFetch(() => jsonResponse([]));
		await provider.getInsights(ctx(), {
			campaignExternalIds: ["1"],
			since: "2026-01-01",
			until: "2026-06-30",
		});
		expect(fetchMock.calls).toHaveLength(3);
	});

	test("searchTargeting filters the full list locally", async () => {
		fetchMock = mockFetch(() =>
			jsonResponse([{ "501": "U.S.: New York", "811": "U.S.: Reno", GR: "Greece" }]),
		);
		expect(
			await provider.searchTargeting?.(ctx(), { type: "location", query: "u.s.", limit: 1 }),
		).toEqual([{ id: "501", name: "U.S.: New York", type: "location" }]);
		expect(fetchMock.calls[0]?.url.pathname).toBe("/v5/resources/targeting/LOCATION");
		expect(
			await provider.searchTargeting?.(ctx(), { type: "job_title", query: "x", limit: 5 }),
		).toEqual([]);
	});
});
