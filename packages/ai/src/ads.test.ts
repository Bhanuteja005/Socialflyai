import { describe, expect, test } from "bun:test";
import { AD_TEXT_LIMITS, removeUnsupportedClaims, writeAdCopy } from "./ads";
import { AiError } from "./errors";
import { FakeTextModel } from "./testing";
import type { BrandContext } from "./types";

const brand: BrandContext = {
	brandName: "Acme Coffee",
	description: "Small-batch coffee roaster in Leeds",
	audience: "home baristas",
	voice: "warm, nerdy about coffee",
	website: "https://acme.example",
	keywords: [],
	avoid: [],
	examplePosts: [],
};

const targeting = {
	countries: ["gb", "IE", "Europe", "gb"],
	ageMin: 12,
	ageMax: 99,
	interests: ["Coffee", "coffee", "Espresso machines"],
	keywords: ["specialty coffee beans"],
};

const variant = (over: Record<string, unknown> = {}) => ({
	primaryText: "Freshly roasted beans, delivered every month.",
	headline: "Coffee worth waking up for",
	description: "Roasted in Leeds",
	callToAction: "shop_now",
	...over,
});

const base = {
	objective: "sales" as const,
	platform: "meta_ads" as const,
	product: "Monthly coffee subscription, from £12 a month",
	destinationUrl: "https://acme.example/subscribe",
	format: "image" as const,
	variants: 2,
};

