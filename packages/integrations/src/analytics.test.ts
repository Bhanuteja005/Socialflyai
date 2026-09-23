import { describe, expect, test } from "bun:test";
import {
	addDays,
	compact,
	DayAccumulator,
	mapLimit,
	metaEndTimeToDay,
	num,
	splitRange,
	sumKnown,
	todayInRange,
} from "./analytics";

describe("splitRange", () => {
	test("a range within the limit stays one chunk", () => {
		expect(splitRange({ since: "2026-09-01", until: "2026-09-30" }, 30)).toEqual([
			{ since: "2026-09-01", until: "2026-09-30" },
		]);
	});

	test("splits into consecutive inclusive chunks of at most maxDays", () => {
		expect(splitRange({ since: "2026-01-01", until: "2026-03-05" }, 30)).toEqual([
			{ since: "2026-01-01", until: "2026-01-30" },
			{ since: "2026-01-31", until: "2026-03-01" },
			{ since: "2026-03-02", until: "2026-03-05" },
		]);
	});

	test("a single day and an inverted range", () => {
		expect(splitRange({ since: "2026-09-01", until: "2026-09-01" }, 90)).toHaveLength(1);
		expect(splitRange({ since: "2026-09-02", until: "2026-09-01" }, 90)).toEqual([]);
	});

	test("rejects malformed days", () => {
		expect(() => splitRange({ since: "2026-9-1", until: "2026-09-02" }, 30)).toThrow();
	});
});

describe("date helpers", () => {
	test("addDays crosses month and year boundaries", () => {
		expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
		expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
	});

	test("Meta end_time marks the end of the covered day", () => {
		expect(metaEndTimeToDay("2026-09-02T07:00:00+0000")).toBe("2026-09-01");
		expect(metaEndTimeToDay("2026-01-02T08:00:00+0000")).toBe("2026-01-01");
	});

	test("todayInRange", () => {
		const now = new Date("2026-09-23T12:00:00Z");
		expect(todayInRange({ since: "2026-09-01", until: "2026-09-23" }, now)).toBe("2026-09-23");
		expect(todayInRange({ since: "2026-09-01", until: "2026-09-22" }, now)).toBeUndefined();
	});
});

describe("number helpers never turn unknown into zero", () => {
	test("num", () => {
		expect(num("42")).toBe(42);
		expect(num(0)).toBe(0);
		expect(num("")).toBeUndefined();
		expect(num(null)).toBeUndefined();
		expect(num("abc")).toBeUndefined();
	});

	test("sumKnown", () => {
		expect(sumKnown(1, undefined, 2)).toBe(3);
		expect(sumKnown(undefined, undefined)).toBeUndefined();
		expect(sumKnown(0)).toBe(0);
	});

	test("compact drops undefined but keeps zero", () => {
		const compacted: Record<string, unknown> = compact({ a: 0, b: undefined });
		expect(compacted).toEqual({ a: 0 });
		expect(Object.keys(compact({ a: 0, b: undefined }))).toEqual(["a"]);
	});
});

describe("DayAccumulator", () => {
	test("merges patches per day, ignores out-of-range days and empty patches, sorts", () => {
		const days = new DayAccumulator({ since: "2026-09-01", until: "2026-09-03" });
		days.set("2026-09-02", { reach: 5 });
		days.set("2026-09-01", { impressions: 1 });
		days.set("2026-09-02", { impressions: 7, followers: undefined });
		days.set("2026-09-04", { reach: 1 });
		days.set("2026-09-03", { reach: undefined });
		expect(days.result()).toEqual([
			{ date: "2026-09-01", impressions: 1 },
			{ date: "2026-09-02", reach: 5, impressions: 7 },
		]);
	});
});

describe("mapLimit", () => {
	test("keeps order and bounds concurrency", async () => {
		let inFlight = 0;
		let peak = 0;
		const out = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => {
			inFlight++;
			peak = Math.max(peak, inFlight);
			await new Promise((r) => setTimeout(r, 5));
			inFlight--;
			return n * 10;
		});
		expect(out).toEqual([10, 20, 30, 40, 50]);
		expect(peak).toBe(2);
	});
});
