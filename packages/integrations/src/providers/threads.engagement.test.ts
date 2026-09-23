import { afterEach, describe, expect, test } from "bun:test";
import { channel, graphErrorResponse, jsonResponse, mockFetch } from "../testing/fetch-mock";
import { ThreadsProvider } from "./threads";

const threads = new ThreadsProvider({ appId: "app", appSecret: "secret" });
const me = channel({ externalId: "th1", metadata: { username: "brand" } });

let fetchMock: ReturnType<typeof mockFetch> | undefined;
afterEach(() => fetchMock?.restore());

const reply = (id: string, time: string, extra: Record<string, unknown> = {}) => ({
	id,
	text: `text ${id}`,
	username: "fan",
	timestamp: time,
	permalink: `https://www.threads.net/@fan/post/${id}`,
	...extra,
});

describe("Threads engagement", () => {
	test("reads the whole conversation and tells direct replies from nested ones", async () => {
		fetchMock = mockFetch(() =>
			jsonResponse({
				data: [
					reply("r3", "2026-09-10T12:00:00+0000", {
						username: "brand",
						replied_to: { id: "r1" },
						is_reply_owned_by_me: true,
					}),
					reply("r2", "2026-09-10T11:00:00+0000", { replied_to: { id: "r1" } }),
					reply("r1", "2026-09-10T10:00:00+0000", { replied_to: { id: "p1" } }),
				],
			}),
		);
		const items = await threads.engagement.listComments(me, {
			postExternalIds: ["p1"],
			since: null,
		});
		const [call] = fetchMock.calls;
		expect(`${call?.url.origin}${call?.url.pathname}`).toBe(
			"https://graph.threads.net/v1.0/p1/conversation",
		);
		expect(call?.url.searchParams.get("reverse")).toBe("true");
		expect(call?.url.searchParams.get("fields")).toContain("replied_to");
		expect(call?.url.searchParams.get("fields")).toContain("is_reply_owned_by_me");

		expect(items.map((i) => [i.externalId, i.kind, i.parentExternalId, i.fromSelf])).toEqual([
			["r1", "comment", null, false],
			["r2", "reply", "r1", false],
			["r3", "reply", "r1", true],
		]);
		expect(items[0]?.author).toEqual({
			externalId: null,
			name: null,
			handle: "fan",
			avatarUrl: null,
			profileUrl: "https://www.threads.net/@fan",
		});
		expect(items[0]?.postExternalId).toBe("p1");
		expect(items[0]?.url).toBe("https://www.threads.net/@fan/post/r1");
	});

	test("newest-first: stops at the first page reaching past `since`", async () => {
		fetchMock = mockFetch(() =>
			jsonResponse({
				data: [reply("new", "2026-09-10T12:00:00+0000"), reply("old", "2026-08-10T12:00:00+0000")],
				paging: { next: "https://graph.threads.net/v1.0/p1/conversation?after=x" },
			}),
		);
		const items = await threads.engagement.listComments(me, {
			postExternalIds: ["p1"],
			since: "2026-09-01T00:00:00.000Z",
		});
		expect(items.map((i) => i.externalId)).toEqual(["new"]);
		expect(fetchMock.calls).toHaveLength(1);
	});

	test("deleted post skipped; missing permission is auth", async () => {
		fetchMock = mockFetch(() => graphErrorResponse(100, 33));
		expect(
			await threads.engagement.listComments(me, { postExternalIds: ["gone"], since: null }),
		).toEqual([]);
		fetchMock.restore();
		fetchMock = mockFetch(() => graphErrorResponse(10));
		await expect(
			threads.engagement.listComments(me, { postExternalIds: ["p1"], since: null }),
		).rejects.toMatchObject({ kind: "auth" });
	});

	test("reply = reply container → status → threads_publish (only the last is mutating)", async () => {
		fetchMock = mockFetch((url) => {
			if (url.pathname === "/v1.0/th1/threads") return jsonResponse({ id: "ctr1" });
			if (url.pathname === "/v1.0/ctr1") return jsonResponse({ status: "FINISHED" });
			if (url.pathname === "/v1.0/th1/threads_publish") return jsonResponse({ id: "r9" });
			if (url.pathname === "/v1.0/r9") return jsonResponse({ permalink: "https://t/r9" });
			return new Response("unexpected", { status: 500 });
		});
		const out = await threads.engagement.reply(me, {
			toExternalId: "r1",
			kind: "comment",
			postExternalId: "p1",
			text: "thanks",
		});
		expect(out).toEqual({ externalId: "r9", url: "https://t/r9" });
		const [create, status, publish] = fetchMock.calls;
		expect(JSON.parse(String(create?.init.body))).toEqual({
			media_type: "TEXT",
			text: "thanks",
			reply_to_id: "r1",
		});
		expect(status?.init.method ?? "GET").toBe("GET");
		expect(JSON.parse(String(publish?.init.body))).toEqual({ creation_id: "ctr1" });
	});

	test("a timeout on threads_publish is unknown_outcome; one on the container is transient", async () => {
		const timeout = () => {
			throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
		};
		fetchMock = mockFetch((url) => {
			if (url.pathname === "/v1.0/th1/threads") return jsonResponse({ id: "ctr1" });
			if (url.pathname === "/v1.0/ctr1") return jsonResponse({ status: "FINISHED" });
			return timeout();
		});
		const input = { toExternalId: "r1", kind: "comment" as const, postExternalId: "p1", text: "x" };
		await expect(threads.engagement.reply(me, input)).rejects.toMatchObject({
			kind: "unknown_outcome",
		});

		fetchMock.restore();
		fetchMock = mockFetch(timeout);
		await expect(threads.engagement.reply(me, input)).rejects.toMatchObject({ kind: "transient" });
	});

	test("a failed container is invalid_request; too long is refused up front", async () => {
		fetchMock = mockFetch((url) =>
			url.pathname === "/v1.0/th1/threads"
				? jsonResponse({ id: "ctr1" })
				: jsonResponse({ status: "ERROR", error_message: "reply not allowed" }),
		);
		await expect(
			threads.engagement.reply(me, {
				toExternalId: "r1",
				kind: "comment",
				postExternalId: "p1",
				text: "x",
			}),
		).rejects.toMatchObject({ kind: "invalid_request" });
		const before = fetchMock.calls.length;
		await expect(
			threads.engagement.reply(me, {
				toExternalId: "r1",
				kind: "comment",
				postExternalId: "p1",
				text: "a".repeat(501),
			}),
		).rejects.toMatchObject({ kind: "invalid_request" });
		expect(fetchMock.calls.length).toBe(before);
	});

	test("requests threads_read_replies (new) and declares the scopes it needs", async () => {
		const scopes = new URL(
			(await threads.getAuthorizationUrl({ redirectUri: "https://x/cb", state: "s" })).url,
		).searchParams
			.get("scope")
			?.split(",");
		expect(scopes).toContain("threads_read_replies");
		expect(scopes).toContain("threads_manage_replies");
		expect(threads.engagement.requiredScopes.read).toContain("threads_read_replies");
		expect(threads.engagement.maxReplyLength).toBe(500);
	});
});
