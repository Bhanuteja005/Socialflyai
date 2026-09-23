import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import type { AiError } from "@socialfly/ai";
import { createDataForSeo, DataForSeo } from "./seo";
import { FakeDataForSeo } from "./testing";

/** DataForSEO against a local stand-in: request shape, auth, cost and status handling. */

type Captured = { path: string; auth: string | null; body: Record<string, unknown>[] };
let captured: Captured[] = [];
let handler: (path: string, task: Record<string, unknown>) => Response = () =>
	new Response("unset", { status: 500 });

const server = Bun.serve({
	port: 0,
	async fetch(req) {
		const path = new URL(req.url).pathname;
		const body = (await req.json()) as Record<string, unknown>[];
		captured.push({ path, auth: req.headers.get("authorization"), body });
		return handler(path, body[0] ?? {});
	},
});
afterAll(() => server.stop(true));
beforeEach(() => {
	captured = [];
});

const envelope = (result: unknown[], cost: number, taskStatus = 20000) =>
	Response.json({
		version: "0.1.20260901",
		status_code: 20000,
		status_message: "Ok.",
		time: "0.5 sec.",
		cost,
		tasks_count: 1,
		tasks_error: taskStatus === 20000 ? 0 : 1,
		tasks: [
			{
				id: "t1",
				status_code: taskStatus,
				status_message: taskStatus === 20000 ? "Ok." : "Invalid Field: 'location_code'.",
				cost,
				result_count: result.length,
				result: taskStatus === 20000 ? result : null,
			},
		],
	});

const seo = new DataForSeo({ login: "me@x.com", password: "pw", baseURL: server.url.origin });
const locale = { locationCode: 2840, languageCode: "en" };

