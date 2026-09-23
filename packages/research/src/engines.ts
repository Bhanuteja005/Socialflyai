import Anthropic from "@anthropic-ai/sdk";
import type {
	BetaContentBlock,
	BetaContentBlockParam,
	BetaMessageParam,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { GoogleGenAI } from "@google/genai";
import { AiError, usdToMicros } from "@socialfly/ai";
import OpenAI from "openai";
import { kindFromStatus, providerError } from "./errors";
import { engineCostMicros } from "./pricing";
import type { EngineAnswer, VisibilityEngine, VisibilityEngineId } from "./visibility";

/**
 * One adapter per AI assistant. Each asks the buyer's question exactly as a person
 * would type it — no system prompt, no hint about the brand — with the provider's
 * own web search switched on, because that is how these assistants answer
 * "which tool should I use for…" today. Stateless like every provider in
 * SocialFly: question in, answer + sources + cost out.
 */

const TIMEOUT_MS = 120_000;

type Citation = { url: string; title?: string };

/** Keeps the first occurrence of each URL (ignoring a trailing slash and fragment). */
export function dedupeCitations(citations: Citation[]): Citation[] {
	const seen = new Set<string>();
	const out: Citation[] = [];
	for (const c of citations) {
		let key: string;
		try {
			const u = new URL(c.url);
			if (u.protocol !== "http:" && u.protocol !== "https:") continue;
			u.hash = "";
			key = u.href.replace(/\/$/, "");
		} catch {
			continue;
		}
		if (seen.has(key)) continue;
		seen.add(key);
		const title = c.title?.trim();
		out.push(title ? { url: c.url, title } : { url: c.url });
	}
	return out;
}

// ── Claude ──────────────────────────────────────────────────────────────────

/** A paused server-side search loop is resumed at most this many times. */
const MAX_CONTINUATIONS = 4;

export class ClaudeVisibilityEngine implements VisibilityEngine {
	readonly id: VisibilityEngineId = "claude";
	readonly model: string;
	private readonly client: Anthropic;

	constructor(private readonly options: { apiKey: string; model: string; baseURL?: string }) {
		this.model = `anthropic:${options.model}`;
		this.client = new Anthropic({
			apiKey: options.apiKey,
			baseURL: options.baseURL,
			maxRetries: 1,
			timeout: TIMEOUT_MS,
		});
	}

	async ask(prompt: string, opts?: { signal?: AbortSignal }): Promise<EngineAnswer> {
		const content: BetaContentBlock[] = [];
		let inputTokens = 0;
		let outputTokens = 0;
		let searches = 0;
		let answeredBy = this.options.model;

		for (let turn = 0; ; turn++) {
			const messages: BetaMessageParam[] = [{ role: "user", content: prompt }];
			// Resuming a paused turn: send back everything so far and the server picks
			// up after the trailing server_tool_use — no extra "continue" message.
			if (content.length) {
				messages.push({ role: "assistant", content: content as BetaContentBlockParam[] });
			}
			let response: Anthropic.Beta.Messages.BetaMessage;
			try {
				response = await this.client.beta.messages.create(
					{
						model: this.options.model,
						max_tokens: 16_000,
						betas: ["server-side-fallback-2026-07-01"],
						fallbacks: "default",
						thinking: { type: "adaptive" },
						output_config: { effort: "medium" },
						tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
						messages,
					},
					{ signal: opts?.signal },
				);
			} catch (error) {
				throw providerError("anthropic", error);
			}

			const u = response.usage;
			inputTokens +=
				u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
			outputTokens += u.output_tokens;
			searches += u.server_tool_use?.web_search_requests ?? 0;
			answeredBy = response.model;
			content.push(...response.content);

			if (response.stop_reason === "pause_turn" && turn < MAX_CONTINUATIONS) continue;
			if (response.stop_reason === "refusal") {
				throw new AiError("refused", "Claude declined to answer this question", {
					provider: "anthropic",
				});
			}
			if (
				response.stop_reason === "max_tokens" ||
				response.stop_reason === "model_context_window_exceeded"
			) {
				throw new AiError("invalid_output", "Claude's answer was cut off", {
					provider: "anthropic",
				});
			}
			break;
		}

		// The answer is the text after the last search; earlier text is narration
		// ("Let me look that up").
		let lastTool = -1;
		content.forEach((block, i) => {
			if (block.type === "server_tool_use" || block.type === "web_search_tool_result") lastTool = i;
		});
		const answerBlocks = content.slice(lastTool + 1).filter((b) => b.type === "text");
		const answer = answerBlocks
			.map((b) => b.text)
			.join("")
			.trim();

		const citations: Citation[] = [];
		const toolErrors: string[] = [];
		for (const block of content) {
			if (block.type === "text") {
				for (const c of block.citations ?? []) {
					if (c.type === "web_search_result_location")
						citations.push({ url: c.url, title: c.title ?? undefined });
				}
			} else if (
				block.type === "web_search_tool_result" &&
				!Array.isArray(block.content) &&
				block.content.type === "web_search_tool_result_error"
			) {
				// Search failures arrive as data inside a 200 response, not as exceptions.
				toolErrors.push(block.content.error_code);
			}
		}

		const model = `anthropic:${answeredBy}`;
		if (!answer) {
			const code = toolErrors[0];
			throw new AiError(
				code === "too_many_requests"
					? "rate_limited"
					: code === "unavailable" || code === undefined
						? "transient"
						: "invalid_request",
				code ? `Claude's web search failed (${code})` : "Claude returned no answer",
				{ provider: "anthropic" },
			);
		}
		return {
			answer,
			citations: dedupeCitations(citations),
			model,
			costMicros: engineCostMicros("anthropic", model, { inputTokens, outputTokens }, searches),
		};
	}
}

// ── ChatGPT (OpenAI Responses API) ──────────────────────────────────────────

export class OpenAiVisibilityEngine implements VisibilityEngine {
	readonly id: VisibilityEngineId = "chatgpt";
	readonly model: string;
	private readonly client: OpenAI;

	constructor(private readonly options: { apiKey: string; model: string; baseURL?: string }) {
		this.model = `openai:${options.model}`;
		this.client = new OpenAI({
			apiKey: options.apiKey,
			baseURL: options.baseURL,
			maxRetries: 1,
			timeout: TIMEOUT_MS,
		});
	}

	async ask(prompt: string, opts?: { signal?: AbortSignal }): Promise<EngineAnswer> {
		let response: OpenAI.Responses.Response;
		try {
			response = await this.client.responses.create(
				{ model: this.options.model, input: prompt, tools: [{ type: "web_search" }] },
				{ signal: opts?.signal },
			);
		} catch (error) {
			throw providerError("openai", error);
		}

		const parts: string[] = [];
		const citations: Citation[] = [];
		let searches = 0;
		let refusal = false;
		for (const item of response.output ?? []) {
			if (item.type === "web_search_call") searches++;
			if (item.type !== "message") continue;
			for (const part of item.content) {
				if (part.type === "refusal") refusal = true;
				if (part.type !== "output_text") continue;
				parts.push(part.text);
				for (const a of part.annotations ?? []) {
					if (a.type === "url_citation") citations.push({ url: a.url, title: a.title });
				}
			}
		}
		const answer = parts.join("\n\n").trim();
		const reason = response.incomplete_details?.reason;
		if ((refusal || reason === "content_filter") && !answer) {
			throw new AiError("refused", "ChatGPT declined to answer this question", {
				provider: "openai",
			});
		}
		if (response.status === "failed") {
			throw new AiError("transient", response.error?.message ?? "ChatGPT failed to answer", {
				provider: "openai",
			});
		}
		if (reason === "max_output_tokens" || !answer) {
			throw new AiError("invalid_output", "ChatGPT returned no complete answer", {
				provider: "openai",
			});
		}

		const model = `openai:${response.model || this.options.model}`;
		const usage = {
			inputTokens: response.usage?.input_tokens ?? 0,
			outputTokens: response.usage?.output_tokens ?? 0,
		};
		return {
			answer,
			citations: dedupeCitations(citations),
			model,
			// Priced by the configured model: the response may carry a dated snapshot id.
			costMicros: engineCostMicros("openai", this.model, usage, searches),
		};
	}
}

// ── Gemini (Grounding with Google Search) ───────────────────────────────────

const GEMINI_BLOCKED = new Set([
	"SAFETY",
	"PROHIBITED_CONTENT",
	"BLOCKLIST",
	"SPII",
	"IMAGE_SAFETY",
	"RECITATION",
]);

export class GeminiVisibilityEngine implements VisibilityEngine {
	readonly id: VisibilityEngineId = "gemini";
	readonly model: string;
	private readonly client: GoogleGenAI;
	private readonly fetch: typeof fetch;

	constructor(
		private readonly options: {
			apiKey: string;
			model: string;
			baseURL?: string;
			/** Used to resolve Google's grounding redirect links; tests inject a fake. */
			fetch?: typeof fetch;
		},
	) {
		this.model = `gemini:${options.model}`;
		this.fetch = options.fetch ?? fetch;
		this.client = new GoogleGenAI({
			apiKey: options.apiKey,
			httpOptions: { baseUrl: options.baseURL, timeout: TIMEOUT_MS },
		});
	}

	async ask(prompt: string, opts?: { signal?: AbortSignal }): Promise<EngineAnswer> {
		let response: Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>;
		try {
			response = await this.client.models.generateContent({
				model: this.options.model,
				contents: prompt,
				config: { tools: [{ googleSearch: {} }], abortSignal: opts?.signal },
			});
		} catch (error) {
			throw providerError("gemini", error);
		}

		const candidate = response.candidates?.[0];
		const answer = (candidate?.content?.parts ?? [])
			.filter((p) => !p.thought && typeof p.text === "string")
			.map((p) => p.text)
			.join("")
			.trim();
		if (!answer) {
			const blocked =
				Boolean(response.promptFeedback?.blockReason) ||
				GEMINI_BLOCKED.has(String(candidate?.finishReason ?? ""));
			throw new AiError(
				blocked ? "refused" : "invalid_output",
				blocked ? "Gemini declined to answer this question" : "Gemini returned no answer",
				{ provider: "gemini" },
			);
		}

		const grounding = candidate?.groundingMetadata;
		const chunks = (grounding?.groundingChunks ?? [])
			.map((c) => c.web)
			.filter((w): w is { uri: string; title?: string } => Boolean(w?.uri));
		const citations = await Promise.all(
			chunks.map((w) => this.resolveGroundingLink(w.uri, w.title, opts?.signal)),
		);
		// Billed per query the model ran; grounded output with no reported query still cost one.
		const searches = grounding?.webSearchQueries?.length || (chunks.length ? 1 : 0);

		const meta = response.usageMetadata;
		const usage = {
			inputTokens: (meta?.promptTokenCount ?? 0) + (meta?.toolUsePromptTokenCount ?? 0),
			// Thinking tokens are billed as output.
			outputTokens: (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0),
		};
		return {
			answer,
			citations: dedupeCitations(citations.filter((c): c is Citation => c !== null)),
			model: `gemini:${response.modelVersion || this.options.model}`,
			costMicros: engineCostMicros("gemini", this.model, usage, searches),
		};
	}

	/**
	 * Gemini cites through opaque vertexaisearch.cloud.google.com redirect links and
	 * puts the site's domain in `title`. Mention analysis needs the real URL, so the
	 * redirect is resolved (one request, not followed); if that fails, the domain from
	 * the title is still enough to attribute the citation.
	 */
	private async resolveGroundingLink(
		uri: string,
		title: string | undefined,
		signal?: AbortSignal,
	): Promise<Citation | null> {
		let host: string;
		try {
			host = new URL(uri).hostname;
		} catch {
			return null;
		}
		if (host !== "vertexaisearch.cloud.google.com") return { url: uri, title };
		try {
			const signals = [AbortSignal.timeout(5_000)];
			if (signal) signals.push(signal);
			const res = await this.fetch(uri, { redirect: "manual", signal: AbortSignal.any(signals) });
			await res.body?.cancel();
			const location = res.headers.get("location");
			if (location && /^https?:\/\//i.test(location)) return { url: location, title };
		} catch {
			// fall through to the title
		}
		const domain = title?.trim().toLowerCase();
		if (domain && /^[a-z\d-]+(\.[a-z\d-]+)+$/.test(domain))
			return { url: `https://${domain}/`, title };
		return null;
	}
}

// ── Perplexity (Agent API) ──────────────────────────────────────────────────

/**
 * Perplexity retires Sonar Chat Completions on 2026-09-27; its replacement, the
 * Agent API (POST /v1/agent, Responses-shaped), takes a preset or a
 * "provider/model" id. Legacy ids in PERPLEXITY_MODEL keep working through the
 * mapping Perplexity's migration notes give (sonar → fast, …).
 */
const LEGACY_PRESETS: Record<string, string> = {
	sonar: "fast",
	"sonar-pro": "low",
	"sonar-reasoning": "low",
	"sonar-reasoning-pro": "low",
	"sonar-deep-research": "medium",
	"fast-search": "fast",
	"pro-search": "low",
	"deep-research": "medium",
};

export function perplexityTarget(configured: string): { preset: string } | { model: string } {
	const value = configured.trim();
	if (value.includes("/")) return { model: value };
	return { preset: LEGACY_PRESETS[value] ?? value };
}

type PerplexityResponse = {
	model?: string;
	status?: string;
	error?: { message?: string } | null;
	output?: Array<{
		type: string;
		content?: Array<{
			type: string;
			text?: string;
			annotations?: Array<{ type: string; url?: string; title?: string }>;
		}>;
		results?: Array<{ url?: string; title?: string }>;
	}>;
	usage?: {
		input_tokens?: number;
		output_tokens?: number;
		cost?: { total_cost?: number } | null;
	};
};

export class PerplexityVisibilityEngine implements VisibilityEngine {
	readonly id: VisibilityEngineId = "perplexity";
	readonly model: string;
	private readonly baseURL: string;
	private readonly fetch: typeof fetch;

	constructor(
		private readonly options: {
			apiKey: string;
			model: string;
			baseURL?: string;
			fetch?: typeof fetch;
		},
	) {
		this.model = `perplexity:${options.model}`;
		this.baseURL = (options.baseURL ?? "https://api.perplexity.ai").replace(/\/+$/, "");
		this.fetch = options.fetch ?? fetch;
	}

	async ask(prompt: string, opts?: { signal?: AbortSignal }): Promise<EngineAnswer> {
		const body = JSON.stringify({
			...perplexityTarget(this.options.model),
			input: prompt,
			// Presets already search; listing the tool guarantees it for a raw model id.
			tools: [{ type: "web_search" }],
			// Required by some underlying models; generous for an assistant answer.
			max_output_tokens: 4_000,
		});

		let res: Response | undefined;
		// One retry on throttling/server errors, like the SDK-based engines.
		for (let attempt = 0; attempt < 2; attempt++) {
			try {
				const signals = [AbortSignal.timeout(TIMEOUT_MS)];
				if (opts?.signal) signals.push(opts.signal);
				res = await this.fetch(`${this.baseURL}/v1/agent`, {
					method: "POST",
					headers: {
						authorization: `Bearer ${this.options.apiKey}`,
						"content-type": "application/json",
						accept: "application/json",
					},
					body,
					signal: AbortSignal.any(signals),
				});
			} catch (error) {
				if (opts?.signal?.aborted || attempt === 1) throw providerError("perplexity", error);
				continue;
			}
			if ((res.status === 429 || res.status >= 500) && attempt === 0) {
				await res.body?.cancel();
				await Bun.sleep(1_000);
				continue;
			}
			break;
		}
		if (!res)
			throw new AiError("transient", "Could not reach perplexity", { provider: "perplexity" });
		if (!res.ok) {
			const detail = await res.text().catch(() => "");
			const retryAfter = Number(res.headers.get("retry-after"));
			throw new AiError(
				kindFromStatus(res.status),
				res.status === 429
					? "perplexity is busy — try again shortly"
					: `perplexity rejected the request${detail ? `: ${detail.slice(0, 200)}` : ""}`,
				{
					provider: "perplexity",
					status: res.status,
					retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
				},
			);
		}

		let data: PerplexityResponse;
		try {
			data = (await res.json()) as PerplexityResponse;
		} catch (error) {
			throw new AiError(
				"invalid_output",
				"perplexity returned an unreadable response",
				{ provider: "perplexity" },
				{ cause: error },
			);
		}

		const parts: string[] = [];
		const cited: Citation[] = [];
		const sources: Citation[] = [];
		let searches = 0;
		for (const item of data.output ?? []) {
			if (item.type === "message") {
				for (const part of item.content ?? []) {
					if (part.type !== "output_text" || !part.text) continue;
					parts.push(part.text);
					for (const a of part.annotations ?? []) {
						if (a.type === "url_citation" && a.url) cited.push({ url: a.url, title: a.title });
					}
				}
			} else if (item.type === "search_results") {
				searches++;
				for (const r of item.results ?? []) if (r.url) sources.push({ url: r.url, title: r.title });
			}
		}
		const answer = parts.join("\n\n").trim();
		if (!answer) {
			throw new AiError(
				data.status === "failed" ? "transient" : "invalid_output",
				data.error?.message ?? "perplexity returned no answer",
				{ provider: "perplexity" },
			);
		}

		// Perplexity shows its search results as the answer's sources, so they count
		// as citations too — inline citations first.
		const usage = {
			inputTokens: data.usage?.input_tokens ?? 0,
			outputTokens: data.usage?.output_tokens ?? 0,
		};
		const reported = data.usage?.cost?.total_cost;
		const costMicros =
			typeof reported === "number" && Number.isFinite(reported) && reported >= 0
				? usdToMicros(reported)
				: engineCostMicros("perplexity", this.model, usage, Math.max(searches, 1));
		return {
			answer,
			citations: dedupeCitations([...cited, ...sources]),
			model: `perplexity:${data.model || this.options.model}`,
			costMicros,
		};
	}
}
