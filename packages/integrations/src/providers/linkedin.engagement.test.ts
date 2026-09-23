import { afterEach, describe, expect, test } from "bun:test";
import { channel, header, jsonResponse, mockFetch } from "../testing/fetch-mock";
import type { SocialProvider } from "../types";
import { LinkedInPageProvider, LinkedInProfileProvider, linkedInCommentId } from "./linkedin";

const config = { clientId: "id", clientSecret: "secret", apiVersion: "202609" };
const page = new LinkedInPageProvider(config);
const org = channel({ externalId: "5515715" });
const ORG = "urn:li:organization:5515715";
const POST = "urn:li:share:7000";

let fetchMock: ReturnType<typeof mockFetch> | undefined;
afterEach(() => fetchMock?.restore());

const liComment = (id: string, time: number, extra: Record<string, unknown> = {}) => ({
	id,
	commentUrn: `urn:li:comment:(urn:li:activity:7001,${id})`,
	actor: "urn:li:person:fan",
	object: "urn:li:activity:7001",
	message: { text: `text ${id}`, attributes: [] },
	created: { actor: "urn:li:person:fan", time },
	...extra,
});
const urnOf = (id: string) => `urn:li:comment:(urn:li:activity:7001,${id})`;

describe("LinkedIn page engagement", () => {
	test("reads first-level comments and expands threads that have nested ones", async () => {
		fetchMock = mockFetch((url) => {
			const path = decodeURIComponent(url.pathname);
			if (path === `/rest/socialActions/${POST}/comments`) {
				return jsonResponse({
					paging: { start: 0, count: 100, total: 2 },
					elements: [
						liComment("1", Date.parse("2026-09-10T10:00:00Z"), {
							commentsSummary: { aggregatedTotalComments: 1, totalFirstLevelComments: 1 },
						}),
						liComment("2", Date.parse("2026-09-10T09:00:00Z")),
					],
				});
			}
			if (path === `/rest/socialActions/${urnOf("1")}/comments`) {
				return jsonResponse({
					elements: [
						liComment("3", Date.parse("2026-09-10T11:00:00Z"), {
							actor: ORG,
							parentComment: urnOf("1"),
						}),
					],
				});
			}
			return new Response("unexpected", { status: 500 });
		});
		const items = await page.engagement.listComments(org, { postExternalIds: [POST], since: null });

		const [first, nested] = fetchMock.calls;
		// URNs are percent-encoded in the path, as LinkedIn's own samples do.
		expect(first?.url.pathname).toBe(`/rest/socialActions/${encodeURIComponent(POST)}/comments`);
		expect(first?.url.searchParams.get("start")).toBe("0");
		expect(first?.url.searchParams.get("count")).toBe("100");
		expect(header(first?.init ?? {}, "linkedin-version")).toBe("202609");
		expect(header(first?.init ?? {}, "x-restli-protocol-version")).toBe("2.0.0");
		expect(nested?.url.pathname).toBe(
			`/rest/socialActions/${encodeURIComponent(urnOf("1"))}/comments`,
		);
		expect(fetchMock.calls).toHaveLength(2);

		expect(items.map((i) => [i.externalId, i.kind, i.parentExternalId, i.fromSelf])).toEqual([
			[urnOf("2"), "comment", null, false],
			[urnOf("1"), "comment", null, false],
			[urnOf("3"), "reply", urnOf("1"), true],
		]);
		expect(items[0]).toEqual({
			externalId: urnOf("2"),
			kind: "comment",
			postExternalId: POST,
			parentExternalId: null,
			author: {
				externalId: "urn:li:person:fan",
				name: null,
				handle: null,
				avatarUrl: null,
				profileUrl: null,
			},
			fromSelf: false,
			text: "text 2",
			url: `https://www.linkedin.com/feed/update/${POST}/?commentUrn=${encodeURIComponent(urnOf("2"))}`,
			createdAt: "2026-09-10T09:00:00.000Z",
		});
	});

	test("404 (no comments / deleted post) is skipped; since filters; paging bounded", async () => {
		fetchMock = mockFetch((url) => {
			if (decodeURIComponent(url.pathname).includes("urn:li:share:gone"))
				return new Response("{}", { status: 404 });
			const start = Number(url.searchParams.get("start"));
			return jsonResponse({
				paging: { start, count: 100, total: 10_000 },
				elements: Array.from({ length: 100 }, (_, i) =>
					liComment(
						`${start + i}`,
						Date.parse(i === 0 ? "2026-09-20T00:00:00Z" : "2026-08-01T00:00:00Z"),
					),
				),
			});
		});
		const items = await page.engagement.listComments(org, {
			postExternalIds: ["urn:li:share:gone", POST],
			since: "2026-09-01T00:00:00.000Z",
		});
		// 1 for the missing post + 5 bounded pages.
		expect(fetchMock.calls).toHaveLength(6);
		expect(fetchMock.calls[5]?.url.searchParams.get("start")).toBe("400");
		expect(items.map((i) => i.externalId)).toEqual(
			[0, 100, 200, 300, 400].map((n) => urnOf(`${n}`)).sort(),
		);
	});

	test("401/403 are auth, 429 rate_limited", async () => {
		fetchMock = mockFetch(() => new Response("{}", { status: 403 }));
		await expect(
			page.engagement.listComments(org, { postExternalIds: [POST], since: null }),
		).rejects.toMatchObject({ kind: "auth" });
		fetchMock.restore();
		fetchMock = mockFetch(() => new Response("{}", { status: 429 }));
		await expect(
			page.engagement.listComments(org, { postExternalIds: [POST], since: null }),
		).rejects.toMatchObject({ kind: "rate_limited" });
	});

	test("reply to a comment: nested comment as the organization, id from the response", async () => {
		fetchMock = mockFetch(() =>
			jsonResponse(
				{ id: "9", commentUrn: urnOf("9"), object: "urn:li:activity:7001", actor: ORG },
				201,
				{ "x-restli-id": "9" },
			),
		);
		const out = await page.engagement.reply(org, {
			toExternalId: urnOf("1"),
			kind: "comment",
			postExternalId: POST,
			text: "Thanks (really) #1",
		});
		expect(out).toEqual({
			externalId: urnOf("9"),
			url: `https://www.linkedin.com/feed/update/${POST}/?commentUrn=${encodeURIComponent(urnOf("9"))}`,
		});
		const [call] = fetchMock.calls;
		expect(call?.init.method).toBe("POST");
		expect(call?.url.pathname).toBe(
			`/rest/socialActions/${encodeURIComponent(urnOf("1"))}/comments`,
		);
		expect(JSON.parse(String(call?.init.body))).toEqual({
			actor: ORG,
			object: POST,
			// Plain text: comments are not "little text", nothing is escaped.
			message: { text: "Thanks (really) #1" },
			parentComment: urnOf("1"),
		});
	});

	test("reply to a nested reply goes to its top-level comment (looked up first)", async () => {
		expect(linkedInCommentId(urnOf("3"))).toBe("3");
		fetchMock = mockFetch((_url, init) =>
			init.method === "POST"
				? jsonResponse({}, 201, { "x-restli-id": "10" })
				: jsonResponse(liComment("3", 1, { parentComment: urnOf("1") })),
		);
		const out = await page.engagement.reply(org, {
			toExternalId: urnOf("3"),
			kind: "reply",
			postExternalId: POST,
			text: "hi",
		});
		const [lookup, post] = fetchMock.calls;
		expect(lookup?.url.pathname).toBe(`/rest/socialActions/${encodeURIComponent(POST)}/comments/3`);
		expect(JSON.parse(String(post?.init.body)).parentComment).toBe(urnOf("1"));
		// Only the header id came back: the URN is built from the post.
		expect(out.externalId).toBe(`urn:li:comment:(${POST},10)`);
	});

	test("reply failures: timeout/5xx unknown_outcome; 4xx invalid_request; no post id invalid_request", async () => {
		const input = {
			toExternalId: urnOf("1"),
			kind: "comment" as const,
			postExternalId: POST,
			text: "x",
		};
		fetchMock = mockFetch(() => {
			throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
		});
		await expect(page.engagement.reply(org, input)).rejects.toMatchObject({
			kind: "unknown_outcome",
		});
		fetchMock.restore();
		fetchMock = mockFetch(() => new Response("{}", { status: 504 }));
		await expect(page.engagement.reply(org, input)).rejects.toMatchObject({
			kind: "unknown_outcome",
		});
		fetchMock.restore();
		fetchMock = mockFetch(() => new Response("{}", { status: 422 }));
		await expect(page.engagement.reply(org, input)).rejects.toMatchObject({
			kind: "invalid_request",
		});
		fetchMock.restore();
		fetchMock = mockFetch(() => jsonResponse({}, 201));
		await expect(page.engagement.reply(org, input)).rejects.toMatchObject({
			kind: "unknown_outcome",
		});
		await expect(
			page.engagement.reply(org, { ...input, postExternalId: null }),
		).rejects.toMatchObject({ kind: "invalid_request" });
		await expect(
			page.engagement.reply(org, { ...input, text: "a".repeat(1251) }),
		).rejects.toMatchObject({ kind: "invalid_request" });
	});

	test("requests the _feed scopes (new); personal LinkedIn has no engagement", async () => {
		const scopes = new URL(
			(await page.getAuthorizationUrl({ redirectUri: "https://x/cb", state: "s" })).url,
		).searchParams
			.get("scope")
			?.split(" ");
		expect(scopes).toContain("r_organization_social_feed");
		expect(scopes).toContain("w_organization_social_feed");
		expect((new LinkedInProfileProvider(config) as SocialProvider).engagement).toBeUndefined();
	});
});