describe("writeAdCopy", () => {
	test("one call; limits enforced per platform; targeting cleaned", async () => {
		const fake = new FakeTextModel().reply({
			variants: [
				variant({ primaryText: `${"Great beans. ".repeat(20)}`, headline: "x ".repeat(40) }),
				variant(),
				variant({ primaryText: "A third one the caller did not ask for." }),
			],
			targetingSuggestions: targeting,
		});
		const result = await writeAdCopy(fake, brand, {
			...base,
			audience: "people who love espresso",
			research: {
				valueProposition: "Roasted to order",
				audience: "home baristas",
				buyerQuestions: ["How fresh are the beans?"],
			},
			sourcePost: { text: "Our autumn roast is here" },
		});

		expect(fake.requests).toHaveLength(1);
		const prompt = fake.requests[0]?.prompt ?? "";
		expect(prompt).toContain("<product>");
		expect(prompt).toContain("Monthly coffee subscription");
		expect(prompt).toContain("Meta (Facebook and Instagram) ads");
		expect(prompt).toContain("at most 125 characters");
		expect(prompt).toContain("Roasted to order");
		expect(prompt).toContain("Our autumn roast is here");
		expect(fake.requests[0]?.system).toContain("Never invent prices");
		expect(fake.requests[0]?.system).toContain("personal attribute");

		const [a, b] = result.output.variants;
		expect(result.output.variants).toHaveLength(2);
		expect([...(a?.primaryText ?? "")].length).toBeLessThanOrEqual(
			AD_TEXT_LIMITS.meta_ads.primaryText,
		);
		expect([...(a?.headline ?? "")].length).toBeLessThanOrEqual(40);
		expect(a?.headline.endsWith(" ")).toBe(false);
		expect(b).toEqual({
			primaryText: "Freshly roasted beans, delivered every month.",
			headline: "Coffee worth waking up for",
			description: "Roasted in Leeds",
			callToAction: "shop_now",
		});
		expect(result.output.targetingSuggestions).toEqual({
			countries: ["GB", "IE"],
			ageMin: 18,
			ageMax: 65,
			interests: ["Coffee", "Espresso machines"],
			keywords: ["specialty coffee beans"],
		});
		expect(result.costMicros).toBeGreaterThan(0);
	});

	test("platforms without headline or description get empty strings", async () => {
		const fake = new FakeTextModel().reply({
			variants: [variant({ primaryText: "y".repeat(300) })],
			targetingSuggestions: targeting,
		});
		const result = await writeAdCopy(fake, null, {
			...base,
			platform: "tiktok_ads",
			format: "video",
			variants: 1,
		});
		const [v] = result.output.variants;
		expect(v?.headline).toBe("");
		expect(v?.description).toBe("");
		expect([...(v?.primaryText ?? "")].length).toBeLessThanOrEqual(100);
	});

	test("invented offers and personal-attribute wording are removed", async () => {
		const fake = new FakeTextModel().reply({
			variants: [
				variant({
					primaryText:
						"Are you depressed? Our coffee helps. Subscribe from £12 a month. Get 50% off today! Satisfaction guaranteed.",
					headline: "Free shipping on every bag",
				}),
				// Nothing safe left: dropped.
				variant({ primaryText: "Save $20 now!" }),
			],
			targetingSuggestions: targeting,
		});
		const result = await writeAdCopy(fake, brand, base);
		expect(result.output.variants).toHaveLength(1);
		const [v] = result.output.variants;
		// "£12" is in the product description, so it may stay; the rest was never offered.
		expect(v?.primaryText).toBe("Our coffee helps. Subscribe from £12 a month.");
		expect(v?.headline).toBe("");
	});

	test("no usable variant → invalid_output", async () => {
		const fake = new FakeTextModel().reply({
			variants: [variant({ primaryText: "Get 90% off!" })],
			targetingSuggestions: targeting,
		});
		const error = await writeAdCopy(fake, brand, { ...base, variants: 1 }).catch((e) => e);
		expect(error).toBeInstanceOf(AiError);
		expect((error as AiError).kind).toBe("invalid_output");
	});

	test("search format: headlines and descriptions fitted, de-duplicated, minimums enforced", async () => {
		const fake = new FakeTextModel().reply({
			variants: [
				variant({
					searchHeadlines: [
						"Fresh Coffee Beans Delivered",
						"fresh coffee beans delivered",
						"Roasted In Leeds Every Week For You",
						"Coffee Subscription",
						"Try Our Espresso Blend",
					],
					searchDescriptions: [
						"Small-batch beans roasted to order and sent to your door every month.",
						"Pick your roast, grind and schedule. Pause any time.",
						"Risk-free trial for new customers.",
					],
				}),
				// Too few headlines: dropped rather than failing validation later.
				variant({ searchHeadlines: ["One", "Two"], searchDescriptions: ["A", "B"] }),
			],
			targetingSuggestions: targeting,
		});
		const result = await writeAdCopy(fake, brand, {
			...base,
			platform: "google_ads",
			format: "search",
		});
		expect(result.output.variants).toHaveLength(1);
		const [v] = result.output.variants;
		expect(v?.searchHeadlines).toHaveLength(4);
		for (const h of v?.searchHeadlines ?? []) expect([...h].length).toBeLessThanOrEqual(30);
		// The unsupported "risk-free" description is emptied and not kept.
		expect(v?.searchDescriptions).toEqual([
			"Small-batch beans roasted to order and sent to your door every month.",
			"Pick your roast, grind and schedule. Pause any time.",
		]);
		expect(fake.requests[0]?.prompt).toContain("searchHeadlines");
	});
});

describe("removeUnsupportedClaims", () => {
	test("keeps claims the source states, drops the rest", () => {
		const source = "Plans from $49.99 a month. 30-day money-back guarantee.";
		expect(removeUnsupportedClaims("Plans from $49.99 a month. Now 20% off.", source)).toBe(
			"Plans from $49.99 a month.",
		);
		expect(removeUnsupportedClaims("Backed by our money-back guarantee.", source)).toBe(
			"Backed by our money-back guarantee.",
		);
		expect(removeUnsupportedClaims("Stress-free planning. Kick off today.", "")).toBe(
			"Stress-free planning. Kick off today.",
		);
		expect(removeUnsupportedClaims("We are #1 in Leeds.", "")).toBe("");
	});
});
