import { afterEach, describe, expect, test } from "bun:test";
import { addDays, utcDay } from "../analytics";
import { channel, header, jsonResponse, mockFetch } from "../testing/fetch-mock";
import { classifyXError, mapXPublicMetrics, XProvider } from "./x";

describe("classifyXError", () => {
	test("duplicate-content 403 is invalid_request", () => {
		const body = JSON.stringify({
			detail: "You are not allowed to create a Tweet with duplicate content.",
			type: "about:blank",
			title: "Forbidden",
			status: 403,
		});
		const err = classifyXError("x", 403, body);
		expect(err?.kind).toBe("invalid_request");
		expect(err?.details.platformCode).toBe("duplicate");
	});

	test("content-level 403 (reply restrictions) is invalid_request", () => {
		const body = JSON.stringify({
			detail: "Reply to this conversation is not allowed because you have not been mentioned.",
		});
		expect(classifyXError("x", 403, body)?.kind).toBe("invalid_request");
	});

	test("app/client-level 403 falls back to the default (auth)", () => {
		const body = JSON.stringify({
			detail:
				"When authenticating requests to the Twitter API v2 endpoints, you must use keys and tokens from a Twitter developer App that is attached to a Project.",
			reason: "client-not-enrolled",
		});
		expect(classifyXError("x", 403, body)).toBeUndefined();
	});

	test("invalid_grant on the token endpoint is auth", () => {
		expect(classifyXError("x", 400, JSON.stringify({ error: "invalid_grant" }))?.kind).toBe("auth");
	});

	test("400 validation errors carry X's detail", () => {
		const body = JSON.stringify({
			errors: [{ message: "text: too long" }],
			title: "Invalid Request",
		});
		const err = classifyXError("x", 400, body);
		expect(err?.kind).toBe("invalid_request");
		expect(err?.message).toBe("text: too long");
	});

	test("5xx and 429 are left to the default mapping", () => {
		expect(classifyXError("x", 503, "Service Unavailable")).toBeUndefined();
		expect(classifyXError("x", 429, "{}")).toBeUndefined();
	});
});

describe("X analytics", () => {
	const x = new XProvider({ clientId: "id", clientSecret: "secret" });
	let fetchMock: ReturnType<typeof mockFetch> | undefined;
	afterEach(() => fetchMock?.restore());

	test("maps public_metrics; reposts+quotes are shares, bookmarks are saves", () => {
		expect(
			mapXPublicMetrics({
				impression_count: 1250,
				like_count: 38,
				reply_count: 3,
				retweet_count: 7,
				quote_count: 1,
				bookmark_count: 2,
			}),
		).toEqual({ impressions: 1250, likes: 38, comments: 3, shares: 8, saves: 2 });
		// The newer reference names the counter repost_count.
		expect(mapXPublicMetrics({ repost_count: 4 })).toEqual({ shares: 4 });
		// Nothing reported → nothing invented.
		expect(mapXPublicMetrics({})).toEqual({});
	});

	test("looks up posts by ids with public_metrics and omits deleted ones", async () => {
		fetchMock = mockFetch(() =>
			jsonResponse({
				data: [{ id: "1", public_metrics: { like_count: 5, impression_count: 100 } }],
				errors: [{ type: "https://api.x.com/2/problems/resource-not-found", resource_id: "2" }],
			}),
		);
		const out = await x.analytics.getPostMetrics(channel(), ["1", "2"]);
		expect(out).toEqual({ "1": { likes: 5, impressions: 100 } });

		const [call] = fetchMock.calls;
		expect(`${call?.url.origin}${call?.url.pathname}`).toBe("https://api.x.com/2/tweets");
		expect(call?.url.searchParams.get("ids")).toBe("1,2");
		expect(call?.url.searchParams.get("tweet.fields")).toBe("public_metrics");
		expect(header(call?.init ?? {}, "authorization")).toBe("Bearer tok-123");
		expect(x.analytics.maxPostsPerCall).toBe(100);
	});

	test("no ids → no request", async () => {
		fetchMock = mockFetch(() => jsonResponse({}));
		expect(await x.analytics.getPostMetrics(channel(), [])).toEqual({});
		expect(fetchMock.calls).toHaveLength(0);
	});

	test("429 is rate_limited with Retry-After; 401 is auth", async () => {
		fetchMock = mockFetch(
			() => new Response("{}", { status: 429, headers: { "retry-after": "30" } }),
		);
		await expect(x.analytics.getPostMetrics(channel(), ["1"])).rejects.toMatchObject({
			kind: "rate_limited",
			details: { retryAfterMs: 30_000 },
		});
		fetchMock.restore();
		fetchMock = mockFetch(() => new Response("{}", { status: 401 }));
		await expect(x.analytics.getPostMetrics(channel(), ["1"])).rejects.toMatchObject({
			kind: "auth",
		});
	});

	test("5xx on a read is transient, never unknown_outcome", async () => {
		fetchMock = mockFetch(() => new Response("oops", { status: 503 }));
		await expect(x.analytics.getPostMetrics(channel(), ["1"])).rejects.toMatchObject({
			kind: "transient",
		});
	});

	test("account metrics: current follower count dated today, only if today is in range", async () => {
		fetchMock = mockFetch(() =>
			jsonResponse({ data: { id: "u1", public_metrics: { followers_count: 507 } } }),
		);
		const today = utcDay(new Date());
		expect(
			await x.analytics.getAccountMetrics?.(channel(), { since: addDays(today, -7), until: today }),
		).toEqual([{ date: today, followers: 507 }]);
		expect(fetchMock.calls[0]?.url.pathname).toBe("/2/users/me");
		expect(fetchMock.calls[0]?.url.searchParams.get("user.fields")).toBe("public_metrics");

		expect(
			await x.analytics.getAccountMetrics?.(channel(), {
				since: "2020-01-01",
				until: "2020-01-31",
			}),
		).toEqual([]);
		expect(fetchMock.calls).toHaveLength(1);
	});
});
