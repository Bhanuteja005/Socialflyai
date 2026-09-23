import { afterEach, describe, expect, test } from "bun:test";
import { addDays, utcDay } from "../analytics";
import {
	channel,
	graphErrorResponse,
	header,
	jsonResponse,
	mockFetch,
} from "../testing/fetch-mock";
import { mapThreadsInsights, ThreadsProvider } from "./threads";

const threads = new ThreadsProvider({ appId: "app", appSecret: "secret" });
let fetchMock: ReturnType<typeof mockFetch> | undefined;
afterEach(() => fetchMock?.restore());

const metric = (name: string, value: number) => ({ name, period: "lifetime", values: [{ value }] });

describe("mapThreadsInsights", () => {
	test("views are impressions, replies comments, reposts+quotes+shares shares", () => {
		expect(
			mapThreadsInsights({ views: 100, likes: 9, replies: 2, reposts: 3, quotes: 1, shares: 4 }),
		).toEqual({ impressions: 100, likes: 9, comments: 2, shares: 8 });
		expect(mapThreadsInsights({})).toEqual({});
	});
});

describe("Threads post metrics", () => {
	test("one insights request per post; deleted posts omitted", async () => {
		fetchMock = mockFetch((url) => {
			if (url.pathname === "/v1.0/t1/insights") {
				return jsonResponse({
					data: [metric("views", 50), metric("likes", 5), metric("replies", 1)],
				});
			}
			return graphErrorResponse(100, 33);
		});
		const out = await threads.analytics.getPostMetrics(channel(), ["t1", "t2"]);
		expect(out).toEqual({ t1: { impressions: 50, likes: 5, comments: 1 } });

		const call = fetchMock.calls.find((c) => c.url.pathname === "/v1.0/t1/insights");
		expect(call?.url.origin).toBe("https://graph.threads.net");
		expect(call?.url.searchParams.get("metric")).toBe("views,likes,replies,reposts,quotes,shares");
		expect(header(call?.init ?? {}, "authorization")).toBe("Bearer tok-123");
	});

	test("rate limits and auth errors propagate with the right kind", async () => {
		fetchMock = mockFetch(() => graphErrorResponse(4));
		await expect(threads.analytics.getPostMetrics(channel(), ["t1"])).rejects.toMatchObject({
			kind: "rate_limited",
		});
		fetchMock.restore();
		fetchMock = mockFetch(() => graphErrorResponse(190));
		await expect(threads.analytics.getPostMetrics(channel(), ["t1"])).rejects.toMatchObject({
			kind: "auth",
		});
	});
});

describe("Threads account metrics", () => {
	test("daily views series plus today's followers_count (separate request, no since/until)", async () => {
		const today = utcDay(new Date());
		const since = addDays(today, -2);
		fetchMock = mockFetch((url) => {
			if (url.searchParams.get("metric") === "followers_count") {
				return jsonResponse({
					data: [{ name: "followers_count", period: "day", total_value: { value: 777 } }],
				});
			}
			return jsonResponse({
				data: [
					{
						name: "views",
						period: "day",
						values: [
							{ value: 10, end_time: `${addDays(since, 1)}T07:00:00+0000` },
							{ value: 20, end_time: `${addDays(since, 2)}T07:00:00+0000` },
						],
					},
				],
			});
		});
		const out = await threads.analytics.getAccountMetrics?.(channel({ externalId: "u1" }), {
			since,
			until: today,
		});
		expect(out).toEqual([
			{ date: since, impressions: 10 },
			{ date: addDays(since, 1), impressions: 20 },
			{ date: today, followers: 777 },
		]);
		const [views, followers] = fetchMock.calls;
		expect(views?.url.pathname).toBe("/v1.0/u1/threads_insights");
		expect(views?.url.searchParams.get("since")).toBe(String(Date.parse(since) / 1000));
		expect(followers?.url.searchParams.has("since")).toBe(false);
	});

	test("since is clamped to the earliest date Threads accepts", async () => {
		fetchMock = mockFetch(() => jsonResponse({ data: [] }));
		await threads.analytics.getAccountMetrics?.(channel(), {
			since: "2024-01-01",
			until: "2024-05-01",
		});
		expect(fetchMock.calls[0]?.url.searchParams.get("since")).toBe("1712991600");
	});
});
