import { afterEach, describe, expect, test } from "bun:test";
import { channel, header, jsonResponse, mockFetch, type RecordedCall } from "../testing/fetch-mock";
import type { AdsContext, CampaignDraft } from "./types";
import {
	classifyXAdsError,
	createXAdsProvider,
	localMidnight,
	mapXStatus,
	oauth1Header,
	oauth1Signature,
	pickFundingInstrument,
	toLocalMicro,
	xAgeBucket,
} from "./x-ads";

const provider = createXAdsProvider(
	{ X_ADS_CONSUMER_KEY: "ck", X_ADS_CONSUMER_SECRET: "cs" },
	{ pollIntervalMs: 1, maxPollMs: 100 },
);

const ctx = (overrides: Partial<AdsContext> = {}): AdsContext => ({
	accountExternalId: "18ce54d4x5t",
	accessToken: "user-token",
	accessTokenSecret: "user-secret",
	currency: "USD",
	metadata: { fundingInstrumentId: "lygyi", timezone: "America/Los_Angeles" },
	logger: channel().logger,
	...overrides,
});

const draft = (overrides: Partial<CampaignDraft> = {}): CampaignDraft => ({
	name: "Launch",
	objective: "traffic",
	dailyBudget: 140,
	startAt: "2026-10-01T00:00:00.000Z",
	endAt: "2026-10-31T00:00:00.000Z",
	targeting: {
		countries: ["us"],
		ageMin: 25,
		ageMax: 54,
		genders: ["female"],
		languages: ["en"],
		interests: [{ id: "1001", name: "Books", type: "interest" }],
		keywords: ["espresso"],
	},
	ads: [
		{
			name: "Ad A",
			format: "image",
			primaryText: "Our new espresso machine is here",
			headline: "Meet Aurora",
			destinationUrl: "https://shop.example.com/aurora",
			media: [
				{
					url: "https://cdn.example.com/a.jpg",
					kind: "image",
					mimeType: "image/jpeg",
					sizeBytes: 3,
				},
			],
		},
	],
	...overrides,
});

const route = (c: RecordedCall) => `${c.init.method ?? "GET"} ${c.url.host}${c.url.pathname}`;
const ACCT = "/12/accounts/18ce54d4x5t";

let fetchMock: ReturnType<typeof mockFetch> | undefined;
afterEach(() => fetchMock?.restore());

describe("OAuth 1.0a signing", () => {
	/**
	 * The official worked example.
	 * https://docs.x.com/resources/fundamentals/authentication/oauth-1-0a/creating-a-signature
	 * The current page uses api.x.com; the classic version of the same page used
	 * api.twitter.com and printed hCtSmYh+iHYCEqBWrE7C7hYmtUk=. Both are checked.
	 */
	const example = (url: string) =>
		oauth1Signature({
			method: "POST",
			url,
			params: [
				["status", "Hello Ladies + Gentlemen, a signed OAuth request!"],
				["include_entities", "true"],
				["oauth_consumer_key", "xvz1evFS4wEEPTGEFPHBog"],
				["oauth_nonce", "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg"],
				["oauth_signature_method", "HMAC-SHA1"],
				["oauth_timestamp", "1318622958"],
				["oauth_token", "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb"],
				["oauth_version", "1.0"],
			],
			consumerSecret: "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw",
			tokenSecret: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE",
		});

	test("matches the documented signature", () => {
		expect(example("https://api.x.com/1.1/statuses/update.json")).toBe(
			"Ls93hJiZbQ3akF3HF3x1Bz8/zU4=",
		);
		expect(example("https://api.twitter.com/1.1/statuses/update.json")).toBe(
			"hCtSmYh+iHYCEqBWrE7C7hYmtUk=",
		);
	});

	test("header carries the oauth params and the encoded signature", () => {
		const h = oauth1Header({
			method: "POST",
			url: "https://api.x.com/1.1/statuses/update.json",
			query: [
				["status", "Hello Ladies + Gentlemen, a signed OAuth request!"],
				["include_entities", "true"],
			],
			consumerKey: "xvz1evFS4wEEPTGEFPHBog",
			consumerSecret: "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw",
			token: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb",
			tokenSecret: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE",
			nonce: "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg",
			timestamp: 1318622958,
		});
		expect(h.startsWith("OAuth ")).toBe(true);
		expect(h).toContain('oauth_signature="Ls93hJiZbQ3akF3HF3x1Bz8%2FzU4%3D"');
		expect(h).toContain('oauth_token="370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb"');
	});
});

