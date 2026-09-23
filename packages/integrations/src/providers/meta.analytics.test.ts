import { afterEach, describe, expect, test } from "bun:test";
import { addDays, utcDay } from "../analytics";
import {
	channel,
	graphErrorResponse,
	header,
	jsonResponse,
	mockFetch,
} from "../testing/fetch-mock";
import { FacebookProvider, InstagramProvider, instagramInsightMetrics } from "./meta";

const config = { appId: "app", appSecret: "secret", graphVersion: "v23.0" };
const facebook = new FacebookProvider(config);
const instagram = new InstagramProvider(config);

let fetchMock: ReturnType<typeof mockFetch> | undefined;
afterEach(() => fetchMock?.restore());

const insight = (name: string, value: number) => ({
	name,
	period: "lifetime",
	values: [{ value }],
});

describe("Facebook post metrics", () => {
	const postRow = {
		insights: {
			data: [
				insight("post_media_view", 900),
				insight("post_total_media_view_unique", 700),
				insight("post_clicks", 12),
			],
		},
		reactions: { data: [], summary: { total_count: 40 } },
		comments: { data: [], summary: { total_count: 6 } },
		shares: { count: 3 },
	};

	test("batches post ids with ?ids= and maps insights + counts; videos get counts only", async () => {
		fetchMock = mockFetch((url) => {
			if (url.pathname === "/v23.0/") {
				return jsonResponse({
					"1_10": postRow,
					// Nobody shared it: Graph leaves `shares` out.
					"1_11": { ...postRow, shares: undefined, insights: { data: [] } },
				});
			}
			if (url.pathname === "/v23.0/99") {
				return jsonResponse({
					id: "99",
					reactions: { summary: { total_count: 2 } },
					comments: { summary: { total_count: 1 } },
				});
			}
			return new Response("unexpected", { status: 500 });
		});

		const out = await facebook.analytics.getPostMetrics(channel({ externalId: "1" }), [
			"1_10",
			"1_11",
			"99",
		]);
		expect(out).toEqual({
			"1_10": { impressions: 900, reach: 700, clicks: 12, likes: 40, comments: 6, shares: 3 },
			// No insights → impressions/reach/clicks stay unknown; shares absent means 0.
			"1_11": { likes: 40, comments: 6, shares: 0 },
			"99": { likes: 2, comments: 1 },
		});

		const [batch, video] = fetchMock.calls;
		expect(batch?.url.searchParams.get("ids")).toBe("1_10,1_11");
		expect(batch?.url.searchParams.get("fields")).toContain(
			"insights.metric(post_media_view,post_total_media_view_unique,post_clicks)",
		);
		expect(header(batch?.init ?? {}, "authorization")).toBe("Bearer tok-123");
		// Deprecated impressions metrics are not requested any more.
		expect(batch?.url.searchParams.get("fields")).not.toContain("post_impressions");
		expect(video?.url.searchParams.get("fields")).not.toContain("insights");
		expect(facebook.analytics.maxPostsPerCall).toBe(50);
	});

	test("a deleted post fails the batch; per-id fallback omits just that post", async () => {
		fetchMock = mockFetch((url) => {
			if (url.pathname === "/v23.0/") return graphErrorResponse(803);
			if (url.pathname === "/v23.0/1_10") return jsonResponse(postRow);
			if (url.pathname === "/v23.0/1_12") return graphErrorResponse(100, 33);
			return new Response("unexpected", { status: 500 });
		});
		const out = await facebook.analytics.getPostMetrics(channel(), ["1_10", "1_12"]);
		expect(Object.keys(out)).toEqual(["1_10"]);
		expect(fetchMock.calls).toHaveLength(3);
	});

	test("an expired token is auth, a throttle is rate_limited", async () => {
		fetchMock = mockFetch(() => graphErrorResponse(190, 463));
		await expect(facebook.analytics.getPostMetrics(channel(), ["1_10"])).rejects.toMatchObject({
			kind: "auth",
		});
		fetchMock.restore();
		fetchMock = mockFetch(() => graphErrorResponse(32));
		await expect(facebook.analytics.getPostMetrics(channel(), ["1_10"])).rejects.toMatchObject({
			kind: "rate_limited",
		});
	});
});

