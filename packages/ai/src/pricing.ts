/**
 * List prices in USD per million tokens, used to meter usage against each
 * organization's monthly budget. An estimate for budgeting, not an invoice: the
 * provider's bill is the source of truth. Unknown models are priced at the most
 * expensive known rate so a new model can never make usage look free.
 */
const TEXT_PRICES: Record<string, { input: number; output: number }> = {
	"anthropic:claude-fable-5-1": { input: 10, output: 50 },
	"anthropic:claude-fable-5": { input: 10, output: 50 },
	"anthropic:claude-opus-5-5": { input: 4, output: 20 },
	"anthropic:claude-opus-5": { input: 5, output: 25 },
	"anthropic:claude-opus-4-8": { input: 5, output: 25 },
	"anthropic:claude-sonnet-5": { input: 2, output: 10 },
	"anthropic:claude-haiku-4-5": { input: 1, output: 5 },
};

const FALLBACK_TEXT_PRICE = { input: 10, output: 50 };

export function textCostMicros(
	model: string,
	usage: { inputTokens: number; outputTokens: number },
) {
	const price = TEXT_PRICES[model] ?? FALLBACK_TEXT_PRICE;
	// $/1M tokens × tokens = micro-dollars exactly.
	return Math.ceil(usage.inputTokens * price.input + usage.outputTokens * price.output);
}

/**
 * Image models: gpt-image-* bill by tokens (text in, image out); Gemini image
 * models bill per image. Per-image values are conservative estimates.
 */
const IMAGE_TOKEN_PRICES: Record<string, { input: number; output: number }> = {
	"openai:gpt-image-1": { input: 5, output: 40 },
};
const IMAGE_FLAT_MICROS: Record<string, number> = {
	"gemini:gemini-2.5-flash-image": 39_000,
};
const FALLBACK_IMAGE_MICROS = 200_000;

export function imageCostMicros(
	model: string,
	usage?: { inputTokens: number; outputTokens: number },
) {
	const tokenPrice = IMAGE_TOKEN_PRICES[model];
	if (tokenPrice && usage && usage.outputTokens > 0) {
		return Math.ceil(usage.inputTokens * tokenPrice.input + usage.outputTokens * tokenPrice.output);
	}
	return IMAGE_FLAT_MICROS[model] ?? FALLBACK_IMAGE_MICROS;
}

export const microsToUsd = (micros: number) => micros / 1_000_000;
export const usdToMicros = (usd: number) => Math.round(usd * 1_000_000);
