import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AiError, kindFromStatus } from "./errors";
import { textCostMicros } from "./pricing";
import type { TextModel, TextRequest, TextResult } from "./types";

export type AnthropicOptions = {
	apiKey: string;
	model: string;
	effort: "low" | "medium" | "high" | "xhigh" | "max";
	/** Tests point this at a local fake server. */
	baseURL?: string;
};

/**
 * Text generation on Claude via the official SDK.
 *
 * - Structured outputs (`output_config.format`) constrain the answer to the task's
 *   Zod schema, so there is no "please reply in JSON" prompt and no brittle parsing.
 * - Adaptive thinking with a configurable effort: social copy is short, so the
 *   default is medium; raise AI_TEXT_EFFORT if quality needs it.
 * - `fallbacks: "default"`: if the model's safety classifiers decline a benign
 *   request (e.g. marketing copy for a security product), the API re-runs it on
 *   Anthropic's recommended fallback model inside the same call.
 */
export class AnthropicTextModel implements TextModel {
	readonly id: string;
	private readonly client: Anthropic;

	constructor(private readonly options: AnthropicOptions) {
		this.id = `anthropic:${options.model}`;
		// SDK retries 429/5xx/connection errors twice with backoff; the timeout bounds
		// a request-path call so the API never hangs on a slow generation.
		this.client = new Anthropic({
			apiKey: options.apiKey,
			baseURL: options.baseURL,
			maxRetries: 2,
			timeout: 90_000,
		});
	}

	async generate<T>(request: TextRequest<T>): Promise<TextResult<T>> {
		let response: Awaited<ReturnType<typeof this.parse<T>>>;
		try {
			response = await this.parse(request);
		} catch (error) {
			throw toAiError(error);
		}

		// The model that answered (the fallback model, if the first one declined).
		const model = `anthropic:${response.model}`;
		const usage = {
			inputTokens: response.usage.input_tokens,
			outputTokens: response.usage.output_tokens,
		};
		const metered = { model, usage, costMicros: textCostMicros(model, usage) };

		if (response.stop_reason === "refusal") {
			throw new AiError("refused", "The AI declined this request. Try rephrasing it.", {
				provider: "anthropic",
			});
		}
		if (response.stop_reason === "max_tokens") {
			throw new AiError("invalid_output", "The AI response was cut off", { provider: "anthropic" });
		}
		const parsed = request.schema.safeParse(response.parsed_output);
		if (!parsed.success) {
			throw new AiError("invalid_output", "The AI response did not have the expected shape", {
				provider: "anthropic",
			});
		}
		return { ...metered, output: parsed.data };
	}

	private parse<T>(request: TextRequest<T>) {
		return this.client.beta.messages.parse(
			{
				model: this.options.model,
				max_tokens: request.maxTokens ?? 16_000,
				betas: ["server-side-fallback-2026-07-01"],
				fallbacks: "default",
				thinking: { type: "adaptive" },
				output_config: {
					effort: this.options.effort,
					format: betaZodOutputFormat(request.schema),
				},
				system: request.system,
				messages: [{ role: "user", content: request.prompt }],
			},
			{ signal: request.signal },
		);
	}
}

function toAiError(error: unknown): AiError {
	if (error instanceof AiError) return error;
	if (
		error instanceof Anthropic.APIConnectionTimeoutError ||
		error instanceof Anthropic.APIConnectionError
	) {
		return new AiError(
			"transient",
			"Could not reach the AI provider",
			{ provider: "anthropic" },
			{ cause: error },
		);
	}
	if (error instanceof Anthropic.APIError) {
		const retryAfter = Number(error.headers?.get?.("retry-after"));
		return new AiError(
			kindFromStatus(error.status),
			error.status === 429
				? "The AI provider is busy — try again shortly"
				: "The AI provider rejected the request",
			{
				provider: "anthropic",
				status: error.status,
				retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : undefined,
			},
			{ cause: error },
		);
	}
	// A parse failure inside the SDK helper (schema mismatch) surfaces as a plain Error.
	return new AiError(
		"invalid_output",
		"The AI response could not be read",
		{ provider: "anthropic" },
		{ cause: error },
	);
}