describe("OAuth flow", () => {
	test("request token → authorize URL; codeVerifier carries token:secret", async () => {
		fetchMock = mockFetch(
			() =>
				new Response("oauth_token=rt&oauth_token_secret=rts&oauth_callback_confirmed=true", {
					headers: { "content-type": "text/html" },
				}),
		);
		const out = await provider.getAuthorizationUrl({
			redirectUri: "https://api.example.com/cb",
			state: "st1",
		});
		expect(out).toEqual({
			url: "https://api.x.com/oauth/authorize?oauth_token=rt",
			codeVerifier: "rt:rts",
		});
		const auth = header(fetchMock.calls[0]?.init ?? {}, "authorization") ?? "";
		expect(fetchMock.calls[0]?.url.pathname).toBe("/oauth/request_token");
		expect(auth).toContain(
			`oauth_callback="${encodeURIComponent("https://api.example.com/cb?state=st1")}"`,
		);
		expect(auth).not.toContain("oauth_token=");
	});

	test("unconfirmed callback is refused", async () => {
		fetchMock = mockFetch(() => new Response("oauth_token=rt&oauth_token_secret=rts"));
		await expect(
			provider.getAuthorizationUrl({ redirectUri: "https://api.example.com/cb", state: "s" }),
		).rejects.toMatchObject({ kind: "auth" });
	});

	test("exchangeCode signs with the request token, returns the secret and ad accounts", async () => {
		fetchMock = mockFetch((url) => {
			if (url.pathname === "/oauth/access_token")
				return new Response(
					"oauth_token=at&oauth_token_secret=ats&user_id=6253282&screen_name=xapi",
				);
			if (url.pathname === "/12/accounts")
				return jsonResponse({
					data: [
						{ id: "a1", name: "Brand", timezone: "America/New_York", approval_status: "ACCEPTED" },
						{ id: "a2", name: "New", approval_status: "UNDER_REVIEW" },
						{ id: "a3", name: "Gone", deleted: true },
					],
					next_cursor: null,
				});
			if (url.pathname === "/12/accounts/a1/funding_instruments")
				return jsonResponse({
					data: [
						{ id: "f0", currency: "EUR", entity_status: "ACTIVE", able_to_fund: false },
						{ id: "f1", currency: "EUR", entity_status: "ACTIVE", able_to_fund: true },
					],
				});
			return jsonResponse({ data: [] });
		});
		const out = await provider.exchangeCode({
			code: "verifier",
			redirectUri: "https://api.example.com/cb",
			codeVerifier: "rt:rts",
		});
		expect(out.tokens).toMatchObject({ accessToken: "at", tokenSecret: "ats", refreshToken: null });
		expect(out.accounts).toEqual([
			{
				externalId: "a1",
				name: "Brand",
				currency: "EUR",
				timezone: "America/New_York",
				status: "active",
				metadata: {
					approvalStatus: "ACCEPTED",
					fundingInstrumentId: "f1",
					timezone: "America/New_York",
				},
			},
			{
				externalId: "a2",
				name: "New",
				currency: "USD",
				timezone: null,
				status: "pending",
				metadata: { approvalStatus: "UNDER_REVIEW", fundingInstrumentId: null, timezone: null },
			},
		]);
		const first = fetchMock.calls[0];
		expect(first?.url.searchParams.get("oauth_verifier")).toBe("verifier");
		expect(header(first?.init ?? {}, "authorization")).toContain('oauth_token="rt"');
		expect(header(fetchMock.calls[1]?.init ?? {}, "authorization")).toContain('oauth_token="at"');
	});

	test("exchangeCode without the request token fails before any call", async () => {
		fetchMock = mockFetch(() => jsonResponse({}));
		await expect(
			provider.exchangeCode({ code: "v", redirectUri: "https://x", codeVerifier: undefined }),
		).rejects.toMatchObject({ kind: "invalid_request" });
		expect(fetchMock.calls).toHaveLength(0);
	});
});

