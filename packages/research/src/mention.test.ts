import { describe, expect, test } from "bun:test";
import { analyzeMention, type MentionTarget } from "./mention";

type Brand = { name: string; aliases: string[]; domain: string | null };
const brand: Brand = { name: "Acme", aliases: ["Acme Social"], domain: "acme.io" };
const competitors: MentionTarget[] = [
	{ id: "c-hub", name: "HubSpot", aliases: [], domain: "https://www.hubspot.com" },
	{ id: "c-buf", name: "Buffer", aliases: [], domain: "buffer.com" },
	{ id: "c-sprout", name: "Sprout Social", aliases: ["Sprout"], domain: "sproutsocial.com" },
];

const run = (answer: string, citations: string[] = [], b: Brand = brand, c = competitors) =>
	analyzeMention(
		answer,
		citations.map((url) => ({ url })),
		b,
		c,
	);

describe("analyzeMention", () => {
	test("ranks by first appearance among brand and competitors", () => {
		const r = run("Top picks: 1. HubSpot 2. Acme 3. Buffer. HubSpot again, and Acme.");
		expect(r.brandMentioned).toBe(true);
		expect(r.brandRank).toBe(2);
		expect(r.competitorsMentioned).toEqual(["c-hub", "c-buf"]);
	});

	test("whole words only, with possessives and punctuation", () => {
		expect(run("Acme's scheduler is fast.").brandRank).toBe(1);
		expect(run("Acme’s scheduler (curly apostrophe)").brandMentioned).toBe(true);
		expect(run("Try (Acme), it works").brandMentioned).toBe(true);
		expect(run("Acme-based teams").brandMentioned).toBe(true);
		expect(run("The Acmeist movement and acmes").brandMentioned).toBe(false);
		expect(run("Visit acme.io today").brandMentioned).toBe(true);
	});

	test("a single Title-case name that is also a word needs a capital", () => {
		expect(run("Keep a buffer of time between posts.").competitorsMentioned).toEqual([]);
		expect(run("Buffer is a solid pick.").competitorsMentioned).toEqual(["c-buf"]);
		expect(run("BUFFER is a solid pick.").competitorsMentioned).toEqual(["c-buf"]);
		// Distinctive names match in any case.
		expect(run("many teams use hubspot").competitorsMentioned).toEqual(["c-hub"]);
		expect(run("acme social handles scheduling").brandMentioned).toBe(true);
		// A lowercase alias opts in to case-insensitive matching.
		const lower = run("keep a buffer handy", [], brand, [
			{ id: "c-buf", name: "Buffer", aliases: ["buffer"], domain: null },
		]);
		expect(lower.competitorsMentioned).toEqual(["c-buf"]);
	});

	test("overlapping names: the longest match wins", () => {
		const shared = { name: "Sprout", aliases: [], domain: null };
		// Brand "Sprout" vs competitor "Sprout Social": the competitor owns those words.
		const r = run("Sprout Social is popular.", [], shared, competitors);
		expect(r.brandMentioned).toBe(false);
		expect(r.competitorsMentioned).toEqual(["c-sprout"]);
		const both = run("Sprout Social and Sprout are different.", [], shared, [
			{ id: "c-sprout", name: "Sprout Social", aliases: [], domain: null },
		]);
		expect(both.brandMentioned).toBe(true);
		expect(both.brandRank).toBe(2);
		// Flexible separators inside a name.
		expect(run("Sprout-Social is popular.").competitorsMentioned).toEqual(["c-sprout"]);
	});

	test("unicode: accents fold, non-Latin names and boundaries work", () => {
		const cafe = { name: "Café Noir", aliases: [], domain: null };
		expect(run("Try Cafe Noir or café noir", [], cafe, []).brandMentioned).toBe(true);
		const jp = { name: "メルカリ", aliases: [], domain: null };
		// Japanese has no spaces between words: no boundary is required.
		expect(run("おすすめはメルカリです", [], jp, []).brandMentioned).toBe(true);
		const ru = { name: "Яндекс", aliases: [], domain: null };
		expect(run("Яндекс и Яндексом", [], ru, []).brandRank).toBe(1);
	});

	test("citations: domains, own site (subdomains too), competitor ownership", () => {
		const r = run("No names here.", [
			"https://docs.acme.io/guide",
			"https://www.hubspot.com/blog/x",
			"https://blog.example.co.uk/post",
			"https://docs.acme.io/guide",
			"not a url",
		]);
		expect(r.brandMentioned).toBe(true); // cited even though not named
		expect(r.brandRank).toBeNull();
		expect(r.competitorsMentioned).toEqual(["c-hub"]);
		expect(r.citations).toEqual([
			{ url: "https://docs.acme.io/guide", domain: "acme.io", own: true },
			{
				url: "https://www.hubspot.com/blog/x",
				domain: "hubspot.com",
				own: false,
				competitorId: "c-hub",
			},
			{ url: "https://blog.example.co.uk/post", domain: "example.co.uk", own: false },
		]);
	});

	test("a lookalike domain is not the brand's", () => {
		const r = run("", ["https://notacme.io/", "https://acme.io.evil.com/"]);
		expect(r.brandMentioned).toBe(false);
		expect(r.citations.every((c) => !c.own)).toBe(true);
	});

	test("nothing mentioned", () => {
		expect(run("Consider a spreadsheet.")).toEqual({
			brandMentioned: false,
			brandRank: null,
			competitorsMentioned: [],
			citations: [],
		});
	});
});
