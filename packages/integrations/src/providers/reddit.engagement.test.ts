import { afterEach, describe, expect, test } from "bun:test";
import { channel, header, jsonResponse, mockFetch } from "../testing/fetch-mock";
import { RedditProvider, redditSearchWindow } from "./reddit";

const reddit = new RedditProvider({
	clientId: "id",
	clientSecret: "secret",
	userAgent: "web:socialfly:1.0 (by /u/socialfly)",
});
const me = channel({ externalId: "abc", metadata: { username: "Brand" } });

let fetchMock: ReturnType<typeof mockFetch> | undefined;
afterEach(() => fetchMock?.restore());

const t1 = (
	name: string,
	parent: string,
	utc: number,
	extra: Record<string, unknown> = {},
): { kind: string; data: Record<string, unknown> } => ({
	kind: "t1",
	data: {
		id: name.slice(3),
		name,
		author: "fan",
		author_fullname: "t2_fan",
		body: `body ${name}`,
		created_utc: utc,
		parent_id: parent,
		permalink: `/r/test/comments/p1/x/${name.slice(3)}/`,
		replies: "",
		...extra,
	},
});
const listing = (children: unknown[]) => ({ kind: "Listing", data: { children } });

describe("Reddit engagement: comments", () => {
	const utc = (iso: string) => Date.parse(iso) / 1000;

	test("flattens the comment tree, keeps parent ids, skips `more` stubs and deleted comments", async () => {
		fetchMock = mockFetch(() =>
			jsonResponse([
				listing([{ kind: "t3", data: { name: "t3_p1" } }]),
				listing([
					t1("t1_a", "t3_p1", utc("2026-09-10T10:00:00Z"), {
						replies: listing([
							t1("t1_b", "t1_a", utc("2026-09-10T11:00:00Z"), { author: "brand" }),
							{ kind: "more", data: { count: 12, children: ["x", "y"] } },
						]),
					}),
					t1("t1_gone", "t3_p1", utc("2026-09-10T09:00:00Z"), {
						author: "[deleted]",
						body: "[removed]",
					}),
				]),
			]),
		);
		const items = await reddit.engagement.listComments(me, {
			postExternalIds: ["t3_p1"],
			since: null,
		});
		const [call] = fetchMock.calls;
		expect(call?.url.pathname).toBe("/comments/p1");
		expect(call?.url.searchParams.get("sort")).toBe("new");
		expect(call?.url.searchParams.get("raw_json")).toBe("1");
		expect(header(call?.init ?? {}, "user-agent")).toContain("socialfly");
		expect(header(call?.init ?? {}, "authorization")).toBe("Bearer tok-123");

		expect(items).toEqual([
			{
				externalId: "t1_a",
				kind: "comment",
				postExternalId: "t3_p1",
				parentExternalId: null,
				author: {
					externalId: "t2_fan",
					name: "fan",
					handle: "fan",
					avatarUrl: null,
					profileUrl: "https://www.reddit.com/user/fan",
				},
				fromSelf: false,
				text: "body t1_a",
				url: "https://www.reddit.com/r/test/comments/p1/x/a/",
				createdAt: "2026-09-10T10:00:00.000Z",
			},
			// Our own username, compared case-insensitively.
			expect.objectContaining({
				externalId: "t1_b",
				kind: "reply",
				parentExternalId: "t1_a",
				fromSelf: true,
			}),
		]);
	});

	test("since filters; deleted posts (404) and private subreddits (403 + reason) are skipped", async () => {
		fetchMock = mockFetch((url) => {
			if (url.pathname === "/comments/gone") return new Response("{}", { status: 404 });
			if (url.pathname === "/comments/priv")
				return jsonResponse({ reason: "private", message: "Forbidden", error: 403 }, 403);
			return jsonResponse([
				listing([]),
				listing([
					t1("t1_old", "t3_p1", utc("2026-08-01T00:00:00Z")),
					t1("t1_new", "t3_p1", utc("2026-09-20T00:00:00Z")),
				]),
			]);
		});
		const items = await reddit.engagement.listComments(me, {
			postExternalIds: ["t3_gone", "t3_priv", "t3_p1"],
			since: "2026-09-01T00:00:00.000Z",
		});
		expect(items.map((i) => i.externalId)).toEqual(["t1_new"]);
	});

	test("401 is auth; 429 rate_limited", async () => {
		fetchMock = mockFetch(() => new Response("{}", { status: 401 }));
		await expect(
			reddit.engagement.listComments(me, { postExternalIds: ["t3_p1"], since: null }),
		).rejects.toMatchObject({ kind: "auth" });
		fetchMock.restore();
		fetchMock = mockFetch(() => new Response("{}", { status: 429 }));
		await expect(
			reddit.engagement.listComments(me, { postExternalIds: ["t3_p1"], since: null }),
		).rejects.toMatchObject({ kind: "rate_limited" });
	});
});

