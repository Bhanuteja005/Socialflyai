import { describe, expect, test } from "bun:test";
import {
	classifyGoogleError,
	msUntilPacificMidnight,
	settingsSchema,
	validateYouTube,
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
