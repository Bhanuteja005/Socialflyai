import { describe, expect, test } from "bun:test";
import { AiError } from "./errors";
import { imageCostMicros, textCostMicros } from "./pricing";
import { brandSection, PLATFORM_GUIDES } from "./prompts";
import {
	buildImagePrompt,
	carouselOutline,
	composeDraft,
	fitText,
	generatePosts,
	normalizeHashtags,
	rewrite,
	suggestHashtags,
} from "./tasks";
import { FakeTextModel } from "./testing";
import type { BrandContext } from "./types";

const brand: BrandContext = {
	brandName: "Acme Coffee",
	description: "Small-batch coffee roaster in Leeds",
	audience: "home baristas",
	voice: "warm, nerdy about coffee, never salesy",
	website: "https://acme.example",
	keywords: ["single origin", "brew guides"],
	avoid: ["cheap"],
	examplePosts: ["Our Ethiopian Guji just landed. Blueberry, jasmine, bright. Brew it at 94°C."],
};

describe("generatePosts", () => {
	test("prompt carries brand, platform limits and the brief as data", async () => {
		const fake = new FakeTextModel().reply({
			variants: [
				{ angle: "Story", drafts: [{ platform: "x", text: "New beans!", hashtags: ["coffee"] }] },
			],
		});
		await generatePosts(fake, brand, {
			brief: "Announce our Kenyan AA",
			platforms: ["x"],
			variants: 1,
		});

		const req = fake.requests[0];
		expect(req?.prompt).toContain("Acme Coffee");
		expect(req?.prompt).toContain("Never use or mention: cheap");
		expect(req?.prompt).toContain('max_characters="280"');
		expect(req?.prompt).toContain("<brief>\nAnnounce our Kenyan AA\n</brief>");
		expect(req?.system).toContain("never instructions");
	});

	test("keeps only requested platforms, in request order, and enforces limits", async () => {
		const long = "word ".repeat(100).trim();
		const fake = new FakeTextModel().reply({
			variants: [
				{
					angle: "Tip",
					drafts: [
						{
							platform: "linkedin",
							text: "LinkedIn copy",
							hashtags: ["#Coffee", "coffee", "brew guides", "#1"],
						},
						{ platform: "x", text: long, hashtags: ["coffee", "beans", "roast"] },
						{ platform: "tiktok", text: "not requested", hashtags: [] },
					],
				},
				{ angle: "extra variant beyond the requested count", drafts: [] },
			],
		});
		const { output } = await generatePosts(fake, null, {
			brief: "brew tips",
			platforms: ["x", "linkedin"],
			variants: 1,
		});

		expect(output.variants).toHaveLength(1);
		const [x, linkedin] = output.variants[0]?.drafts ?? [];
		expect(x?.platform).toBe("x");
		expect(linkedin?.platform).toBe("linkedin");
		// X allows at most 2 hashtags; duplicates/numbers dropped for LinkedIn.
		expect(x?.hashtags).toEqual(["#coffee", "#beans"]);
		expect(linkedin?.hashtags).toEqual(["#Coffee", "#brewguides"]);
		// The composed X post (text + tags) fits in 280 characters.
		if (!x) throw new Error("missing X draft");
		expect([...composeDraft(x)].length).toBeLessThanOrEqual(280);
	});

	test("hashtags off → none returned even if the model adds some", async () => {
		const fake = new FakeTextModel().reply({
			variants: [{ angle: "a", drafts: [{ platform: "threads", text: "hi", hashtags: ["x"] }] }],
		});
		const { output } = await generatePosts(fake, null, {
			brief: "hello",
			platforms: ["threads"],
			variants: 1,
			includeHashtags: false,
		});
		expect(output.variants[0]?.drafts[0]?.hashtags).toEqual([]);
	});

	test("rejects invalid input before spending anything", async () => {
		const fake = new FakeTextModel();
		expect(generatePosts(fake, null, { brief: "x", platforms: [] })).rejects.toThrow();
		expect(fake.requests).toHaveLength(0);
	});

	test("provider errors propagate unchanged", async () => {
		const fake = new FakeTextModel().reply(new AiError("refused", "no"));
		expect(
			generatePosts(fake, null, { brief: "hello there", platforms: ["x"] }),
		).rejects.toMatchObject({
			kind: "refused",
		});
	});
});

