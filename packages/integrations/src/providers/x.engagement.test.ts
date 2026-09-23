import { afterEach, describe, expect, test } from "bun:test";
import { channel, header, jsonResponse, mockFetch } from "../testing/fetch-mock";
import { XProvider, xListeningQuery, xStartTime } from "./x";

const x = new XProvider({ clientId: "id", clientSecret: "secret" });
const me = channel({ externalId: "42", metadata: { username: "brand" } });

let fetchMock: ReturnType<typeof mockFetch> | undefined;
afterEach(() => fetchMock?.restore());

const now = () => new Date().toISOString();
const post = (id: string, extra: Record<string, unknown> = {}) => ({
	id,
	text: `text ${id}`,
	created_at: now(),
	author_id: "7",
	conversation_id: "100",
	...extra,
});
const users = [
	{ id: "7", name: "Fan", username: "fan", profile_image_url: "https://pbs/fan.jpg" },
	{ id: "42", name: "Brand", username: "brand" },
];
const timeout = () => {
	throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
};

describe("X helpers", () => {
	test("listening defaults are added only when the query does not decide them", () => {
		expect(xListeningQuery("socialfly")).toBe("socialfly -is:retweet lang:en");
		expect(xListeningQuery("socialfly lang:de")).toBe("socialfly lang:de -is:retweet");
		expect(xListeningQuery("socialfly is:retweet")).toBe("socialfly is:retweet lang:en");
		// ORs are grouped so the defaults apply to every alternative.
		expect(xListeningQuery("a OR b")).toBe("(a OR b) -is:retweet lang:en");
	});

	test("start_time is clamped into the 7-day search window", () => {
		const at = new Date("2026-09-20T00:00:00.000Z");
		expect(xStartTime("2026-09-19T00:00:00.000Z", at)).toBe("2026-09-19T00:00:00.000Z");
		expect(Date.parse(xStartTime("2026-01-01T00:00:00.000Z", at))).toBeGreaterThan(
			Date.parse("2026-09-13T00:00:00.000Z"),
		);
		expect(Date.parse(xStartTime(null, at))).toBeGreaterThan(
			Date.parse("2026-09-13T00:00:00.000Z"),
		);
	});
});

describe("X engagement: replies to our posts", () => {
	test("searches conversation_id:… ORed, maps comments/replies, skips the root, decodes entities", async () => {
		fetchMock = mockFetch(() =>
			jsonResponse({
				data: [
					// The root post itself comes back from search: not engagement.
					post("100", { author_id: "42" }),
					post("101", {
						text: "Tom &amp; Jerry",
						referenced_tweets: [{ type: "replied_to", id: "100" }],
					}),
					post("102", {
						author_id: "42",
						referenced_tweets: [{ type: "replied_to", id: "101" }],
					}),
				],
				includes: { users },
			}),
		);
		const items = await x.engagement.listComments(me, {
			postExternalIds: ["100", "200", "not-an-id"],
			since: null,
		});
		const [call] = fetchMock.calls;
		expect(call?.url.pathname).toBe("/2/tweets/search/recent");
		expect(call?.url.searchParams.get("query")).toBe("conversation_id:100 OR conversation_id:200");
		expect(call?.url.searchParams.get("expansions")).toBe("author_id");
		expect(call?.url.searchParams.get("tweet.fields")).toContain("conversation_id");
		expect(call?.url.searchParams.get("max_results")).toBe("100");
		expect(call?.url.searchParams.get("start_time")).toBeTruthy();
		expect(header(call?.init ?? {}, "authorization")).toBe("Bearer tok-123");

		expect(items.map((i) => [i.externalId, i.kind, i.parentExternalId, i.fromSelf])).toEqual([
			["101", "comment", null, false],
			["102", "reply", "101", true],
		]);
		expect(items[0]).toMatchObject({
			postExternalId: "100",
			text: "Tom & Jerry",
			url: "https://x.com/fan/status/101",
			author: {
				externalId: "7",
				name: "Fan",
				handle: "fan",
				avatarUrl: "https://pbs/fan.jpg",
				profileUrl: "https://x.com/fan",
			},
		});
	});

	test("next_token pagination is bounded to 5 pages; since filters", async () => {
		let n = 0;
		fetchMock = mockFetch(() =>
			jsonResponse({
				data: [
					post(`${1000 + n++}`, { referenced_tweets: [{ type: "replied_to", id: "100" }] }),
					post("1", {
						created_at: "2020-01-01T00:00:00.000Z",
						referenced_tweets: [{ type: "replied_to", id: "100" }],
					}),
				],
				includes: { users },
				meta: { next_token: "nt" },
			}),
		);
		const items = await x.engagement.listComments(me, {
			postExternalIds: ["100"],
			since: "2021-01-01T00:00:00.000Z",
		});
		expect(fetchMock.calls).toHaveLength(5);
		expect(fetchMock.calls[1]?.url.searchParams.get("next_token")).toBe("nt");
		expect(items).toHaveLength(5);
	});

	test("429 is rate_limited; 401 auth", async () => {
		fetchMock = mockFetch(
			() => new Response("{}", { status: 429, headers: { "retry-after": "900" } }),
		);
		await expect(
			x.engagement.listComments(me, { postExternalIds: ["100"], since: null }),
		).rejects.toMatchObject({ kind: "rate_limited", details: { retryAfterMs: 900_000 } });
		fetchMock.restore();
		fetchMock = mockFetch(() => new Response("{}", { status: 401 }));
		await expect(
			x.engagement.listComments(me, { postExternalIds: ["100"], since: null }),
		).rejects.toMatchObject({ kind: "auth" });
	});
});

