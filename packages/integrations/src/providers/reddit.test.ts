import { describe, expect, test } from "bun:test";
import {
	normalizeSubreddit,
	parseRedditRetryMs,
	redditErrorsToProviderError,
	settingsSchema,
} from "./reddit";

describe("parseRedditRetryMs", () => {
	test.each([
		[
			"Looks like you've been doing that a lot. Take a break for 9 minutes before trying again.",
			540_000,
		],
		["you are doing that too much. try again in 1 minute.", 60_000],
		["Take a break for 45 seconds before trying again.", 45_000],
		["try again in 2 hours", 7_200_000],
		["try again in 500 milliseconds", 500],
	])("%s", (message, expected) => {
		expect(parseRedditRetryMs(message)).toBe(expected);
	});

	test("returns undefined when no duration is present", () => {
		expect(parseRedditRetryMs("slow down")).toBeUndefined();
	});
});

describe("redditErrorsToProviderError", () => {
	test("RATELIMIT becomes rate_limited with the parsed delay", () => {
		const err = redditErrorsToProviderError("reddit", [
			["RATELIMIT", "Take a break for 5 minutes before trying again.", "ratelimit"],
		]);
		expect(err.kind).toBe("rate_limited");
		expect(err.details.retryAfterMs).toBe(300_000);
		expect(err.details.platformCode).toBe("RATELIMIT");
	});

	test("the numeric json.ratelimit (seconds) wins over the message", () => {
		const err = redditErrorsToProviderError(
			"reddit",
			[["RATELIMIT", "Take a break for 5 minutes before trying again.", "ratelimit"]],
			123.4,
		);
		expect(err.details.retryAfterMs).toBe(123_400);
	});

	test("RATELIMIT without a duration gets a conservative default", () => {
		const err = redditErrorsToProviderError("reddit", [["RATELIMIT", "slow down", "ratelimit"]]);
		expect(err.details.retryAfterMs).toBe(600_000);
	});

	test.each(["SUBREDDIT_NOEXIST", "NO_SELFS", "SUBMIT_VALIDATION_FLAIR_REQUIRED"])(
		"%s is invalid_request",
		(code) => {
			const err = redditErrorsToProviderError("reddit", [[code, "nope", "sr"]]);
			expect(err.kind).toBe("invalid_request");
			expect(err.message).toBe(`${code}: nope`);
		},
	);

	test("USER_REQUIRED is auth", () => {
		const err = redditErrorsToProviderError("reddit", [
			["USER_REQUIRED", "Please log in to do that.", ""],
		]);
		expect(err.kind).toBe("auth");
	});

	test("multiple errors are all reported", () => {
		const err = redditErrorsToProviderError("reddit", [
			["NO_SELFS", "no text posts", "sr"],
			["TOO_LONG", "title too long", "title"],
		]);
		expect(err.details.platformCode).toBe("NO_SELFS,TOO_LONG");
		expect(err.message).toContain("TOO_LONG: title too long");
	});
});

describe("settingsSchema", () => {
	test.each(["foo", "r/foo", "/r/foo", "/r/foo/", " R/foo "])("normalises %p to foo", (input) => {
		expect(normalizeSubreddit(input)).toBe("foo");
		expect(settingsSchema.parse({ subreddit: input, title: "Hello" }).subreddit).toBe("foo");
	});

	test("applies defaults and trims the title", () => {
		expect(settingsSchema.parse({ subreddit: "r/foo", title: "  Hello  " })).toEqual({
			subreddit: "foo",
			title: "Hello",
			nsfw: false,
			spoiler: false,
		});
	});

	test("rejects empty or over-long titles and bad subreddit names", () => {
		expect(settingsSchema.safeParse({ subreddit: "foo", title: "   " }).success).toBe(false);
		expect(settingsSchema.safeParse({ subreddit: "foo", title: "x".repeat(301) }).success).toBe(
			false,
		);
		expect(settingsSchema.safeParse({ subreddit: "r/", title: "Hi" }).success).toBe(false);
		expect(settingsSchema.safeParse({ subreddit: "has space", title: "Hi" }).success).toBe(false);
	});

	test("only http(s) links are accepted for link posts", () => {
		const ok = settingsSchema.safeParse({
			subreddit: "foo",
			title: "Hi",
			url: "https://example.com",
		});
		const bad = settingsSchema.safeParse({
			subreddit: "foo",
			title: "Hi",
			url: "javascript:alert(1)",
		});
		expect(ok.success).toBe(true);
		expect(bad.success).toBe(false);
	});
});