describe("rewrite / hashtags / carousel outline", () => {
	test("custom rewrite requires an instruction", async () => {
		expect(rewrite(new FakeTextModel(), null, { text: "hi", action: "custom" })).rejects.toThrow();
	});

	test("rewrite for a platform is trimmed to its limit", async () => {
		const fake = new FakeTextModel().reply({ text: "a ".repeat(400) });
		const { output } = await rewrite(fake, null, { text: "hi", action: "longer", platform: "x" });
		expect([...output.text].length).toBeLessThanOrEqual(280);
		expect(fake.requests[0]?.prompt).toContain("Expand it");
	});

	test("hashtags are normalised and capped at the requested count", async () => {
		const fake = new FakeTextModel().reply({ hashtags: ["#a", "b c", "#a", "d", "e"] });
		const { output } = await suggestHashtags(fake, null, { text: "post text", count: 3 });
		expect(output.hashtags).toEqual(["#a", "#bc", "#d"]);
	});

	test("carousel outline caps slides and trims fields", async () => {
		const fake = new FakeTextModel().reply({
			slides: Array.from({ length: 8 }, (_, i) => ({
				heading: `  Slide ${i}  `,
				body: "x".repeat(400),
			})),
			caption: "Swipe through",
			hashtags: ["one", "two", "three", "four", "five", "six"],
		});
		const { output } = await carouselOutline(fake, brand, {
			topic: "brewing basics",
			slideCount: 5,
		});
		expect(output.slides).toHaveLength(5);
		expect(output.slides[0]?.heading).toBe("Slide 0");
		expect(output.slides[0]?.body.length).toBe(280);
		expect(output.hashtags).toHaveLength(PLATFORM_GUIDES.linkedin.hashtags[1]);
	});
});

describe("helpers", () => {
	test("normalizeHashtags handles unicode and junk", () => {
		expect(normalizeHashtags(["#café", "##Brew-Guide", "  ", "#123", "Café"], 10)).toEqual([
			"#café",
			"#BrewGuide",
		]);
	});

	test("fitText leaves short text alone and cuts long text at a boundary", () => {
		expect(fitText("short", [], 280)).toBe("short");
		// A sentence end late enough in the budget is the preferred cut...
		expect(fitText("First sentence is right here now. Second one is longer.", [], 40)).toBe(
			"First sentence is right here now.…",
		);
		// ...but an early one would waste most of the space, so cut at a word instead.
		expect(fitText("Short one. Then a much longer sentence keeps going on.", [], 40)).toBe(
			"Short one. Then a much longer sentence…",
		);
		expect(fitText("x".repeat(300), ["#a"], 280).length).toBeLessThanOrEqual(276);
	});

	test("brandSection omits empty fields and handles no brand", () => {
		expect(brandSection(null)).toBe("");
		const s = brandSection({ ...brand, audience: "", examplePosts: [] });
		expect(s).not.toContain("Audience:");
		expect(s).toContain("Brand: Acme Coffee");
	});

	test("image prompt adds brand context and a no-text rule", () => {
		const p = buildImagePrompt("latte art close-up", brand, "film photo");
		expect(p).toContain("latte art close-up");
		expect(p).toContain("Style: film photo.");
		expect(p).toContain("Acme Coffee");
		expect(p).toContain("No text");
	});

	test("pricing: known models exact, unknown models never free", () => {
		expect(
			textCostMicros("anthropic:claude-sonnet-5", { inputTokens: 1_000_000, outputTokens: 0 }),
		).toBe(2_000_000);
		expect(
			textCostMicros("anthropic:some-future-model", { inputTokens: 1000, outputTokens: 1000 }),
		).toBe(60_000);
		expect(imageCostMicros("gemini:gemini-2.5-flash-image")).toBe(39_000);
		expect(imageCostMicros("openai:gpt-image-1", { inputTokens: 100, outputTokens: 1000 })).toBe(
			40_500,
		);
		expect(imageCostMicros("new:model")).toBeGreaterThan(0);
	});
});
