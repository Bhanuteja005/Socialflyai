import { afterEach, describe, expect, test } from "bun:test";
import { channel, header, jsonResponse, mockFetch } from "../testing/fetch-mock";
import { YouTubeProvider, youtubeThreadId } from "./youtube";

const youtube = new YouTubeProvider({ clientId: "id", clientSecret: "secret" });
const me = channel({ externalId: "UCself" });

let fetchMock: ReturnType<typeof mockFetch> | undefined;
afterEach(() => fetchMock?.restore());

const googleError = (status: number, reason: string) =>
	jsonResponse({ error: { code: status, message: reason, errors: [{ reason }] } }, status);

const comment = (
	id: string,
	time: string,
	author = "UCfan",
	extra: Record<string, unknown> = {},
) => ({
	id,
	snippet: {
		authorDisplayName: author === "UCself" ? "@brand" : "@fan",
		authorProfileImageUrl: "https://yt/pic",
		authorChannelUrl: `http://www.youtube.com/channel/${author}`,
		authorChannelId: { value: author },
		textDisplay: `text ${id}`,
		publishedAt: time,
		...extra,
	},
});

describe("YouTube engagement", () => {
	test("reads comment threads with inline replies and maps them", async () => {
		fetchMock = mockFetch(() =>
			jsonResponse({
				items: [
					{
						id: "t1",
						snippet: {
							topLevelComment: comment("t1", "2026-09-10T10:00:00Z"),
							totalReplyCount: 1,
						},
						replies: {
							comments: [comment("t1.r1", "2026-09-10T11:00:00Z", "UCself", { parentId: "t1" })],
						},
					},
				],
			}),
		);
		const items = await youtube.engagement.listComments(me, {
			postExternalIds: ["vid1"],
			since: null,
		});
		const [call] = fetchMock.calls;
		expect(call?.url.pathname).toBe("/youtube/v3/commentThreads");
		expect(call?.url.searchParams.get("part")).toBe("snippet,replies");
		expect(call?.url.searchParams.get("videoId")).toBe("vid1");
		expect(call?.url.searchParams.get("textFormat")).toBe("plainText");
		expect(call?.url.searchParams.get("maxResults")).toBe("100");
		expect(header(call?.init ?? {}, "authorization")).toBe("Bearer tok-123");

		expect(items).toEqual([
			{
				externalId: "t1",
				kind: "comment",
				postExternalId: "vid1",
				parentExternalId: null,
				author: {
					externalId: "UCfan",
					name: "@fan",
					handle: "fan",
					avatarUrl: "https://yt/pic",
					profileUrl: "http://www.youtube.com/channel/UCfan",
				},
				fromSelf: false,
				text: "text t1",
				url: "https://www.youtube.com/watch?v=vid1&lc=t1",
				createdAt: "2026-09-10T10:00:00.000Z",
			},
			expect.objectContaining({
				externalId: "t1.r1",
				kind: "reply",
				parentExternalId: "t1",
				fromSelf: true,
			}),
		]);
	});

	test("threads with more replies than inline are expanded via comments.list", async () => {
		fetchMock = mockFetch((url) =>
			url.pathname.endsWith("/commentThreads")
				? jsonResponse({
						items: [
							{
								id: "t1",
								snippet: {
									topLevelComment: comment("t1", "2026-09-10T10:00:00Z"),
									totalReplyCount: 7,
								},
								replies: { comments: [] },
							},
						],
					})
				: jsonResponse({
						items: [comment("t1.r5", "2026-09-12T10:00:00Z", "UCfan", { parentId: "t1" })],
					}),
		);
		const items = await youtube.engagement.listComments(me, {
			postExternalIds: ["vid1"],
			since: "2026-09-11T00:00:00.000Z",
		});
		const expand = fetchMock.calls[1];
		expect(expand?.url.pathname).toBe("/youtube/v3/comments");
		expect(expand?.url.searchParams.get("parentId")).toBe("t1");
		// The old top-level comment is filtered; its new reply is not.
		expect(items.map((i) => i.externalId)).toEqual(["t1.r5"]);
	});

	test("pagination is bounded to 5 pages", async () => {
		let n = 0;
		fetchMock = mockFetch(() =>
			jsonResponse({
				items: [
					{ id: `t${n}`, snippet: { topLevelComment: comment(`t${n++}`, "2026-09-10T10:00:00Z") } },
				],
				nextPageToken: "next",
			}),
		);
		const items = await youtube.engagement.listComments(me, {
			postExternalIds: ["vid1"],
			since: null,
		});
		expect(fetchMock.calls).toHaveLength(5);
		expect(fetchMock.calls[1]?.url.searchParams.get("pageToken")).toBe("next");
		expect(items).toHaveLength(5);
	});

	test("comments disabled / video gone are skipped, not auth; a real 403 is auth; quota is rate_limited", async () => {
		fetchMock = mockFetch((url) => {
			const video = url.searchParams.get("videoId");
			if (video === "off") return googleError(403, "commentsDisabled");
			if (video === "gone") return googleError(404, "videoNotFound");
			return jsonResponse({ items: [] });
		});
		expect(
			await youtube.engagement.listComments(me, {
				postExternalIds: ["off", "gone", "ok"],
				since: null,
			}),
		).toEqual([]);
		expect(fetchMock.calls).toHaveLength(3);

		fetchMock.restore();
		fetchMock = mockFetch(() => googleError(403, "insufficientPermissions"));
		await expect(
			youtube.engagement.listComments(me, { postExternalIds: ["v"], since: null }),
		).rejects.toMatchObject({ kind: "auth" });

		fetchMock.restore();
		fetchMock = mockFetch(() => googleError(403, "quotaExceeded"));
		await expect(
			youtube.engagement.listComments(me, { postExternalIds: ["v"], since: null }),
		).rejects.toMatchObject({ kind: "rate_limited" });
	});

	test("reply = comments.insert on the thread's top-level comment, mutating", async () => {
		expect(youtubeThreadId("t1.r5")).toBe("t1");
		expect(youtubeThreadId("t1")).toBe("t1");

		fetchMock = mockFetch(() => jsonResponse({ id: "t1.r9" }));
		expect(
			await youtube.engagement.reply(me, {
				toExternalId: "t1.r5",
				kind: "reply",
				postExternalId: "vid1",
				text: "Thanks!",
			}),
		).toEqual({ externalId: "t1.r9", url: "https://www.youtube.com/watch?v=vid1&lc=t1.r9" });
		const [call] = fetchMock.calls;
		expect(call?.init.method).toBe("POST");
		expect(call?.url.pathname).toBe("/youtube/v3/comments");
		expect(call?.url.searchParams.get("part")).toBe("snippet");
		expect(JSON.parse(String(call?.init.body))).toEqual({
			snippet: { parentId: "t1", textOriginal: "Thanks!" },
		});
	});

	test("reply failures: timeout/5xx unknown_outcome, too long invalid_request, deleted parent invalid_request", async () => {
		const input = {
			toExternalId: "t1",
			kind: "comment" as const,
			postExternalId: "vid1",
			text: "x",
		};
		fetchMock = mockFetch(() => {
			throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
		});
		await expect(youtube.engagement.reply(me, input)).rejects.toMatchObject({
			kind: "unknown_outcome",
		});
		fetchMock.restore();
		fetchMock = mockFetch(() => new Response("backend", { status: 500 }));
		await expect(youtube.engagement.reply(me, input)).rejects.toMatchObject({
			kind: "unknown_outcome",
		});
		fetchMock.restore();
		fetchMock = mockFetch(() => googleError(404, "parentCommentNotFound"));
		await expect(youtube.engagement.reply(me, input)).rejects.toMatchObject({
			kind: "invalid_request",
		});
		await expect(
			youtube.engagement.reply(me, { ...input, text: "a".repeat(10_001) }),
		).rejects.toMatchObject({ kind: "invalid_request" });
	});

	test("requests youtube.force-ssl (new) for replying; reads use youtube.readonly", async () => {
		const scopes = new URL(
			(await youtube.getAuthorizationUrl({ redirectUri: "https://x/cb", state: "s" })).url,
		).searchParams
			.get("scope")
			?.split(" ");
		expect(scopes).toContain("https://www.googleapis.com/auth/youtube.force-ssl");
		expect(youtube.engagement.requiredScopes).toEqual({
			read: ["https://www.googleapis.com/auth/youtube.readonly"],
			reply: ["https://www.googleapis.com/auth/youtube.force-ssl"],
		});
	});
});