describe("DataForSeo", () => {
	test("keywordMetrics: volume/CPC from Google Ads + difficulty from Labs; Basic auth; costs add up", async () => {
		handler = (path) =>
			path.includes("search_volume")
				? envelope(
						[
							{
								keyword: "social media scheduler",
								search_volume: 5400,
								cpc: 12.5,
								competition_index: 80,
							},
							{ keyword: "dental marketing", search_volume: null, cpc: null },
						],
						0.075,
					)
				: envelope(
						[
							{
								se_type: "google",
								items_count: 2,
								items: [
									{ keyword: "social media scheduler", keyword_difficulty: 67 },
									{ keyword: "dental marketing", keyword_difficulty: 30 },
								],
							},
						],
						0.0101,
					);

		const longKeyword = "one two three four five six seven eight nine ten eleven";
		const result = await seo.keywordMetrics(
			["Social Media  Scheduler", "dental marketing", "social media scheduler", longKeyword],
			locale,
		);

		expect(result.items).toEqual([
			{ keyword: "social media scheduler", searchVolume: 5400, difficulty: 67, cpcUsd: 12.5 },
			{ keyword: "dental marketing", searchVolume: null, difficulty: 30, cpcUsd: null },
			{ keyword: longKeyword, searchVolume: null, difficulty: null, cpcUsd: null },
		]);
		expect(result.costMicros).toBe(75_000 + 10_100);

		expect(captured.map((c) => c.path)).toEqual([
			"/v3/keywords_data/google_ads/search_volume/live",
			"/v3/dataforseo_labs/google/bulk_keyword_difficulty/live",
		]);
		expect(captured[0]?.auth).toBe(`Basic ${btoa("me@x.com:pw")}`);
		// Google Ads rejects phrases over 10 words — never sent there.
		expect(captured[0]?.body).toEqual([
			{
				keywords: ["social media scheduler", "dental marketing"],
				location_code: 2840,
				language_code: "en",
			},
		]);
		expect(((captured[1]?.body[0]?.keywords ?? []) as string[]).length).toBe(3);
	});

	test("keywordMetrics batches at 1,000 keywords per request", async () => {
		handler = () => envelope([], 0.01);
		const many = Array.from({ length: 1_500 }, (_, i) => `keyword ${i}`);
		await seo.keywordMetrics(many, locale);
		expect(captured.map((c) => ((c.body[0]?.keywords ?? []) as string[]).length)).toEqual([
			1_000, 500, 1_000, 500,
		]);
	});

	test("keywordIdeas reads Labs items", async () => {
		handler = () =>
			envelope(
				[
					{
						items: [
							{
								keyword: "instagram scheduler",
								keyword_info: { search_volume: 880, cpc: 3.2 },
								keyword_properties: { keyword_difficulty: 41 },
							},
							{ keyword: "Instagram Scheduler", keyword_info: null, keyword_properties: null },
							{ keyword: "free scheduler", keyword_info: { search_volume: 90, cpc: null } },
						],
					},
				],
				0.0103,
			);
		const result = await seo.keywordIdeas(["social media scheduler"], { ...locale, limit: 50 });
		expect(result.items).toEqual([
			{ keyword: "instagram scheduler", searchVolume: 880, difficulty: 41, cpcUsd: 3.2 },
			{ keyword: "free scheduler", searchVolume: 90, difficulty: null, cpcUsd: null },
		]);
		expect(result.costMicros).toBe(10_300);
		expect(captured[0]?.path).toBe("/v3/dataforseo_labs/google/keyword_ideas/live");
		expect(captured[0]?.body[0]).toEqual({
			keywords: ["social media scheduler"],
			location_code: 2840,
			language_code: "en",
			limit: 50,
		});
	});

	test("serpPosition finds the best organic rank for the domain, subdomains included", async () => {
		handler = () =>
			envelope(
				[
					{
						items: [
							{ type: "paid", rank_group: 1, domain: "acme.io", url: "https://acme.io/ad" },
							{
								type: "organic",
								rank_group: 1,
								domain: "hubspot.com",
								url: "https://hubspot.com/",
							},
							{
								type: "organic",
								rank_group: 4,
								domain: "blog.acme.io",
								url: "https://blog.acme.io/x",
							},
							{ type: "organic", rank_group: 7, domain: "acme.io", url: "https://acme.io/y" },
							{ type: "organic", rank_group: 2, domain: "notacme.io", url: "https://notacme.io/" },
						],
					},
				],
				0.004,
			);
		const result = await seo.serpPosition("Social Media Scheduler", "https://www.acme.io", locale);
		expect(result).toEqual({ position: 4, url: "https://blog.acme.io/x", costMicros: 4_000 });
		expect(captured[0]?.path).toBe("/v3/serp/google/organic/live/advanced");
		expect(captured[0]?.body[0]).toMatchObject({ keyword: "social media scheduler", depth: 20 });

		handler = () => envelope([{ items: [] }], 0.002);
		expect((await seo.serpPosition("x", "acme.io", locale)).position).toBeNull();
	});

	test("status codes inside the JSON become AiError kinds", async () => {
		const failWith = (code: number) => () =>
			Response.json({ status_code: code, status_message: "nope", cost: 0, tasks: [] });
		const kind = async () =>
			((await seo.serpPosition("x", "acme.io", locale).catch((e) => e)) as AiError).kind;

		handler = failWith(40100);
		expect(await kind()).toBe("not_configured");
		handler = failWith(40210);
		expect(await kind()).toBe("not_configured");
		handler = failWith(40202);
		expect(await kind()).toBe("rate_limited");
		handler = failWith(50301);
		expect(await kind()).toBe("transient");
		// A task-level failure inside an OK envelope.
		handler = () => envelope([], 0, 40501);
		expect(await kind()).toBe("invalid_request");
		// A plain HTTP error with no JSON body.
		handler = () => new Response("gateway", { status: 502 });
		expect(await kind()).toBe("transient");
	});

	test("createDataForSeo needs both credentials", () => {
		expect(createDataForSeo({ DATAFORSEO_LOGIN: "", DATAFORSEO_PASSWORD: "x" })).toBeNull();
		expect(createDataForSeo({ DATAFORSEO_LOGIN: "a", DATAFORSEO_PASSWORD: "b" })).toBeInstanceOf(
			DataForSeo,
		);
	});
});

describe("FakeDataForSeo", () => {
	test("serves configured metrics and queued answers, records calls", async () => {
		const fake = new FakeDataForSeo()
			.setMetric("Dental Marketing", { searchVolume: 100, difficulty: 20, cpcUsd: 1 })
			.replyPosition(3, "https://acme.io/");
		const metrics = await fake.keywordMetrics(["dental marketing", "other"], locale);
		expect(metrics.items[0]).toEqual({
			keyword: "dental marketing",
			searchVolume: 100,
			difficulty: 20,
			cpcUsd: 1,
		});
		expect(metrics.items[1]?.searchVolume).toBeNull();
		expect((await fake.serpPosition("k", "acme.io", locale)).position).toBe(3);
		fake.failNext();
		expect(await fake.keywordIdeas(["x"], locale).catch((e) => e.kind)).toBe("transient");
		expect(fake.calls.map((c) => c.method)).toEqual([
			"keywordMetrics",
			"serpPosition",
			"keywordIdeas",
		]);
	});
});
