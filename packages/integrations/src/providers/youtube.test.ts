import { afterEach, describe, expect, test } from "bun:test";
import { addDays, utcDay } from "../analytics";
import { channel, header, jsonResponse, mockFetch } from "../testing/fetch-mock";
import {
	classifyGoogleError,
	mapYouTubeStatistics,
	msUntilPacificMidnight,
	settingsSchema,
	validateYouTube,
	YouTubeProvider,
} from "./youtube";

const apiError = (status: number, reason: string) =>
	JSON.stringify({
		error: {
			code: status,
			message: `msg ${reason}`,
			errors: [{ reason, domain: "youtube.quota" }],
		},
	});

describe("msUntilPacificMidnight", () => {
	test("midnight PST → a full day", () => {
		expect(msUntilPacificMidnight(new Date("2026-01-15T08:00:00.000Z"))).toBe(24 * 3_600_000);
	});

	test("23:30 PDT → 30 minutes", () => {
		expect(msUntilPacificMidnight(new Date("2026-07-15T06:30:00.000Z"))).toBe(30 * 60_000);
	});
});

describe("classifyGoogleError", () => {
	const now = new Date("2026-07-15T06:30:00.000Z");

	test("quotaExceeded (403) is rate_limited until the Pacific-midnight reset, not auth", () => {
		const err = classifyGoogleError("youtube", 403, apiError(403, "quotaExceeded"), now);
		expect(err?.kind).toBe("rate_limited");
		expect(err?.details.retryAfterMs).toBe(30 * 60_000);
		expect(err?.details.platformCode).toBe("quotaExceeded");
	});

	test("uploadLimitExceeded is rate_limited", () => {
		const err = classifyGoogleError("youtube", 400, apiError(400, "uploadLimitExceeded"), now);
		expect(err?.kind).toBe("rate_limited");
	});

	test("short-term rate limits retry after a minute", () => {
		const err = classifyGoogleError("youtube", 403, apiError(403, "rateLimitExceeded"));
		expect(err?.details.retryAfterMs).toBe(60_000);
	});

	test("invalid_grant from the token endpoint is auth", () => {
		const body = JSON.stringify({
			error: "invalid_grant",
			error_description: "Token has been expired or revoked.",
		});
		const err = classifyGoogleError("youtube", 400, body);
		expect(err?.kind).toBe("auth");
		expect(err?.message).toBe("Token has been expired or revoked.");
	});

	test("other reasons fall back to the default mapping", () => {
		expect(classifyGoogleError("youtube", 400, apiError(400, "invalidTitle"))).toBeUndefined();
		expect(classifyGoogleError("youtube", 502, "<html/>")).toBeUndefined();
	});
});

describe("settingsSchema / validateYouTube", () => {
	test("applies defaults and trims the title", () => {
		expect(settingsSchema.parse({ title: " My video " })).toEqual({
			title: "My video",
			privacyStatus: "public",
			madeForKids: false,
			categoryId: "22",
		});
	});

	test("rejects empty and over-long titles", () => {
		expect(settingsSchema.safeParse({ title: "" }).success).toBe(false);
		expect(settingsSchema.safeParse({ title: "x".repeat(101) }).success).toBe(false);
	});

	test("flags angle brackets and the tag budget", () => {
		const settings = settingsSchema.parse({
			title: "A <b> title",
			tags: Array.from({ length: 60 }, () => "tagtag tag"),
		});
		expect(validateYouTube({ text: "desc > here", media: [], settings })).toEqual([
			"YouTube titles cannot contain < or >",
			"YouTube descriptions cannot contain < or >",
			"YouTube tags are limited to 500 characters in total",
		]);
	});

	test("counts the description in bytes", () => {
		const settings = settingsSchema.parse({ title: "t" });
		expect(validateYouTube({ text: "é".repeat(2600), media: [], settings })).toEqual([
			"YouTube descriptions are limited to 5000 bytes",
		]);
	});
});

describe("YouTube analytics", () => {
	const youtube = new YouTubeProvider({ clientId: "id", clientSecret: "secret" });
	let fetchMock: ReturnType<typeof mockFetch> | undefined;
	afterEach(() => fetchMock?.restore());

	test("viewCount is video views; the Data API has no impressions or reach", () => {
		expect(mapYouTubeStatistics({ viewCount: "1000", likeCount: "50", commentCount: "7" })).toEqual(
			{ videoViews: 1000, likes: 50, comments: 7 },
		);
		// A hidden like count stays unknown.
		expect(mapYouTubeStatistics({ viewCount: "3" })).toEqual({ videoViews: 3 });
	});

	test("videos.list part=statistics for all ids; deleted videos are simply absent", async () => {
		fetchMock = mockFetch(() =>
			jsonResponse({
				items: [{ id: "v1", statistics: { viewCount: "10", likeCount: "2", commentCount: "0" } }],
			}),
		);
		const out = await youtube.analytics.getPostMetrics(channel(), ["v1", "gone"]);
		expect(out).toEqual({ v1: { videoViews: 10, likes: 2, comments: 0 } });
		const [call] = fetchMock.calls;
		expect(call?.url.pathname).toBe("/youtube/v3/videos");
		expect(call?.url.searchParams.get("part")).toBe("statistics");
		expect(call?.url.searchParams.get("id")).toBe("v1,gone");
		expect(header(call?.init ?? {}, "authorization")).toBe("Bearer tok-123");
		expect(youtube.analytics.maxPostsPerCall).toBe(50);
	});

	test("quotaExceeded on a read is rate_limited until the quota resets", async () => {
		fetchMock = mockFetch(() => new Response(apiError(403, "quotaExceeded"), { status: 403 }));
		await expect(youtube.analytics.getPostMetrics(channel(), ["v1"])).rejects.toMatchObject({
			kind: "rate_limited",
		});
	});

	test("subscriber count for today; a hidden count stays unknown", async () => {
		const today = utcDay(new Date());
		const range = { since: addDays(today, -1), until: today };
		fetchMock = mockFetch(() =>
			jsonResponse({
				items: [{ statistics: { subscriberCount: "1230", hiddenSubscriberCount: false } }],
			}),
		);
		expect(
			await youtube.analytics.getAccountMetrics?.(channel({ externalId: "UC1" }), range),
		).toEqual([{ date: today, followers: 1230 }]);
		expect(fetchMock.calls[0]?.url.searchParams.get("id")).toBe("UC1");
		fetchMock.restore();

		fetchMock = mockFetch(() =>
			jsonResponse({
				items: [{ statistics: { subscriberCount: "0", hiddenSubscriberCount: true } }],
			}),
		);
		expect(await youtube.analytics.getAccountMetrics?.(channel(), range)).toEqual([]);
	});
});
