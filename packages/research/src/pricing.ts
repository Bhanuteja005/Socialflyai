import { textCostMicros } from "@socialfly/ai";

/**
 * List prices for AI-visibility checks, in the same spirit as packages/ai/pricing.ts:
 * an estimate for budgeting, never an invoice, and unknown models priced at the
 * highest known rate so a new model can never look free.
 *
 * A visibility check costs tokens PLUS a per-search fee, and web search pulls page
 * content into the prompt, so input tokens are large. Sources (Sept 2026):
 *  - Anthropic web search: $10 / 1,000 searches (platform.claude.com pricing);
 *    tokens priced by @socialfly/ai's table.
 *  - OpenAI web search: $10 / 1,000 calls for reasoning models, $25 / 1,000 for
 *    non-reasoning ones (developers.openai.com/api/docs/pricing). We charge the $25
 *    rate for every model — the conservative side.
 *  - Gemini Grounding with Google Search: $14 / 1,000 search queries on Gemini 3.x
 *    after a monthly free allowance (ai.google.dev/gemini-api/docs/pricing). The free
 *    tier is ignored: it is per project, not per organization.
 *  - Perplexity reports the real cost of each request in `usage.cost`, which is used
 *    when present; the fallback below only covers a response without it.
 */

const PER_MILLION: Record<string, { input: number; output: number }> = {
	"openai:gpt-6-astra": { input: 10, output: 50 },
	"openai:gpt-6-sol": { input: 2, output: 10 },
	"openai:gpt-6-luna": { input: 0.1, output: 0.5 },
	"openai:gpt-5.5": { input: 5, output: 30 },
	// Gemini 3.8 Flash is $0.75/$3.75 until 2026-12-31 and $1.50/$7.50 after; the
	// later price is used so budgets do not jump on January 1.
	"gemini:gemini-3.8-flash": { input: 1.5, output: 7.5 },
	"gemini:gemini-3.5-flash": { input: 1.5, output: 9 },
	"gemini:gemini-3.1-pro-preview": { input: 2, output: 12 },
};

/** Same ceiling as packages/ai's fallback text price. */
const FALLBACK_PER_MILLION = { input: 10, output: 50 };

/** Micro-USD per search / tool call. */
export const SEARCH_FEE_MICROS = {
	anthropic: 10_000,
	openai: 25_000,
	gemini: 14_000,
	/** Perplexity web_search: $2.50 / 1,000 invocations; doubled as a safety margin. */
	perplexity: 5_000,
} as const;

export function engineTokenCostMicros(
	model: string,
	usage: { inputTokens: number; outputTokens: number },
): number {
	// Claude prices live in one place (packages/ai) so they never disagree.
	if (model.startsWith("anthropic:")) return textCostMicros(model, usage);
	const price = PER_MILLION[model] ?? FALLBACK_PER_MILLION;
	return Math.ceil(usage.inputTokens * price.input + usage.outputTokens * price.output);
}

export function engineCostMicros(
	provider: keyof typeof SEARCH_FEE_MICROS,
	model: string,
	usage: { inputTokens: number; outputTokens: number },
	searches: number,
): number {
	return engineTokenCostMicros(model, usage) + searches * SEARCH_FEE_MICROS[provider];
}