describe("pure helpers", () => {
	test("local micro is exact", () => {
		expect(toLocalMicro(5.5, "USD")).toBe(5_500_000);
		expect(toLocalMicro(140, "USD")).toBe(140_000_000);
		expect(toLocalMicro(0.07, "USD")).toBe(70_000);
		expect(toLocalMicro(1.005, "USD")).toBeNull();
		expect(toLocalMicro(700, "JPY")).toBe(700_000_000);
	});

	test("age buckets must match exactly", () => {
		expect(xAgeBucket()).toBeUndefined();
		expect(xAgeBucket(18)).toBe("AGE_OVER_18");
		expect(xAgeBucket(25, 54)).toBe("AGE_25_TO_54");
		expect(xAgeBucket(21, 70)).toBe("AGE_OVER_21");
		expect(xAgeBucket(18, 24)).toBeNull();
		expect(xAgeBucket(30, 40)).toBeNull();
	});

	test("funding instrument must be active and able to fund", () => {
		expect(
			pickFundingInstrument([
				{ id: "a", entity_status: "ACTIVE", cancelled: true },
				{ id: "b", entity_status: "PAUSED" },
				{ id: "c", entity_status: "ACTIVE", able_to_fund: true },
			])?.id,
		).toBe("c");
		expect(pickFundingInstrument([])).toBeUndefined();
	});

	test("status mapping and local midnight", () => {
		expect(mapXStatus({ entity_status: "ACTIVE" })).toBe("active");
		expect(mapXStatus({ entity_status: "PAUSED" })).toBe("paused");
		expect(mapXStatus({ entity_status: "DRAFT" })).toBe("paused");
		expect(mapXStatus({ entity_status: "ACTIVE", deleted: true })).toBe("deleted");
		expect(localMidnight("2026-10-01", "America/Los_Angeles")).toBe("2026-10-01T00:00:00-07:00");
		expect(localMidnight("2026-12-01", "America/Los_Angeles")).toBe("2026-12-01T00:00:00-08:00");
		expect(localMidnight("2026-12-01", "UTC")).toBe("2026-12-01T00:00:00+00:00");
	});

	test("error classification", () => {
		const e = (code: string, status = 400) =>
			classifyXAdsError(status, JSON.stringify({ errors: [{ code, message: `m ${code}` }] }));
		expect(e("INVALID_PARAMETER")?.kind).toBe("invalid_request");
		expect(e("UNAUTHORIZED_CLIENT_APPLICATION", 403)?.kind).toBe("auth");
		expect(e("TWEET_IS_SPAM", 403)?.kind).toBe("invalid_request");
		expect(e("TOO_MANY_REQUESTS", 429)).toBeUndefined();
		expect(classifyXAdsError(408, "", true)?.kind).toBe("unknown_outcome");
		expect(classifyXAdsError(408, "", false)?.kind).toBe("transient");
		expect(classifyXAdsError(503, "")).toBeUndefined();
	});
});

