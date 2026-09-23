import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import type { AiError } from "@socialfly/ai";
import {
	ClaudeVisibilityEngine,
	GeminiVisibilityEngine,
	OpenAiVisibilityEngine,
	PerplexityVisibilityEngine,
	perplexityTarget,
} from "./engines";
import { createVisibilityEngines } from "./visibility";

/**
 * Each engine against a local stand-in for its provider's API: proves what goes on
 * the wire (model, auth, web search enabled) and how answers, citations, costs and
 * failures come back. No network, no keys.
 */

type Captured = { method: string; path: string; headers: Headers; body: Record<string, unknown> };
let captured: Captured[] = [];
let responses: (() => Response)[] = [];

const server = Bun.serve({
	port: 0,
	async fetch(req) {
		const url = new URL(req.url);
		const text = await req.text();
		captured.push({
			method: req.method,
			path: url.pathname,
			headers: req.headers,
			body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
		});
		const next = responses.length > 1 ? responses.shift() : responses[0];
		return next ? next() : new Response("unset", { status: 500 });
	},
});
afterAll(() => server.stop(true));
const origin = server.url.origin;

beforeEach(() => {
	captured = [];
	responses = [];
});
const respond = (...fns: (() => Response)[]) => {
	responses = fns;
};
const kindOf = async (p: Promise<unknown>) => ((await p.catch((e) => e)) as AiError).kind;

// ── Claude ──

const claudeMessage = (over: Record<string, unknown>) =>
	Response.json({
		id: "msg_1",
		type: "message",
		role: "assistant",
		model: "claude-opus-5",
		content: [],
		stop_reason: "end_turn",
		stop_sequence: null,
		usage: {
			input_tokens: 10_000,
			output_tokens: 800,
			server_tool_use: { web_search_requests: 2, web_fetch_requests: 0 },
		},
		...over,
	});

const searchBlocks = [
	{ type: "text", text: "Let me search.", citations: null },
	{ type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "best tools" } },
	{
		type: "web_search_tool_result",
		tool_use_id: "srvtoolu_1",
		content: [
			{
				type: "web_search_result",
				url: "https://acme.io/",
				title: "Acme",
				encrypted_content: "x",
				page_age: null,
			},
		],
	},
];
const cite = (url: string, title: string) => ({
	type: "web_search_result_location",
	url,
	title,
	cited_text: "…",
	encrypted_index: "e",
});

