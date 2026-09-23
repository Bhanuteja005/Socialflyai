import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { z } from "zod";
import { AnthropicTextModel } from "./anthropic";
import { AiError } from "./errors";

/**
 * The adapter against a local stand-in for the Messages API: proves what goes on
 * the wire (structured output, adaptive thinking, refusal fallbacks) and how each
 * kind of response is turned into a result or an AiError. No network, no key.
 */

type Captured = { headers: Headers; body: Record<string, unknown> };
let captured: Captured[] = [];
let respond: () => Response = () => new Response("unset", { status: 500 });

const server = Bun.serve({
	port: 0,
	async fetch(req) {
		captured.push({ headers: req.headers, body: (await req.json()) as Record<string, unknown> });
		return respond();
	},
});
afterAll(() => server.stop(true));

const message = (over: Record<string, unknown>) =>
	Response.json({
		id: "msg_test",
		type: "message",
		role: "assistant",
		model: "claude-opus-5",
		content: [],
		stop_reason: "end_turn",
		stop_sequence: null,
		usage: { input_tokens: 1200, output_tokens: 300 },
		...over,
	});

const model = new AnthropicTextModel({
	apiKey: "test-key",
	model: "claude-opus-5",
	effort: "medium",
	baseURL: server.url.origin,
});
const schema = z.object({ text: z.string() });

beforeEach(() => {
	captured = [];
});

describe("AnthropicTextModel", () => {
	test("sends structured output, adaptive thinking and default fallbacks; meters the answer", async () => {
		respond = () => message({ content: [{ type: "text", text: '{"text":"Hello"}' }] });

		const result = await model.generate({ system: "sys", prompt: "hi", schema });

		expect(result.output).toEqual({ text: "Hello" });
		expect(result.model).toBe("anthropic:claude-opus-5");
		expect(result.usage).toEqual({ inputTokens: 1200, outputTokens: 300 });
		// $5/M in + $25/M out → 1200×5 + 300×25 micro-dollars.
		expect(result.costMicros).toBe(13_500);

		const sent = captured[0];
		expect(sent?.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
		expect(sent?.body).toMatchObject({
			model: "claude-opus-5",
			fallbacks: "default",
			thinking: { type: "adaptive" },
			system: "sys",
			messages: [{ role: "user", content: "hi" }],
			output_config: { effort: "medium", format: { type: "json_schema" } },
		});
	});

	test("bills the model that actually answered when a fallback served the request", async () => {
		respond = () =>
			message({ model: "claude-opus-4-8", content: [{ type: "text", text: '{"text":"ok"}' }] });
		const result = await model.generate({ system: "s", prompt: "p", schema });
		expect(result.model).toBe("anthropic:claude-opus-4-8");
	});

	test("a refusal becomes a non-retryable AiError", async () => {
		respond = () => message({ stop_reason: "refusal", content: [] });
		const error = await model.generate({ system: "s", prompt: "p", schema }).catch((e) => e);
		expect(error).toBeInstanceOf(AiError);
		expect((error as AiError).kind).toBe("refused");
		expect((error as AiError).retryable).toBe(false);
	});

	test("a truncated answer is invalid_output", async () => {
		respond = () =>
			message({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"te' }] });
		const error = (await model
			.generate({ system: "s", prompt: "p", schema })
			.catch((e) => e)) as AiError;
		expect(error.kind).toBe("invalid_output");
	});

	test("an invalid API key surfaces as not_configured, not a retry loop", async () => {
		respond = () =>
			Response.json(
				{ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } },
				{ status: 401 },
			);
		const error = (await model
			.generate({ system: "s", prompt: "p", schema })
			.catch((e) => e)) as AiError;
		expect(error.kind).toBe("not_configured");
		expect(captured).toHaveLength(1);
	});

	test("a 400 is invalid_request and is not retried", async () => {
		respond = () =>
			Response.json(
				{ type: "error", error: { type: "invalid_request_error", message: "prompt is too long" } },
				{ status: 400 },
			);
		const error = (await model
			.generate({ system: "s", prompt: "p", schema })
			.catch((e) => e)) as AiError;
		expect(error.kind).toBe("invalid_request");
		expect(captured).toHaveLength(1);
	});
});