describe("X engagement: mentions", () => {
	test("reads the mentions timeline with pagination_token, drops our own posts", async () => {
		let n = 0;
		fetchMock = mockFetch(() =>
			jsonResponse({
				data: [post(`${500 + n}`), post(`${600 + n++}`, { author_id: "42" })],
				includes: { users },
				meta: n < 2 ? { next_token: "p2" } : {},
			}),
		);
		const items = await x.engagement.listMentions?.(me, { since: "2021-01-01T00:00:00.000Z" });
		expect(fetchMock.calls).toHaveLength(2);
		const [first, second] = fetchMock.calls;
		expect(first?.url.pathname).toBe("/2/users/42/mentions");
		expect(first?.url.searchParams.get("start_time")).toBe("2021-01-01T00:00:00.000Z");
		expect(second?.url.searchParams.get("pagination_token")).toBe("p2");
		expect(items?.map((i) => [i.externalId, i.kind, i.postExternalId, i.parentExternalId])).toEqual(
			[
				["500", "mention", null, null],
				["501", "mention", null, null],
			],
		);
	});
});

describe("X engagement: reply", () => {
	const input = {
		toExternalId: "101",
		kind: "comment" as const,
		postExternalId: "100",
		text: "Thanks!",
	};

	test("POST /2/tweets with reply.in_reply_to_tweet_id", async () => {
		fetchMock = mockFetch(() => jsonResponse({ data: { id: "103", text: "Thanks!" } }, 201));
		expect(await x.engagement.reply(me, input)).toEqual({
			externalId: "103",
			url: "https://x.com/brand/status/103",
		});
		const [call] = fetchMock.calls;
		expect(call?.init.method).toBe("POST");
		expect(call?.url.pathname).toBe("/2/tweets");
		expect(JSON.parse(String(call?.init.body))).toEqual({
			text: "Thanks!",
			reply: { in_reply_to_tweet_id: "101" },
		});
	});

	test("timeout and 5xx are unknown_outcome (never retried into a double reply)", async () => {
		fetchMock = mockFetch(timeout);
		await expect(x.engagement.reply(me, input)).rejects.toMatchObject({ kind: "unknown_outcome" });
		fetchMock.restore();
		fetchMock = mockFetch(() => new Response("oops", { status: 503 }));
		await expect(x.engagement.reply(me, input)).rejects.toMatchObject({ kind: "unknown_outcome" });
		fetchMock.restore();
		fetchMock = mockFetch(() => jsonResponse({}, 201));
		await expect(x.engagement.reply(me, input)).rejects.toMatchObject({ kind: "unknown_outcome" });
	});

	test("the 2026 reply restriction (403 about the conversation) is invalid_request, not auth", async () => {
		fetchMock = mockFetch(() =>
			jsonResponse(
				{
					detail:
						"Reply to this conversation is not allowed because you have not been mentioned or otherwise engaged by the author of the post you are replying to.",
				},
				403,
			),
		);
		await expect(x.engagement.reply(me, input)).rejects.toMatchObject({ kind: "invalid_request" });
	});

	test("length uses X's weighting: a long URL is 23, CJK counts double", async () => {
		fetchMock = mockFetch(() => jsonResponse({ data: { id: "103" } }, 201));
		await x.engagement.reply(me, {
			...input,
			text: `${"a".repeat(250)} https://example.com/${"p".repeat(200)}`,
		});
		expect(fetchMock.calls).toHaveLength(1);
		await expect(
			x.engagement.reply(me, { ...input, text: "日".repeat(141) }),
		).rejects.toMatchObject({
			kind: "invalid_request",
		});
		await expect(x.engagement.reply(me, { ...input, toExternalId: "abc" })).rejects.toMatchObject({
			kind: "invalid_request",
		});
		expect(fetchMock.calls).toHaveLength(1);
	});
});

describe("X engagement: listening", () => {
	test("recent search with defaults, mapped to discussions, capped at `limit`", async () => {
		fetchMock = mockFetch(() =>
			jsonResponse({
				data: [
					post("900", {
						conversation_id: "900",
						public_metrics: { like_count: 3, reply_count: 1 },
					}),
					post("901", { conversation_id: "901", created_at: "2020-01-01T00:00:00.000Z" }),
				],
				includes: { users },
				meta: { next_token: "more" },
			}),
		);
		const items = await x.engagement.searchDiscussions?.(me, {
			query: "socialfly",
			since: null,
			limit: 1,
		});
		const [call] = fetchMock.calls;
		expect(fetchMock.calls).toHaveLength(1);
		expect(call?.url.searchParams.get("query")).toBe("socialfly -is:retweet lang:en");
		expect(call?.url.searchParams.get("max_results")).toBe("10");
		expect(call?.url.searchParams.get("sort_order")).toBe("recency");
		expect(items).toEqual([
			{
				externalId: "900",
				author: {
					externalId: "7",
					name: "Fan",
					handle: "fan",
					avatarUrl: "https://pbs/fan.jpg",
					profileUrl: "https://x.com/fan",
				},
				title: null,
				text: "text 900",
				url: "https://x.com/fan/status/900",
				community: null,
				createdAt: expect.any(String),
				score: 3,
				commentCount: 1,
			},
		]);
	});

	test("an empty query is refused without a request", async () => {
		fetchMock = mockFetch(() => jsonResponse({}));
		await expect(
			x.engagement.searchDiscussions?.(me, { query: "  ", since: null, limit: 10 }),
		).rejects.toMatchObject({ kind: "invalid_request" });
		expect(fetchMock.calls).toHaveLength(0);
	});
});
