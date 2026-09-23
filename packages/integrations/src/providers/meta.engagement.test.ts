import { afterEach, describe, expect, test } from "bun:test";
import {
	channel,
	graphErrorResponse,
	header,
	jsonResponse,
	mockFetch,
} from "../testing/fetch-mock";
import { FacebookProvider, InstagramProvider } from "./meta";

const config = { appId: "app", appSecret: "secret", graphVersion: "v23.0" };
const facebook = new FacebookProvider(config);
const instagram = new InstagramProvider(config);
const page = channel({ externalId: "pg1" });

let fetchMock: ReturnType<typeof mockFetch> | undefined;
afterEach(() => fetchMock?.restore());

const timeout = () => {
	throw Object.assign(new Error("The operation timed out."), { name: "TimeoutError" });
};

const scopesOf = async (p: FacebookProvider | InstagramProvider) =>
	new URL(
		(await p.getAuthorizationUrl({ redirectUri: "https://x/cb", state: "s" })).url,
	).searchParams
		.get("scope")
		?.split(",");

describe("Facebook engagement", () => {
	const fbComment = (id: string, time: string, extra: Record<string, unknown> = {}) => ({
		id,
		message: `text ${id}`,
		created_time: time,
		from: { id: "u1", name: "Ann", picture: { data: { url: "https://pic/u1" } } },
		permalink_url: `https://www.facebook.com/p/${id}`,
		...extra,
	});

	test("requests all-level comments newest first and maps comments, replies and our own", async () => {
		fetchMock = mockFetch(() =>
			jsonResponse({
				data: [
					fbComment("pg1_10_3", "2026-09-10T12:00:00+0000", {
						from: { id: "pg1", name: "Our Page" },
						parent: { id: "pg1_10_1" },
					}),
					fbComment("pg1_10_2", "2026-09-10T11:00:00+0000", { parent: { id: "pg1_10_1" } }),
					fbComment("pg1_10_1", "2026-09-10T10:00:00+0000"),
				],
			}),
		);
		const items = await facebook.engagement.listComments(page, {
			postExternalIds: ["pg1_10"],
			since: null,
		});

		const [call] = fetchMock.calls;
		expect(call?.url.pathname).toBe("/v23.0/pg1_10/comments");
		expect(call?.url.searchParams.get("filter")).toBe("stream");
		expect(call?.url.searchParams.get("order")).toBe("reverse_chronological");
		expect(call?.url.searchParams.get("fields")).toContain("from{id,name,picture}");
		expect(call?.url.searchParams.get("fields")).toContain("parent{id}");
		expect(header(call?.init ?? {}, "authorization")).toBe("Bearer tok-123");

		// Oldest first regardless of Graph's order.
		expect(items.map((i) => [i.externalId, i.kind, i.parentExternalId, i.fromSelf])).toEqual([
			["pg1_10_1", "comment", null, false],
			["pg1_10_2", "reply", "pg1_10_1", false],
			["pg1_10_3", "reply", "pg1_10_1", true],
		]);
		expect(items[0]).toEqual({
			externalId: "pg1_10_1",
			kind: "comment",
			postExternalId: "pg1_10",
			parentExternalId: null,
			author: {
				externalId: "u1",
				name: "Ann",
				handle: null,
				avatarUrl: "https://pic/u1",
				profileUrl: "https://www.facebook.com/u1",
			},
			fromSelf: false,
			text: "text pg1_10_1",
			url: "https://www.facebook.com/p/pg1_10_1",
			createdAt: "2026-09-10T10:00:00.000Z",
		});
	});

	test("stops paging once a page reaches back past `since`, and filters by it", async () => {
		fetchMock = mockFetch(() =>
			jsonResponse({
				data: [
					fbComment("new", "2026-09-10T12:00:00+0000"),
					fbComment("old", "2026-09-01T12:00:00+0000"),
				],
				paging: { next: "https://graph.facebook.com/v23.0/pg1_10/comments?after=x" },
			}),
		);
		const items = await facebook.engagement.listComments(page, {
			postExternalIds: ["pg1_10"],
			since: "2026-09-05T00:00:00.000Z",
		});
		expect(items.map((i) => i.externalId)).toEqual(["new"]);
		expect(fetchMock.calls).toHaveLength(1);
	});

	test("pagination is bounded to 5 pages per post", async () => {
		let n = 0;
		fetchMock = mockFetch(() =>
			jsonResponse({
				data: [fbComment(`c${n++}`, "2026-09-10T12:00:00+0000")],
				paging: { next: "https://graph.facebook.com/v23.0/pg1_10/comments?after=x" },
			}),
		);
		const items = await facebook.engagement.listComments(page, {
			postExternalIds: ["pg1_10"],
			since: null,
		});
		expect(fetchMock.calls).toHaveLength(5);
		expect(items).toHaveLength(5);
	});

	test("a deleted post is skipped; an expired token is auth; a throttle is rate_limited", async () => {
		fetchMock = mockFetch((url) =>
			url.pathname.includes("gone")
				? graphErrorResponse(100, 33)
				: jsonResponse({ data: [fbComment("c1", "2026-09-10T12:00:00+0000")] }),
		);
		const items = await facebook.engagement.listComments(page, {
			postExternalIds: ["pg1_gone", "pg1_10"],
			since: null,
		});
		expect(items.map((i) => i.postExternalId)).toEqual(["pg1_10"]);

		fetchMock.restore();
		fetchMock = mockFetch(() => graphErrorResponse(190, 463));
		await expect(
			facebook.engagement.listComments(page, { postExternalIds: ["pg1_10"], since: null }),
		).rejects.toMatchObject({ kind: "auth" });
		fetchMock.restore();
		fetchMock = mockFetch(() => graphErrorResponse(32));
		await expect(
			facebook.engagement.listComments(page, { postExternalIds: ["pg1_10"], since: null }),
		).rejects.toMatchObject({ kind: "rate_limited" });
	});

	test("reply to a comment posts on that comment, mutating, with read-after-write fields", async () => {
		fetchMock = mockFetch(() =>
			jsonResponse({ id: "pg1_10_9", permalink_url: "https://www.facebook.com/c/9" }),
		);
		const out = await facebook.engagement.reply(page, {
			toExternalId: "pg1_10_1",
			kind: "comment",
			postExternalId: "pg1_10",
			text: "  Thanks!  ",
		});
		expect(out).toEqual({ externalId: "pg1_10_9", url: "https://www.facebook.com/c/9" });
		const [call] = fetchMock.calls;
		expect(call?.init.method).toBe("POST");
		expect(call?.url.pathname).toBe("/v23.0/pg1_10_1/comments");
		expect(call?.url.searchParams.get("fields")).toBe("id,permalink_url");
		expect(JSON.parse(String(call?.init.body))).toEqual({ message: "Thanks!" });
	});

	test("reply to a reply goes to its top-level comment (Facebook nests one level)", async () => {
		fetchMock = mockFetch((_url, init) =>
			init.method === "POST"
				? jsonResponse({ id: "new" })
				: jsonResponse({ id: "pg1_10_2", parent: { id: "pg1_10_1" } }),
		);
		await facebook.engagement.reply(page, {
			toExternalId: "pg1_10_2",
			kind: "reply",
			postExternalId: "pg1_10",
			text: "hi",
		});
		const [lookup, post] = fetchMock.calls;
		expect(lookup?.url.pathname).toBe("/v23.0/pg1_10_2");
		expect(lookup?.url.searchParams.get("fields")).toBe("parent{id}");
		expect(post?.url.pathname).toBe("/v23.0/pg1_10_1/comments");
	});

	test("reply failures: timeout and Graph 'try again' are unknown_outcome; content errors invalid_request", async () => {
		const input = {
			toExternalId: "c1",
			kind: "comment" as const,
			postExternalId: "pg1_10",
			text: "hi",
		};
		fetchMock = mockFetch(timeout);
		await expect(facebook.engagement.reply(page, input)).rejects.toMatchObject({
			kind: "unknown_outcome",
		});
		fetchMock.restore();
		fetchMock = mockFetch(() => graphErrorResponse(2));
		await expect(facebook.engagement.reply(page, input)).rejects.toMatchObject({
			kind: "unknown_outcome",
		});
		fetchMock.restore();
		fetchMock = mockFetch(() => graphErrorResponse(100));
		await expect(facebook.engagement.reply(page, input)).rejects.toMatchObject({
			kind: "invalid_request",
		});
		fetchMock.restore();
		fetchMock = mockFetch(() => graphErrorResponse(200));
		await expect(facebook.engagement.reply(page, input)).rejects.toMatchObject({ kind: "auth" });
	});

	test("too-long replies and mention replies are refused before any request", async () => {
		fetchMock = mockFetch(() => jsonResponse({ id: "x" }));
		await expect(
			facebook.engagement.reply(page, {
				toExternalId: "c1",
				kind: "comment",
				postExternalId: "pg1_10",
				text: "a".repeat(facebook.engagement.maxReplyLength + 1),
			}),
		).rejects.toMatchObject({ kind: "invalid_request" });
		await expect(
			facebook.engagement.reply(page, {
				toExternalId: "c1",
				kind: "mention",
				postExternalId: null,
				text: "hi",
			}),
		).rejects.toMatchObject({ kind: "invalid_request" });
		expect(fetchMock.calls).toHaveLength(0);
	});

	test("requests the new engagement scopes and declares them", async () => {
		const scopes = await scopesOf(facebook);
		expect(scopes).toContain("pages_read_user_content");
		expect(scopes).toContain("pages_manage_engagement");
		for (const s of [
			...facebook.engagement.requiredScopes.read,
			...facebook.engagement.requiredScopes.reply,
		]) {
			expect(scopes).toContain(s);
		}
		expect(facebook.engagement.listMentions).toBeUndefined();
	});
});