describe("Facebook page daily metrics", () => {
	test("splits ranges into ≤90-day requests and maps end_time to the covered day", async () => {
		fetchMock = mockFetch((url) => {
			const since = Number(url.searchParams.get("since"));
			const day = new Date((since + 86_400) * 1000).toISOString().slice(0, 10);
			return jsonResponse({
				data: [
					{
						name: "page_follows",
						period: "day",
						values: [{ value: 1000, end_time: `${day}T08:00:00+0000` }],
					},
					{
						name: "page_media_view",
						period: "day",
						values: [{ value: 50, end_time: `${day}T08:00:00+0000` }],
					},
					// A week aggregate must not overwrite daily numbers.
					{
						name: "page_media_view",
						period: "week",
						values: [{ value: 999, end_time: `${day}T08:00:00+0000` }],
					},
				],
			});
		});

		const out = await facebook.analytics.getAccountMetrics?.(channel({ externalId: "pg1" }), {
			since: "2026-01-01",
			until: "2026-04-30",
		});

		expect(fetchMock.calls).toHaveLength(2);
		const [first, second] = fetchMock.calls;
		expect(first?.url.pathname).toBe("/v23.0/pg1/insights");
		expect(first?.url.searchParams.get("metric")).toBe(
			"page_follows,page_media_view,page_total_media_view_unique,page_views_total",
		);
		expect(first?.url.searchParams.get("period")).toBe("day");
		// 2026-01-01 .. 2026-03-31 (90 days), until exclusive.
		expect(first?.url.searchParams.get("since")).toBe(String(Date.UTC(2026, 0, 1) / 1000));
		expect(first?.url.searchParams.get("until")).toBe(String(Date.UTC(2026, 3, 1) / 1000));
		expect(second?.url.searchParams.get("since")).toBe(String(Date.UTC(2026, 3, 1) / 1000));
		expect(second?.url.searchParams.get("until")).toBe(String(Date.UTC(2026, 4, 1) / 1000));

		expect(out).toEqual([
			{ date: "2026-01-01", followers: 1000, impressions: 50 },
			{ date: "2026-04-01", followers: 1000, impressions: 50 },
		]);
	});
});

