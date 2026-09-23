import { z } from "zod";

/**
 * AI providers. Like platform credentials, an empty key disables that capability
 * instead of failing the boot: no ANTHROPIC_API_KEY = no text generation, no image
 * key = no image generation, and the web app hides what is unavailable.
 */
export const aiEnv = {
	/** Text generation (posts, rewrites, hashtags, carousel outlines). */
	ANTHROPIC_API_KEY: z.string().default(""),
	AI_TEXT_MODEL: z.string().default("claude-opus-5"),
	/** low | medium | high | xhigh | max — short social copy does not need deep thinking. */
	AI_TEXT_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),

	/** Image generation: tried in order, first configured provider that succeeds wins. */
	OPENAI_API_KEY: z.string().default(""),
	OPENAI_IMAGE_MODEL: z.string().default("gpt-image-1"),
	GEMINI_API_KEY: z.string().default(""),
	GEMINI_IMAGE_MODEL: z.string().default("gemini-2.5-flash-image"),

	/**
	 * Spend cap per organization per calendar month (USD). Generation is refused
	 * once the org's recorded cost reaches it. 0 = unlimited (self-hosters).
	 */
	AI_ORG_MONTHLY_BUDGET_USD: z.coerce.number().min(0).default(25),
} as const;