describe("ClaudeVisibilityEngine", () => {
	const engine = new ClaudeVisibilityEngine({
		apiKey: "test-key",
		model: "claude-opus-5",
		baseURL: origin,
	});

	test("asks with web search, fallbacks and adaptive thinking; returns answer, citations, cost", async () => {
		respond(() =>
			claudeMessage({
				content: [
					...searchBlocks,
					{ type: "text", text: "The best options are ", citations: null },
					{
						type: "text",
						text: "Acme",
						citations: [cite("https://acme.io/", "Acme"), cite("https://acme.io/", "Acme")],
					},
					{ type: "text", text: " and HubSpot.", citations: [cite("https://hubspot.com/x", "HS")] },
				],
			}),
		);
		const result = await engine.ask("What is the best social media scheduler?");

		expect(result.answer).toBe("The best options are Acme and HubSpot.");
		expect(result.citations).toEqual([
			{ url: "https://acme.io/", title: "Acme" },
			{ url: "https://hubspot.com/x", title: "HS" },
		]);
		expect(result.model).toBe("anthropic:claude-opus-5");
		// 10k in × $5 + 800 out × $25 + 2 searches × $0.01.
		expect(result.costMicros).toBe(50_000 + 20_000 + 20_000);

		const sent = captured[0];
		expect(sent?.path).toBe("/v1/messages");
		expect(sent?.headers.get("x-api-key")).toBe("test-key");
		expect(sent?.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
		expect(sent?.body).toMatchObject({
			model: "claude-opus-5",
			fallbacks: "default",
			thinking: { type: "adaptive" },
			tools: [{ type: "web_search_20260209", name: "web_search" }],
			messages: [{ role: "user", content: "What is the best social media scheduler?" }],
		});
		expect(sent?.body.system).toBeUndefined();
	});

	test("resumes a pause_turn by sending the paused content back, and sums usage", async () => {
		respond(
			() => claudeMessage({ stop_reason: "pause_turn", content: searchBlocks }),
			() =>
				claudeMessage({
					content: [{ type: "text", text: "Acme is good.", citations: null }],
					usage: { input_tokens: 1_000, output_tokens: 100, server_tool_use: null },
				}),
		);
		const result = await engine.ask("q");
		expect(result.answer).toBe("Acme is good.");
		expect(captured).toHaveLength(2);
		const resumed = captured[1]?.body.messages as { role: string; content: unknown }[];
		expect(resumed).toHaveLength(2);
		expect(resumed[1]?.role).toBe("assistant");
		expect(((resumed[1]?.content ?? []) as unknown[]).length).toBe(searchBlocks.length);
		// (10k + 1k) × $5 + (800 + 100) × $25 + 2 searches.
		expect(result.costMicros).toBe(55_000 + 22_500 + 20_000);
	});

	test("bills the model that actually answered", async () => {
		respond(() =>
			claudeMessage({
				model: "claude-opus-4-8",
				content: [{ type: "text", text: "ok", citations: null }],
			}),
		);
		expect((await engine.ask("q")).model).toBe("anthropic:claude-opus-4-8");
	});

	test("search errors arrive inside the result; with no answer they become AiErrors", async () => {
		respond(() =>
			claudeMessage({
				content: [
					searchBlocks[1],
					{
						type: "web_search_tool_result",
						tool_use_id: "srvtoolu_1",
						content: { type: "web_search_tool_result_error", error_code: "too_many_requests" },
					},
				],
			}),
		);
		expect(await kindOf(engine.ask("q"))).toBe("rate_limited");
	});

	test("refusal, bad key and bad request map to AiError kinds", async () => {
		respond(() => claudeMessage({ stop_reason: "refusal", content: [] }));
		expect(await kindOf(engine.ask("q"))).toBe("refused");

		respond(() =>
			Response.json(
				{ type: "error", error: { type: "authentication_error", message: "bad key" } },
				{ status: 401 },
			),
		);
		expect(await kindOf(engine.ask("q"))).toBe("not_configured");

		respond(() =>
			Response.json(
				{ type: "error", error: { type: "invalid_request_error", message: "nope" } },
				{ status: 400 },
			),
		);
		expect(await kindOf(engine.ask("q"))).toBe("invalid_request");
	});
});

// ── ChatGPT ──

const openAiResponse = (over: Record<string, unknown>) =>
	Response.json({
		id: "resp_1",
		object: "response",
		created_at: 1,
		status: "completed",
		model: "gpt-6-astra",
		output: [],
		usage: {
			input_tokens: 2_000,
			output_tokens: 500,
			total_tokens: 2_500,
			input_tokens_details: { cached_tokens: 0 },
			output_tokens_details: { reasoning_tokens: 0 },
		},
		...over,
	});

describe("OpenAiVisibilityEngine", () => {
	const engine = new OpenAiVisibilityEngine({
		apiKey: "sk-test",
		model: "gpt-6-astra",
		baseURL: `${origin}/v1`,
	});

	test("uses the Responses API with web_search; reads text and url citations", async () => {
		respond(() =>
			openAiResponse({
				output: [
					{ type: "web_search_call", id: "ws_1", status: "completed", action: { type: "search" } },
					{
						type: "message",
						id: "msg_1",
						role: "assistant",
						status: "completed",
						content: [
							{
								type: "output_text",
								text: "Try Acme.",
								annotations: [
									{
										type: "url_citation",
										url: "https://acme.io/?utm_source=chatgpt.com",
										title: "Acme",
										start_index: 4,
										end_index: 8,
									},
								],
							},
						],
					},
				],
			}),
		);
		const result = await engine.ask("Best scheduler?");
		expect(result.answer).toBe("Try Acme.");
		expect(result.citations).toEqual([
			{ url: "https://acme.io/?utm_source=chatgpt.com", title: "Acme" },
		]);
		expect(result.model).toBe("openai:gpt-6-astra");
		// 2k × $10 + 500 × $50 + 1 search × $0.025.
		expect(result.costMicros).toBe(20_000 + 25_000 + 25_000);

		const sent = captured[0];
		expect(sent?.path).toBe("/v1/responses");
		expect(sent?.headers.get("authorization")).toBe("Bearer sk-test");
		expect(sent?.body).toMatchObject({
			model: "gpt-6-astra",
			input: "Best scheduler?",
			tools: [{ type: "web_search" }],
		});
	});

	test("refusals and HTTP errors map to AiError kinds", async () => {
		respond(() =>
			openAiResponse({
				output: [
					{
						type: "message",
						id: "m",
						role: "assistant",
						status: "completed",
						content: [{ type: "refusal", refusal: "no" }],
					},
				],
			}),
		);
		expect(await kindOf(engine.ask("q"))).toBe("refused");

		respond(() => Response.json({ error: { message: "bad key" } }, { status: 401 }));
		expect(await kindOf(engine.ask("q"))).toBe("not_configured");

		respond(() => Response.json({ error: { message: "bad model" } }, { status: 404 }));
		expect(await kindOf(engine.ask("q"))).toBe("invalid_request");
	});
});

// ── Gemini ──

describe("GeminiVisibilityEngine", () => {
	const redirects: string[] = [];
	const resolver = Object.assign(
		async (input: string | URL | Request) => {
			const href = String(input instanceof Request ? input.url : input);
			redirects.push(href);
			return new Response(null, {
				status: 302,
				headers: { location: "https://www.acme.io/pricing" },
			});
		},
		{ preconnect: () => {} },
	) as unknown as typeof fetch;
	const engine = new GeminiVisibilityEngine({
		apiKey: "g-key",
		model: "gemini-3.8-flash",
		baseURL: origin,
		fetch: resolver,
	});

	test("grounds with Google Search; resolves redirect citations; meters queries", async () => {
		respond(() =>
			Response.json({
				candidates: [
					{
						content: {
							role: "model",
							parts: [{ text: "thinking…", thought: true }, { text: "Acme leads the pack." }],
						},
						finishReason: "STOP",
						groundingMetadata: {
							webSearchQueries: ["best scheduler", "acme reviews"],
							groundingChunks: [
								{
									web: {
										uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc",
										title: "acme.io",
									},
								},
								{ web: { uri: "https://hubspot.com/blog", title: "HubSpot" } },
							],
						},
					},
				],
				usageMetadata: {
					promptTokenCount: 1_000,
					candidatesTokenCount: 200,
					thoughtsTokenCount: 300,
					toolUsePromptTokenCount: 1_000,
				},
				modelVersion: "gemini-3.8-flash",
			}),
		);
		const result = await engine.ask("Best scheduler?");
		expect(result.answer).toBe("Acme leads the pack.");
		expect(result.citations).toEqual([
			{ url: "https://www.acme.io/pricing", title: "acme.io" },
			{ url: "https://hubspot.com/blog", title: "HubSpot" },
		]);
		expect(redirects).toEqual([
			"https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc",
		]);
		expect(result.model).toBe("gemini:gemini-3.8-flash");
		// 2k in × $1.50 + 500 out × $7.50 + 2 queries × $0.014.
		expect(result.costMicros).toBe(3_000 + 3_750 + 28_000);

		const sent = captured[0];
		expect(sent?.path).toContain("/models/gemini-3.8-flash:generateContent");
		expect(sent?.headers.get("x-goog-api-key")).toBe("g-key");
		expect(sent?.body).toMatchObject({ tools: [{ googleSearch: {} }] });
	});

	test("a safety block is refused; an API error maps by status", async () => {
		respond(() =>
			Response.json({ candidates: [{ finishReason: "SAFETY", content: { parts: [] } }] }),
		);
		expect(await kindOf(engine.ask("q"))).toBe("refused");

		respond(() =>
			Response.json(
				{ error: { code: 429, message: "quota", status: "RESOURCE_EXHAUSTED" } },
				{ status: 429 },
			),
		);
		expect(await kindOf(engine.ask("q"))).toBe("rate_limited");
	});
});

// ── Perplexity ──

describe("PerplexityVisibilityEngine", () => {
	const engine = new PerplexityVisibilityEngine({
		apiKey: "pplx-key",
		model: "sonar",
		baseURL: origin,
	});

	test("maps legacy sonar ids to Agent API presets", () => {
		expect(perplexityTarget("sonar")).toEqual({ preset: "fast" });
		expect(perplexityTarget("sonar-pro")).toEqual({ preset: "low" });
		expect(perplexityTarget("high")).toEqual({ preset: "high" });
		expect(perplexityTarget("openai/gpt-5.6-sol")).toEqual({ model: "openai/gpt-5.6-sol" });
	});

	test("calls the Agent API with web_search; annotations then search results; reported cost", async () => {
		respond(() =>
			Response.json({
				id: "r1",
				object: "response",
				status: "completed",
				model: "openai/gpt-5.6-luna",
				output: [
					{
						type: "search_results",
						results: [
							{ id: 1, url: "https://g2.com/best", title: "G2" },
							{ id: 2, url: "https://acme.io/", title: "Acme" },
						],
					},
					{
						type: "message",
						role: "assistant",
						content: [
							{
								type: "output_text",
								text: "Acme is popular [1].",
								annotations: [{ type: "url_citation", url: "https://acme.io/", title: "Acme" }],
							},
						],
					},
				],
				usage: {
					input_tokens: 150,
					output_tokens: 200,
					total_tokens: 350,
					cost: { currency: "USD", total_cost: 0.0071 },
				},
			}),
		);
		const result = await engine.ask("Best scheduler?");
		expect(result.answer).toBe("Acme is popular [1].");
		expect(result.citations).toEqual([
			{ url: "https://acme.io/", title: "Acme" },
			{ url: "https://g2.com/best", title: "G2" },
		]);
		expect(result.model).toBe("perplexity:openai/gpt-5.6-luna");
		expect(result.costMicros).toBe(7_100);

		const sent = captured[0];
		expect(sent?.path).toBe("/v1/agent");
		expect(sent?.headers.get("authorization")).toBe("Bearer pplx-key");
		expect(sent?.body).toMatchObject({
			preset: "fast",
			input: "Best scheduler?",
			tools: [{ type: "web_search" }],
		});
	});

	test("errors: auth is not_configured, a 429 is retried once then rate_limited", async () => {
		respond(() => Response.json({ error: { message: "bad key" } }, { status: 401 }));
		expect(await kindOf(engine.ask("q"))).toBe("not_configured");
		expect(captured).toHaveLength(1);

		captured = [];
		respond(() => Response.json({ error: { message: "slow down" } }, { status: 429 }));
		expect(await kindOf(engine.ask("q"))).toBe("rate_limited");
		expect(captured).toHaveLength(2);
	});
});

describe("createVisibilityEngines", () => {
	const env = {
		ANTHROPIC_API_KEY: "",
		OPENAI_API_KEY: "",
		GEMINI_API_KEY: "",
		PERPLEXITY_API_KEY: "",
		PERPLEXITY_MODEL: "sonar",
		VISIBILITY_CLAUDE_MODEL: "claude-opus-5",
		VISIBILITY_OPENAI_MODEL: "gpt-6-astra",
		VISIBILITY_GEMINI_MODEL: "gemini-3.8-flash",
	};
	test("only configured engines, in a fixed order", () => {
		expect(createVisibilityEngines(env)).toEqual([]);
		const all = createVisibilityEngines({
			...env,
			ANTHROPIC_API_KEY: "a",
			OPENAI_API_KEY: "o",
			GEMINI_API_KEY: "g",
			PERPLEXITY_API_KEY: "p",
		});
		expect(all.map((e) => e.id)).toEqual(["claude", "chatgpt", "gemini", "perplexity"]);
		expect(all.map((e) => e.model)).toEqual([
			"anthropic:claude-opus-5",
			"openai:gpt-6-astra",
			"gemini:gemini-3.8-flash",
			"perplexity:sonar",
		]);
		const some = createVisibilityEngines({
			...env,
			PERPLEXITY_API_KEY: "p",
			ANTHROPIC_API_KEY: "a",
		});
		expect(some.map((e) => e.id)).toEqual(["claude", "perplexity"]);
	});
});