describe("Instagram post metrics", () => {
	test("metric set depends on media type (stories have no saves)", () => {
		expect(instagramInsightMetrics("STORY")).toBe("reach,views,shares");
		expect(instagramInsightMetrics("FEED")).toBe("reach,views,saved,shares");
		expect(instagramInsightMetrics("REELS")).toBe("reach,views,saved,shares");
	});

	test("counts from fields, insights grouped by type; reel views are video views", async () => {
		fetchMock = mockFetch((url) => {
			const fields = url.searchParams.get("fields") ?? "";
			if (url.pathname === "/v23.0/" && fields.startsWith("media_product_type")) {
				return jsonResponse({
					m1: { id: "m1", media_product_type: "FEED", like_count: 10, comments_count: 2 },
					m2: { id: "m2", media_product_type: "REELS", like_count: 20, comments_count: 4 },
					m3: { id: "m3", media_product_type: "STORY" },
				});
			}
			if (url.pathname === "/v23.0/" && fields === "insights.metric(reach,views,saved,shares)") {
				return jsonResponse({
					m1: {
						insights: {
							data: [insight("reach", 80), insight("views", 120), insight("saved", 3)],
						},
					},
					m2: {
						insights: {
							data: [
								insight("reach", 500),
								insight("views", 900),
								insight("saved", 7),
								insight("shares", 9),
							],
						},
					},
				});
			}
			if (url.pathname === "/v23.0/m3" && fields === "insights.metric(reach,views,shares)") {
				return jsonResponse({ insights: { data: [insight("reach", 30), insight("views", 40)] } });
			}
			return new Response(`unexpected ${url}`, { status: 500 });
		});

		const out = await instagram.analytics.getPostMetrics(channel(), ["m1", "m2", "m3"]);
		expect(out).toEqual({
			m1: { likes: 10, comments: 2, reach: 80, impressions: 120, saves: 3 },
			m2: {
				likes: 20,
				comments: 4,
				reach: 500,
				impressions: 900,
				videoViews: 900,
				saves: 7,
				shares: 9,
			},
			m3: { reach: 30, impressions: 40 },
		});
		// Deprecated metrics must not be requested.
		for (const call of fetchMock.calls) {
			expect(call.url.searchParams.get("fields")).not.toMatch(/impressions|plays|video_views/);
		}
	});

	test("'not enough viewers' (code 10) drops insights for that media only, not auth", async () => {
		fetchMock = mockFetch((url) => {
			const fields = url.searchParams.get("fields") ?? "";
			if (fields.startsWith("media_product_type")) {
				return jsonResponse({
					m1: { media_product_type: "FEED", like_count: 1, comments_count: 0 },
					m2: { media_product_type: "FEED", like_count: 5, comments_count: 1 },
				});
			}
			const notEnough = graphErrorResponse(
				10,
				undefined,
				"(#10) Not enough viewers for the media to show insights",
			);
			if (url.pathname === "/v23.0/") return notEnough;
			if (url.pathname === "/v23.0/m1") return notEnough;
			return jsonResponse({ insights: { data: [insight("reach", 60)] } });
		});
		const out = await instagram.analytics.getPostMetrics(channel(), ["m1", "m2"]);
		expect(out).toEqual({
			m1: { likes: 1, comments: 0 },
			m2: { likes: 5, comments: 1, reach: 60 },
		});
	});

	test("a missing permission (code 10 without the viewers message) is still auth", async () => {
		fetchMock = mockFetch((url) =>
			(url.searchParams.get("fields") ?? "").startsWith("media_product_type")
				? jsonResponse({ m1: { media_product_type: "FEED" } })
				: graphErrorResponse(10, undefined, "(#10) Application does not have permission"),
		);
		await expect(instagram.analytics.getPostMetrics(channel(), ["m1"])).rejects.toMatchObject({
			kind: "auth",
		});
	});

	test("deleted media are omitted", async () => {
		fetchMock = mockFetch((url) => {
			if (url.pathname === "/v23.0/") return graphErrorResponse(803);
			if (url.pathname === "/v23.0/gone") return graphErrorResponse(100, 33);
			const fields = url.searchParams.get("fields") ?? "";
			return fields.startsWith("media_product_type")
				? jsonResponse({ media_product_type: "FEED", like_count: 4 })
				: jsonResponse({ insights: { data: [] } });
		});
		expect(await instagram.analytics.getPostMetrics(channel(), ["m1", "gone"])).toEqual({
			m1: { likes: 4 },
		});
	});
});

describe("Instagram account metrics", () => {
	test("reach in ≤30-day time-series windows plus today's follower total", async () => {
		const today = utcDay(new Date());
		const since = addDays(today, -44);
		fetchMock = mockFetch((url) => {
			if (url.pathname === "/v23.0/ig1") return jsonResponse({ followers_count: 321 });
			const start = Number(url.searchParams.get("since"));
			const endOfFirstDay = new Date((start + 86_400) * 1000).toISOString().slice(0, 10);
			return jsonResponse({
				data: [
					{
						name: "reach",
						period: "day",
						values: [{ value: 11, end_time: `${endOfFirstDay}T07:00:00+0000` }],
					},
				],
			});
		});

		const out = await instagram.analytics.getAccountMetrics?.(channel({ externalId: "ig1" }), {
			since,
			until: today,
		});

		const insightCalls = fetchMock.calls.filter((c) => c.url.pathname.endsWith("/insights"));
		expect(insightCalls).toHaveLength(2);
		for (const call of insightCalls) {
			expect(call.url.searchParams.get("metric")).toBe("reach");
			expect(call.url.searchParams.get("metric_type")).toBe("time_series");
			const span =
				Number(call.url.searchParams.get("until")) - Number(call.url.searchParams.get("since"));
			expect(span).toBeLessThanOrEqual(30 * 86_400);
		}
		expect(out).toEqual([
			{ date: since, reach: 11 },
			{ date: addDays(since, 30), reach: 11 },
			{ date: today, followers: 321 },
		]);
	});

	test("a past range makes no follower request", async () => {
		fetchMock = mockFetch(() => jsonResponse({ data: [] }));
		await instagram.analytics.getAccountMetrics?.(channel(), {
			since: "2026-01-01",
			until: "2026-01-10",
		});
		expect(fetchMock.calls).toHaveLength(1);
	});
});
