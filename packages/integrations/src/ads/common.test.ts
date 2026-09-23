import { describe, expect, test } from "bun:test";
import {
	currencyDigits,
	formatScaled,
	fromMicros,
	toMicros,
	toScaledInteger,
	validateDraftBasics,
} from "./common";
import type { CampaignDraft } from "./types";

describe("money", () => {
	test("scaling is exact where naive float math is not", () => {
		// 0.29 * 100 = 28.999999999999996 in floating point.
		expect(toScaledInteger(0.29, 2)).toBe(29);
		expect(toScaledInteger(25.5, 2)).toBe(2550);
		expect(toScaledInteger(1234.56, 2)).toBe(123456);
	});

	test("more precision than the currency allows is rejected, not rounded", () => {
		expect(toScaledInteger(25.555, 2)).toBeNull();
		expect(toScaledInteger(100.5, 0)).toBeNull();
		expect(toScaledInteger(Number.NaN, 2)).toBeNull();
	});

	test("micros go through cents", () => {
		expect(toMicros(25.5)).toBe("25500000");
		expect(toMicros(0.29)).toBe("290000");
		expect(toMicros(1_000_000)).toBe("1000000000000");
		expect(toMicros(1.001)).toBeNull();
		expect(fromMicros("12340000")).toBe(12.34);
		expect(fromMicros(undefined)).toBe(0);
	});

	test("formatting from integers", () => {
		expect(formatScaled(2550, 2)).toBe("25.50");
		expect(formatScaled(5, 2)).toBe("0.05");
		expect(formatScaled(1000, 0)).toBe("1000");
		expect(currencyDigits("JPY")).toBe(0);
		expect(currencyDigits("USD")).toBe(2);
		expect(currencyDigits("nope")).toBeNull();
	});
});

describe("validateDraftBasics", () => {
	const caps = {
		objectives: ["traffic" as const],
		formats: ["image" as const],
		minDailyBudgetUsd: 1,
		maxAdsPerCampaign: 2,
		textLimits: { primaryText: 10 },
	};
	const draft = (over: Partial<CampaignDraft> = {}): CampaignDraft => ({
		name: "C",
		objective: "traffic",
		dailyBudget: 10,
		startAt: "2026-10-01T00:00:00.000Z",
		endAt: null,
		targeting: { countries: ["US"] },
		ads: [
			{
				name: "a",
				format: "image",
				primaryText: "hi",
				destinationUrl: "https://x.test",
				media: [],
			},
		],
		...over,
	});
	const run = (d: CampaignDraft, currency = "USD") =>
		validateDraftBasics(
			d,
			{ currency },
			{
				platform: "P",
				capabilities: caps,
				lifetimeBudget: true,
				minDaily: { USD: 5 },
				unsupportedTargeting: ["interests"],
			},
		);

	test("a valid draft has no errors", () => {
		expect(run(draft())).toEqual([]);
	});

	test("budget rules", () => {
		expect(run(draft({ lifetimeBudget: 5 }))).toContain(
			"Set exactly one of a daily or a lifetime budget",
		);
		expect(run(draft({ dailyBudget: 4 }))).toContain("P requires a daily budget of at least 5 USD");
		expect(run(draft({ dailyBudget: 10.001 }))).toContain(
			"P budgets in USD allow at most 2 decimal places",
		);
		expect(run(draft({ dailyBudget: 10.5 }), "JPY")).toContain(
			"P budgets in JPY must be whole amounts",
		);
		expect(run(draft({ dailyBudget: undefined, lifetimeBudget: 100 }))).toContain(
			"A lifetime budget needs an end date",
		);
	});

	test("targeting, ads and text", () => {
		const errors = run(
			draft({
				targeting: { countries: [], interests: [{ id: "1", name: "x", type: "interest" }] },
				ads: [
					{
						name: "a",
						format: "video",
						primaryText: "far too long",
						destinationUrl: "ftp://x",
						media: [],
					},
					{
						name: "b",
						format: "image",
						primaryText: "ok",
						destinationUrl: "https://x.test",
						media: [],
					},
					{
						name: "c",
						format: "image",
						primaryText: "ok",
						destinationUrl: "https://x.test",
						media: [],
					},
				],
			}),
		);
		expect(errors).toContain("Target at least one country");
		expect(errors).toContain("P interest targeting is not supported yet — remove it to continue");
		expect(errors).toContain("P allows at most 2 ads per campaign");
		expect(errors).toContain('Ad 1: P does not support the "video" format here');
		expect(errors).toContain("Ad 1: The destination must be an http(s) URL");
		expect(errors).toContain("Ad 1: P limits the main text to 10 characters");
	});
});
