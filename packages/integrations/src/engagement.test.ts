import { describe, expect, test } from "bun:test";
import {
	checkReplyText,
	decodeEntities,
	finalizeItems,
	htmlToText,
	isNewer,
	toIso,
	xWeightedLength,
} from "./engagement";

describe("text normalisation", () => {
	test("decodes named and numeric entities, leaves unknown ones alone", () => {
		expect(
			decodeEntities("Tom &amp; Jerry &lt;3 &quot;hi&quot; &#39;x&#39; &#x1F600; &bogus;"),
		).toBe("Tom & Jerry <3 \"hi\" 'x' 😀 &bogus;");
	});

	test("HTML fragments become plain text with line breaks", () => {
		expect(htmlToText("<p>Hello <b>there</b></p><p>line<br/>two &amp; more</p>")).toBe(
			"Hello there\n\nline\ntwo & more",
		);
	});
});

describe("X weighted length", () => {
	test("latin counts 1, CJK and emoji 2, every URL 23", () => {
		expect(xWeightedLength("hello")).toBe(5);
		expect(xWeightedLength("日本")).toBe(4);
		expect(xWeightedLength("👍")).toBe(2);
		expect(xWeightedLength(`see https://example.com/${"a".repeat(80)} now`)).toBe(4 + 23 + 4);
	});
});

describe("since / ordering", () => {
	const item = (externalId: string, createdAt: string) => ({ externalId, createdAt });

	test("strictly newer than since; null since keeps everything", () => {
		expect(isNewer("2026-09-01T10:00:00.000Z", "2026-09-01T10:00:00.000Z")).toBe(false);
		expect(isNewer("2026-09-01T10:00:01.000Z", "2026-09-01T10:00:00.000Z")).toBe(true);
		expect(isNewer("2020-01-01T00:00:00.000Z", null)).toBe(true);
	});

	test("filters, dedupes and sorts oldest first whatever the input order", () => {
		const out = finalizeItems(
			[
				item("c", "2026-09-03T00:00:00.000Z"),
				item("a", "2026-09-01T00:00:00.000Z"),
				item("b", "2026-09-02T00:00:00.000Z"),
				item("c", "2026-09-03T00:00:00.000Z"),
			],
			"2026-09-01T00:00:00.000Z",
		);
		expect(out.map((i) => i.externalId)).toEqual(["b", "c"]);
	});

	test("toIso accepts ISO strings, Graph's +0000 offsets and epoch ms", () => {
		expect(toIso("2026-09-01T10:00:00+0000")).toBe("2026-09-01T10:00:00.000Z");
		expect(toIso(1_788_000_000_000)).toBe(new Date(1_788_000_000_000).toISOString());
		expect(toIso("not a date")).toBeNull();
		expect(toIso(undefined)).toBeNull();
	});
});

describe("checkReplyText", () => {
	test("trims, rejects empty and too long as invalid_request", () => {
		expect(checkReplyText("x", "  hi  ", 10)).toBe("hi");
		expect(() => checkReplyText("x", "   ", 10)).toThrow(
			expect.objectContaining({ kind: "invalid_request" }),
		);
		expect(() => checkReplyText("x", "a".repeat(11), 10)).toThrow(
			expect.objectContaining({ kind: "invalid_request" }),
		);
		// Code points, not UTF-16 units: 10 emoji fit a 10-char limit.
		expect(checkReplyText("x", "😀".repeat(10), 10)).toHaveLength(20);
	});
});