describe("validate", () => {
	const v = (d: Partial<CampaignDraft>, metadata?: Record<string, unknown>) =>
		provider.validate(draft(d), { currency: "USD", ...(metadata ? { metadata } : {}) } as {
			currency: string;
		});

	test("a well-formed draft passes", () => {
		expect(v({})).toEqual([]);
	});

	test("rules", () => {
		expect(v({}, { fundingInstrumentId: null })[0]).toContain("no active funding instrument");
		expect(v({ objective: "leads" })[0]).toContain("leads");
		expect(v({ targeting: { countries: ["us"], ageMin: 30, ageMax: 40 } })[0]).toContain(
			"fixed age ranges",
		);
		expect(v({ dailyBudget: undefined, lifetimeBudget: 50, endAt: null })).toContain(
			"A lifetime budget needs an end date",
		);
		const base = draft().ads[0];
		if (!base) throw new Error("fixture");
		expect(v({ ads: [{ ...base, headline: undefined }] })[0]).toContain("headline is required");
		expect(v({ ads: [{ ...base, primaryText: "x".repeat(281) }] })[0]).toContain("280");
		expect(v({ ads: [{ ...base, format: "carousel" }] })[0]).toContain("carousel");
		expect(v({ objective: "video_views" })[0]).toContain("video views campaign needs video");
	});
});