describe("Instagram engagement", () => {
	const ig = channel({ externalId: "ig1" });

	test("reads comments with inline replies and maps parent ids and our own replies", async () => {
		fetchMock = mockFetch(() =>
			jsonResponse({
				data: [
					{
						id: "c1",
						text: "love it",
						timestamp: "2026-09-10T10:00:00+0000",
						username: "fan",
						from: { id: "u1", username: "fan" },
						replies: {
							data: [
								{
									id: "r1",
									text: "thanks!",
									timestamp: "2026-09-10T11:00:00+0000",
									username: "brand",
									from: { id: "ig1", username: "brand" },
									parent_id: "c1",
								},
								{
									id: "r2",
									text: "same",
									timestamp: "2026-09-10T12:00:00+0000",
									username: "other",
								},
							],
						},
					},
				],
			}),
		);
		const items = await instagram.engagement.listComments(ig, {
			postExternalIds: ["m1"],
			since: null,
		});
		const [call] = fetchMock.calls;
		expect(call?.url.pathname).toBe("/v23.0/m1/comments");
		expect(call?.url.searchParams.get("fields")).toContain("replies.limit(50){");
		expect(call?.url.searchParams.get("limit")).toBe("50");

		expect(items.map((i) => [i.externalId, i.kind, i.parentExternalId, i.fromSelf])).toEqual([
			["c1", "comment", null, false],
			["r1", "reply", "c1", true],
			// No parent_id on the nested row: the enclosing comment is the parent.
			["r2", "reply", "c1", false],
		]);
		expect(items[0]?.author).toEqual({
			externalId: "u1",
			name: null,
			handle: "fan",
			avatarUrl: null,
			profileUrl: "https://www.instagram.com/fan/",
		});
		expect(items[0]?.postExternalId).toBe("m1");
	});

	test("since filters (no early stop: order is undocumented), bounded to 5 pages", async () => {
		fetchMock = mockFetch(() =>
			jsonResponse({
				data: [
					{ id: `old${Math.random()}`, timestamp: "2026-08-01T00:00:00+0000" },
					{ id: `new${Math.random()}`, timestamp: "2026-09-20T00:00:00+0000" },
				],
				paging: { next: "https://graph.facebook.com/v23.0/m1/comments?after=x" },
			}),
		);
		const items = await instagram.engagement.listComments(ig, {
			postExternalIds: ["m1"],
			since: "2026-09-01T00:00:00.000Z",
		});
		expect(fetchMock.calls).toHaveLength(5);
		expect(items).toHaveLength(5);
		expect(items.every((i) => i.externalId.startsWith("new"))).toBe(true);
	});

	test("reply posts to /{comment}/replies, mutating", async () => {
		fetchMock = mockFetch(() => jsonResponse({ id: "r9" }));
		expect(
			await instagram.engagement.reply(ig, {
				toExternalId: "c1",
				kind: "comment",
				postExternalId: "m1",
				text: "thank you",
			}),
		).toEqual({ externalId: "r9", url: null });
		const [call] = fetchMock.calls;
		expect(call?.url.pathname).toBe("/v23.0/c1/replies");
		expect(JSON.parse(String(call?.init.body))).toEqual({ message: "thank you" });

		fetchMock.restore();
		fetchMock = mockFetch(timeout);
		await expect(
			instagram.engagement.reply(ig, {
				toExternalId: "c1",
				kind: "comment",
				postExternalId: "m1",
				text: "again",
			}),
		).rejects.toMatchObject({ kind: "unknown_outcome" });

		fetchMock.restore();
		fetchMock = mockFetch(() => new Response("oops", { status: 502 }));
		await expect(
			instagram.engagement.reply(ig, {
				toExternalId: "c1",
				kind: "comment",
				postExternalId: "m1",
				text: "again",
			}),
		).rejects.toMatchObject({ kind: "unknown_outcome" });
	});

	test("instagram_manage_comments was already requested; no mentions feed", async () => {
		expect(await scopesOf(instagram)).toContain("instagram_manage_comments");
		expect(instagram.engagement.listMentions).toBeUndefined();
		expect(instagram.engagement.maxReplyLength).toBe(2200);
	});
});
