import { afterEach, describe, expect, test } from "bun:test";
import { addDays, utcDay } from "../analytics";
import { channel, header, jsonResponse, mockFetch } from "../testing/fetch-mock";
import {
	escapeLittleText,
	LinkedInPageProvider,
	LinkedInProfileProvider,
	mapLinkedInShareStatistics,
	restliList,
} from "./linkedin";

describe("escapeLittleText", () => {
	test("escapes every little-text reserved character", () => {
		expect(escapeLittleText("Launch (beta) #1 @team [link] <b> *bold* _it_ ~x~ a|b {c} \\")).toBe(
			"Launch \\(beta\\) \\#1 \\@team \\[link\\] \\<b\\> \\*bold\\* \\_it\\_ \\~x\\~ a\\|b \\{c\\} \\\\",
		);
	});

	test("leaves ordinary text untouched", () => {
		expect(escapeLittleText("Hello, world! 100% ready.")).toBe("Hello, world! 100% ready.");
	});
});

describe("LinkedIn analytics", () => {
	const config = { clientId: "id", clientSecret: "secret", apiVersion: "202609" };
	const page = new LinkedInPageProvider(config);
	let fetchMock: ReturnType<typeof mockFetch> | undefined;
	afterEach(() => fetchMock?.restore());

	test("personal profiles expose no analytics (restricted member scope)", () => {
		expect("analytics" in new LinkedInProfileProvider(config)).toBe(false);
	});

	test("share statistics mapping: unique impressions are reach", () => {
		expect(
			mapLinkedInShareStatistics({
				impressionCount: 5287,
				uniqueImpressionsCount: 4000,
				clickCount: 78,
				likeCount: 14,
				commentCount: 24,
				shareCount: 5,
			}),
		).toEqual({
			impressions: 5287,
			reach: 4000,
			clicks: 78,
			likes: 14,
			comments: 24,
			shares: 5,
		});
		// LinkedIn's per-share sample omits unique impressions: reach stays unknown.
		expect(mapLinkedInShareStatistics({ impressionCount: 5 })).toEqual({ impressions: 5 });
	});

	test("restli List() encodes the URNs but not the list syntax", () => {
		expect(restliList(["urn:li:share:1", "urn:li:share:2"])).toBe(
			"List(urn%3Ali%3Ashare%3A1,urn%3Ali%3Ashare%3A2)",
		);
	});

	test("shares and ugcPosts go in separate lists; posts LinkedIn leaves out read as 0", async () => {
		fetchMock = mockFetch(() =>
			jsonResponse({
				elements: [
					{
						organizationalEntity: "urn:li:organization:42",
						share: "urn:li:share:1",
						totalShareStatistics: { impressionCount: 100, likeCount: 3, commentCount: 1 },
					},
				],
			}),
		);
		const out = await page.analytics.getPostMetrics(channel({ externalId: "42" }), [
			"urn:li:share:1",
			"urn:li:ugcPost:2",
			"not-a-urn",
		]);
		expect(out).toEqual({
			"urn:li:share:1": { impressions: 100, likes: 3, comments: 1 },
			"urn:li:ugcPost:2": {
				impressions: 0,
				reach: 0,
				clicks: 0,
				likes: 0,
				comments: 0,
				shares: 0,
			},
		});

		const [call] = fetchMock.calls;
		const raw = call?.url.href ?? "";
		expect(call?.url.pathname).toBe("/rest/organizationalEntityShareStatistics");
		expect(raw).toContain("q=organizationalEntity");
		expect(raw).toContain("organizationalEntity=urn%3Ali%3Aorganization%3A42");
		expect(raw).toContain("shares=List(urn%3Ali%3Ashare%3A1)");
		expect(raw).toContain("ugcPosts=List(urn%3Ali%3AugcPost%3A2)");
		expect(header(call?.init ?? {}, "linkedin-version")).toBe("202609");
		expect(header(call?.init ?? {}, "x-restli-protocol-version")).toBe("2.0.0");
	});

	test("no LinkedIn post URNs → no request", async () => {
		fetchMock = mockFetch(() => jsonResponse({}));
		expect(await page.analytics.getPostMetrics(channel(), ["x"])).toEqual({});
		expect(fetchMock.calls).toHaveLength(0);
	});

	test("403 (no longer an admin) is auth; 5xx on a read is transient", async () => {
		fetchMock = mockFetch(() => new Response("{}", { status: 403 }));
		await expect(
			page.analytics.getPostMetrics(channel(), ["urn:li:share:1"]),
		).rejects.toMatchObject({ kind: "auth" });
		fetchMock.restore();
		fetchMock = mockFetch(() => new Response("{}", { status: 502 }));
		await expect(
			page.analytics.getPostMetrics(channel(), ["urn:li:share:1"]),
		).rejects.toMatchObject({ kind: "transient" });
	});

	test("account: daily time-bound statistics plus today's follower count", async () => {
		const today = utcDay(new Date());
		const since = addDays(today, -1);
		fetchMock = mockFetch((url) => {
			if (url.pathname.startsWith("/rest/networkSizes/")) {
				return jsonResponse({ firstDegreeSize: 219145 });
			}
			return jsonResponse({
				elements: [
					{
						timeRange: { start: Date.parse(since), end: Date.parse(today) },
						totalShareStatistics: { impressionCount: 331, uniqueImpressionsCounts: 203 },
					},
				],
			});
		});
		const out = await page.analytics.getAccountMetrics?.(channel({ externalId: "42" }), {
			since,
			until: today,
		});
		expect(out).toEqual([
			{ date: since, impressions: 331, reach: 203 },
			{ date: today, followers: 219145 },
		]);

		const [stats, size] = fetchMock.calls;
		const start = Date.parse(since);
		const end = Date.parse(addDays(today, 1));
		expect(stats?.url.href).toContain(
			`timeIntervals=(timeRange%3A(start%3A${start}%2Cend%3A${end})%2CtimeGranularityType%3ADAY)`,
		);
		expect(size?.url.pathname).toBe("/rest/networkSizes/urn:li:organization:42");
		expect(size?.url.searchParams.get("edgeType")).toBe("COMPANY_FOLLOWED_BY_MEMBER");
	});

	test("account: the range is clamped to LinkedIn's rolling 12-month window", async () => {
		fetchMock = mockFetch(() => jsonResponse({ elements: [] }));
		await page.analytics.getAccountMetrics?.(channel(), {
			since: "2000-01-01",
			until: "2000-02-01",
		});
		// Entirely outside the window and not including today: no request at all.
		expect(fetchMock.calls).toHaveLength(0);

		const today = utcDay(new Date());
		await page.analytics.getAccountMetrics?.(channel(), {
			since: "2000-01-01",
			until: addDays(today, -1),
		});
		const oldest = Date.parse(addDays(today, -364));
		expect(fetchMock.calls[0]?.url.href).toContain(`start%3A${oldest}%2C`);
	});
});