describe("createCampaign", () => {
	const router =
		(fail: Record<string, () => Response> = {}) =>
		(url: URL, init: RequestInit) => {
			const key = `${init.method ?? "GET"} ${url.host}${url.pathname}`;
			const override = fail[key];
			if (override) return override();
			switch (key) {
				case `GET ads-api.x.com${ACCT}/promotable_users`:
					return jsonResponse({ data: [{ user_id: "999", promotable_user_type: "FULL" }] });
				case "GET ads-api.x.com/12/targeting_criteria/locations":
					return jsonResponse({
						data: [
							{ country_code: "US", targeting_value: "96683cc9126741d1" },
							{ country_code: "GB", targeting_value: "6416b8512febefc9" },
						],
					});
				case `POST ads-api.x.com${ACCT}/campaigns`:
					return jsonResponse({ data: { id: "camp1" } });
				case `POST ads-api.x.com${ACCT}/line_items`:
					return jsonResponse({ data: { id: "li1" } });
				case `POST ads-api.x.com/12/batch/accounts/18ce54d4x5t/targeting_criteria`:
					return jsonResponse({ data: [], data_type: "targeting_criterion" });
				case "GET cdn.example.com/a.jpg":
					return new Response(new Uint8Array([1, 2, 3]));
				case "POST api.x.com/2/media/upload/initialize":
					return jsonResponse({ data: { id: "m1", media_key: "3_m1" } });
				case "POST api.x.com/2/media/upload/m1/append":
					return new Response(null, { status: 204 });
				case "POST api.x.com/2/media/upload/m1/finalize":
					return jsonResponse({ data: { id: "m1", media_key: "3_m1" } });
				case `POST ads-api.x.com${ACCT}/media_library`:
					return jsonResponse({ data: { media_key: "3_m1" } });
				case `POST ads-api.x.com${ACCT}/cards`:
					return jsonResponse({ data: { card_uri: "card://1", id: "cid" } });
				case `POST ads-api.x.com${ACCT}/tweet`:
					return new Response('{"data":{"id":1321554298900107264,"id_str":"1321554298900107264"}}');
				case `POST ads-api.x.com${ACCT}/promoted_tweets`:
					return jsonResponse({ data: [{ id: "pt1" }] });
				case `DELETE ads-api.x.com${ACCT}/line_items/li1`:
					return jsonResponse({ data: { id: "li1", deleted: true } });
				case `DELETE ads-api.x.com${ACCT}/campaigns/camp1`:
					return jsonResponse({ data: { id: "camp1", deleted: true } });
			}
			return new Response(`unexpected ${key}`, { status: 418 });
		};

	test("creates everything PAUSED with exact budgets and mapped targeting", async () => {
		fetchMock = mockFetch(router());
		const out = await provider.createCampaign(ctx(), draft());
		expect(fetchMock.calls.map(route)).toEqual([
			`GET ads-api.x.com${ACCT}/promotable_users`,
			"GET ads-api.x.com/12/targeting_criteria/locations",
			`POST ads-api.x.com${ACCT}/campaigns`,
			`POST ads-api.x.com${ACCT}/line_items`,
			`POST ads-api.x.com/12/batch/accounts/18ce54d4x5t/targeting_criteria`,
			"GET cdn.example.com/a.jpg",
			"POST api.x.com/2/media/upload/initialize",
			"POST api.x.com/2/media/upload/m1/append",
			"POST api.x.com/2/media/upload/m1/finalize",
			`POST ads-api.x.com${ACCT}/media_library`,
			`POST ads-api.x.com${ACCT}/cards`,
			`POST ads-api.x.com${ACCT}/tweet`,
			`POST ads-api.x.com${ACCT}/promoted_tweets`,
		]);
		const q = (i: number) => Object.fromEntries(fetchMock?.calls[i]?.url.searchParams ?? []);
		expect(q(2)).toEqual({
			name: "Launch",
			funding_instrument_id: "lygyi",
			entity_status: "PAUSED",
			daily_budget_amount_local_micro: "140000000",
		});
		expect(q(3)).toEqual({
			campaign_id: "camp1",
			name: "Launch",
			objective: "WEBSITE_CLICKS",
			product_type: "PROMOTED_TWEETS",
			placements: "ALL_ON_TWITTER",
			bid_strategy: "AUTO",
			entity_status: "PAUSED",
			standard_delivery: "true",
			start_time: "2026-10-01T00:00:00.000Z",
			end_time: "2026-10-31T00:00:00.000Z",
		});
		const criteria = JSON.parse(String(fetchMock.calls[4]?.init.body)).map(
			(o: { params: { targeting_type: string; targeting_value: string } }) => [
				o.params.targeting_type,
				o.params.targeting_value,
			],
		);
		expect(criteria).toEqual([
			["LOCATION", "96683cc9126741d1"],
			["INTEREST", "1001"],
			["LANGUAGE", "en"],
			["BROAD_KEYWORD", "espresso"],
			["AGE", "AGE_25_TO_54"],
			["GENDER", "2"],
		]);
		expect(JSON.parse(String(fetchMock.calls[6]?.init.body))).toMatchObject({
			media_category: "tweet_image",
			additional_owners: ["999"],
		});
		expect(JSON.parse(String(fetchMock.calls[10]?.init.body)).components).toEqual([
			{ type: "MEDIA", media_key: "3_m1" },
			{
				type: "DETAILS",
				title: "Meet Aurora",
				destination: { type: "WEBSITE", url: "https://shop.example.com/aurora" },
			},
		]);
		expect(q(11)).toMatchObject({ as_user_id: "999", nullcast: "true", card_uri: "card://1" });
		expect(q(12)).toEqual({ line_item_id: "li1", tweet_ids: "1321554298900107264" });
		// Every Ads API call is signed with the user's token.
		for (const c of fetchMock.calls.filter((c) => c.url.host !== "cdn.example.com"))
			expect(header(c.init, "authorization")).toContain('oauth_token="user-token"');
		expect(out).toEqual({
			campaignExternalId: "camp1",
			objects: [
				{ type: "ad_set", externalId: "li1" },
				{ type: "asset", externalId: "3_m1" },
				{ type: "creative", externalId: "card://1" },
				{ type: "creative", externalId: "1321554298900107264" },
				{ type: "ad", externalId: "pt1" },
			],
			status: "paused",
			manageUrl: "https://ads.x.com/ads_manager/18ce54d4x5t/campaigns",
		});
	});

	test("lifetime budget: total = daily cap (never more than the total)", async () => {
		fetchMock = mockFetch(router());
		await provider.createCampaign(ctx(), draft({ dailyBudget: undefined, lifetimeBudget: 300.25 }));
		const q = fetchMock.calls.find((c) => c.url.pathname === `${ACCT}/campaigns`)?.url.searchParams;
		expect(q?.get("total_budget_amount_local_micro")).toBe("300250000");
		expect(q?.get("daily_budget_amount_local_micro")).toBe("300250000");
	});

	test("finer locations skip the country lookup", async () => {
		fetchMock = mockFetch(router());
		await provider.createCampaign(
			ctx(),
			draft({
				targeting: {
					countries: ["us"],
					locations: [{ id: "5122804691e5fecc", name: "SF", type: "location" }],
				},
			}),
		);
		expect(fetchMock.calls.some((c) => c.url.pathname.endsWith("/locations"))).toBe(false);
	});

	test("a failure after the tweet deletes line item + campaign and reports the tweet/card", async () => {
		fetchMock = mockFetch(
			router({
				[`POST ads-api.x.com${ACCT}/promoted_tweets`]: () =>
					jsonResponse({ errors: [{ code: "INVALID_PARAMETER", message: "bad tweet" }] }, 400),
			}),
		);
		const err = await provider.createCampaign(ctx(), draft()).catch((e) => e);
		expect(err.kind).toBe("invalid_request");
		expect(err.details.orphanedExternalIds).toEqual(["card://1", "1321554298900107264"]);
		expect(fetchMock.calls.map(route).slice(-2)).toEqual([
			`DELETE ads-api.x.com${ACCT}/line_items/li1`,
			`DELETE ads-api.x.com${ACCT}/campaigns/camp1`,
		]);
	});

	test("targeting operation_errors abort and clean up", async () => {
		fetchMock = mockFetch(
			router({
				"POST ads-api.x.com/12/batch/accounts/18ce54d4x5t/targeting_criteria": () =>
					jsonResponse({
						data: [],
						operation_errors: [[{ code: "INVALID", message: "bad value" }]],
					}),
				[`DELETE ads-api.x.com${ACCT}/campaigns/camp1`]: () => new Response("x", { status: 500 }),
			}),
		);
		const err = await provider.createCampaign(ctx(), draft()).catch((e) => e);
		expect(err.message).toContain("bad value");
		expect(err.details.orphanedExternalIds).toEqual(["camp1"]);
	});

	test("a timeout on the campaign create is unknown_outcome with no retry", async () => {
		fetchMock = mockFetch((url, init) => {
			if (init.method === "POST" && url.pathname === `${ACCT}/campaigns`)
				throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
			return router()(url, init);
		});
		await expect(provider.createCampaign(ctx(), draft())).rejects.toMatchObject({
			kind: "unknown_outcome",
		});
		expect(fetchMock.calls.filter((c) => c.url.pathname === `${ACCT}/campaigns`)).toHaveLength(1);
		expect(fetchMock.calls).toHaveLength(3);
	});

	test("no funding instrument: refuses before creating anything", async () => {
		fetchMock = mockFetch((url, init) =>
			url.pathname.endsWith("/funding_instruments")
				? jsonResponse({ data: [{ id: "f", entity_status: "PAUSED" }] })
				: router()(url, init),
		);
		await expect(provider.createCampaign(ctx({ metadata: {} }), draft())).rejects.toMatchObject({
			kind: "invalid_request",
		});
		expect(fetchMock.calls.every((c) => c.init.method !== "POST")).toBe(true);
	});
});