describe("Reddit engagement: reply", () => {
	const input = {
		toExternalId: "t1_a",
		kind: "comment" as const,
		postExternalId: "t3_p1",
		text: "Thanks!",
	};

	test("POST /api/comment with thing_id, mapped from json.data.things", async () => {
		fetchMock = mockFetch(() =>
			jsonResponse({
				json: {
					errors: [],
					data: { things: [{ kind: "t1", data: { name: "t1_new", permalink: "/r/test/c/new/" } }] },
				},
			}),
		);
		expect(await reddit.engagement.reply(me, input)).toEqual({
			externalId: "t1_new",
			url: "https://www.reddit.com/r/test/c/new/",
		});
		const [call] = fetchMock.calls;
		expect(call?.url.pathname).toBe("/api/comment");
		expect(Object.fromEntries(new URLSearchParams(String(call?.init.body)))).toEqual({
			api_type: "json",
			thing_id: "t1_a",
			text: "Thanks!",
		});
	});

	test("Reddit's 200 + errors: RATELIMIT is rate_limited, THREAD_LOCKED invalid_request", async () => {
		fetchMock = mockFetch(() =>
			jsonResponse({
				json: { errors: [["RATELIMIT", "take a break for 3 minutes", "ratelimit"]] },
			}),
		);
		await expect(reddit.engagement.reply(me, input)).rejects.toMatchObject({
			kind: "rate_limited",
			details: { retryAfterMs: 180_000 },
		});
		fetchMock.restore();
		fetchMock = mockFetch(() =>
			jsonResponse({ json: { errors: [["THREAD_LOCKED", "that thread is locked", "parent"]] } }),
		);
		await expect(reddit.engagement.reply(me, input)).rejects.toMatchObject({
			kind: "invalid_request",
		});
	});

	test("timeout, 5xx, or 200 without an id are unknown_outcome", async () => {
		fetchMock = mockFetch(() => {
			throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
		});
		await expect(reddit.engagement.reply(me, input)).rejects.toMatchObject({
			kind: "unknown_outcome",
		});
		fetchMock.restore();
		fetchMock = mockFetch(() => new Response("bad gateway", { status: 502 }));
		await expect(reddit.engagement.reply(me, input)).rejects.toMatchObject({
			kind: "unknown_outcome",
		});
		fetchMock.restore();
		fetchMock = mockFetch(() => jsonResponse({ json: { errors: [] } }));
		await expect(reddit.engagement.reply(me, input)).rejects.toMatchObject({
			kind: "unknown_outcome",
		});
	});

	test("bad ids and over-long text are refused before sending", async () => {
		fetchMock = mockFetch(() => jsonResponse({}));
		await expect(
			reddit.engagement.reply(me, { ...input, toExternalId: "garbage" }),
		).rejects.toMatchObject({ kind: "invalid_request" });
		await expect(
			reddit.engagement.reply(me, { ...input, text: "a".repeat(10_001) }),
		).rejects.toMatchObject({ kind: "invalid_request" });
		expect(fetchMock.calls).toHaveLength(0);
	});
});

describe("Reddit engagement: listening", () => {
	test("search window grows with `since`; a week without one", () => {
		const now = new Date("2026-09-20T12:00:00Z");
		expect(redditSearchWindow(null, now)).toBe("week");
		expect(redditSearchWindow("2026-09-20T11:30:00Z", now)).toBe("hour");
		expect(redditSearchWindow("2026-09-19T20:00:00Z", now)).toBe("day");
		expect(redditSearchWindow("2026-09-15T00:00:00Z", now)).toBe("week");
		expect(redditSearchWindow("2026-08-25T00:00:00Z", now)).toBe("month");
		expect(redditSearchWindow("2025-01-01T00:00:00Z", now)).toBe("all");
	});

	test("site-wide new-first search mapped to discussions with the subreddit as community", async () => {
		let calls = 0;
		fetchMock = mockFetch(() => {
			const n = calls++;
			return jsonResponse({
				kind: "Listing",
				data: {
					after: "t3_next",
					children: [0, 1].map((i) => ({
						kind: "t3",
						data: {
							name: `t3_s${n}${i}`,
							author: "poster",
							author_fullname: "t2_poster",
							title: `Title ${n}${i}`,
							selftext: "Anyone tried socialfly?",
							permalink: `/r/marketing/comments/s${n}${i}/x/`,
							subreddit_name_prefixed: "r/marketing",
							created_utc: 1_788_000_000 + n * 10 + i,
							score: 12,
							num_comments: 4,
						},
					})),
				},
			});
		});
		const items = await reddit.engagement.searchDiscussions?.(me, {
			query: "socialfly",
			since: null,
			limit: 3,
		});
		// Two pages of two: stops once `limit` is covered.
		expect(fetchMock.calls).toHaveLength(2);
		const [call, second] = fetchMock.calls;
		expect(call?.url.pathname).toBe("/search");
		expect(Object.fromEntries(call?.url.searchParams ?? [])).toMatchObject({
			q: "socialfly",
			sort: "new",
			t: "week",
			type: "link",
			restrict_sr: "false",
			limit: "3",
		});
		expect(second?.url.searchParams.get("after")).toBe("t3_next");
		expect(items).toHaveLength(3);
		expect(items?.[0]).toEqual({
			externalId: "t3_s01",
			author: {
				externalId: "t2_poster",
				name: "poster",
				handle: "poster",
				avatarUrl: null,
				profileUrl: "https://www.reddit.com/user/poster",
			},
			title: "Title 01",
			text: "Anyone tried socialfly?",
			url: "https://www.reddit.com/r/marketing/comments/s01/x/",
			community: "r/marketing",
			createdAt: new Date((1_788_000_000 + 1) * 1000).toISOString(),
			score: 12,
			commentCount: 4,
		});
	});

	test("no mentions feed without the privatemessages scope", () => {
		expect(reddit.engagement.listMentions).toBeUndefined();
		expect(reddit.engagement.requiredScopes).toEqual({ read: ["read"], reply: ["submit"] });
	});
});