describe("status, insights, targeting", () => {
	test("activate: paused line items first, campaign last; pause: campaign only", async () => {
		fetchMock = mockFetch((url, init) =>
			init.method === "GET" || !init.method
				? jsonResponse({
						data: [
							{ id: "li1", entity_status: "PAUSED" },
							{ id: "li2", entity_status: "ACTIVE" },
						],
					})
				: jsonResponse({ data: { id: url.pathname } }),
		);
		await provider.setStatus(ctx(), "camp1", "active");
		expect(fetchMock.calls.map(route)).toEqual([
			`GET ads-api.x.com${ACCT}/line_items`,
			`PUT ads-api.x.com${ACCT}/line_items/li1`,
			`PUT ads-api.x.com${ACCT}/campaigns/camp1`,
		]);
		expect(fetchMock.calls[2]?.url.searchParams.get("entity_status")).toBe("ACTIVE");
		fetchMock.restore();

		fetchMock = mockFetch(() => jsonResponse({ data: {} }));
		await provider.setStatus(ctx(), "camp1", "paused");
		expect(fetchMock.calls.map(route)).toEqual([`PUT ads-api.x.com${ACCT}/campaigns/camp1`]);
		expect(fetchMock.calls[0]?.url.searchParams.get("entity_status")).toBe("PAUSED");
	});

	test("a 5xx on a status change is unknown_outcome, never retried", async () => {
		fetchMock = mockFetch(() => new Response("oops", { status: 503 }));
		await expect(provider.setStatus(ctx(), "camp1", "paused")).rejects.toMatchObject({
			kind: "unknown_outcome",
		});
		expect(fetchMock.calls).toHaveLength(1);
	});

	test("status read includes deleted campaigns; archive deletes", async () => {
		fetchMock = mockFetch((_url, init) =>
			init.method === "DELETE"
				? jsonResponse({ data: { deleted: true } })
				: jsonResponse({ data: [{ id: "camp1", entity_status: "PAUSED", deleted: true }] }),
		);
		expect(await provider.getCampaignStatus(ctx(), "camp1")).toBe("deleted");
		expect(fetchMock.calls[0]?.url.searchParams.get("with_deleted")).toBe("true");
		await provider.archiveCampaign?.(ctx(), "camp1");
		expect(route(fetchMock.calls[1] as RecordedCall)).toBe(
			`DELETE ads-api.x.com${ACCT}/campaigns/camp1`,
		);
	});

	test("insights: daily arrays mapped, billed micro → spend, account-midnight windows", async () => {
		fetchMock = mockFetch(() =>
			jsonResponse({
				data: [
					{
						id: "camp1",
						id_data: [
							{
								metrics: {
									billed_charge_local_micro: [1_500_000, null],
									impressions: [1000, null],
									clicks: [12, null],
									video_total_views: null,
								},
							},
						],
					},
				],
			}),
		);
		const out = await provider.getInsights(ctx(), {
			campaignExternalIds: ["camp1"],
			since: "2026-10-01",
			until: "2026-10-02",
		});
		expect(out).toEqual([
			{
				campaignExternalId: "camp1",
				date: "2026-10-01",
				spend: 1.5,
				impressions: 1000,
				clicks: 12,
			},
		]);
		const q = fetchMock.calls[0]?.url.searchParams;
		expect(fetchMock.calls[0]?.url.pathname).toBe("/12/stats/accounts/18ce54d4x5t");
		expect(q?.get("entity")).toBe("CAMPAIGN");
		expect(q?.get("granularity")).toBe("DAY");
		expect(q?.get("metric_groups")).toBe("BILLING,ENGAGEMENT,VIDEO");
		expect(q?.get("start_time")).toBe("2026-10-01T00:00:00-07:00");
		expect(q?.get("end_time")).toBe("2026-10-03T00:00:00-07:00");
	});

	test("insights: ≤ 20 ids and ≤ 7 days per request", async () => {
		fetchMock = mockFetch(() => jsonResponse({ data: [] }));
		await provider.getInsights(ctx(), {
			campaignExternalIds: Array.from({ length: 21 }, (_, i) => `c${i}`),
			since: "2026-10-01",
			until: "2026-10-10",
		});
		expect(fetchMock.calls).toHaveLength(4);
	});

	test("searchTargeting maps targeting values", async () => {
		fetchMock = mockFetch(() =>
			jsonResponse({
				data: [
					{ name: "Books and literature", targeting_type: "INTEREST", targeting_value: "1001" },
				],
			}),
		);
		expect(
			await provider.searchTargeting?.(ctx(), { type: "interest", query: "books", limit: 5 }),
		).toEqual([{ id: "1001", name: "Books and literature", type: "interest" }]);
		expect(fetchMock.calls[0]?.url.pathname).toBe("/12/targeting_criteria/interests");
		expect(fetchMock.calls[0]?.url.searchParams.get("q")).toBe("books");
	});
});
