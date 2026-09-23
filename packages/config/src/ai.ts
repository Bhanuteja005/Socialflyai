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
	/** Voiceover for AI videos (same OpenAI key). */
	OPENAI_TTS_MODEL: z.string().default("gpt-4o-mini-tts"),
	GEMINI_API_KEY: z.string().default(""),
	GEMINI_IMAGE_MODEL: z.string().default("gemini-2.5-flash-image"),

	/** AI-visibility checks: Perplexity answers with citations (optional). */
	PERPLEXITY_API_KEY: z.string().default(""),
	PERPLEXITY_MODEL: z.string().default("sonar"),

	/**
	 * AI-visibility checks ask each assistant a buyer question with its web search on,
	 * using the same kind of model a consumer would get. An engine runs only when its
	 * provider key (above) is set.
	 */
	VISIBILITY_CLAUDE_MODEL: z.string().default("claude-opus-5"),
	/** OpenAI's flagship per developers.openai.com/api/docs/models (Sept 2026); supports the Responses API web_search tool. */
	VISIBILITY_OPENAI_MODEL: z.string().default("gpt-6-astra"),
	/** Newest Flash model listed with Google Search grounding in ai.google.dev/gemini-api/docs/google-search (Sept 2026). */
	VISIBILITY_GEMINI_MODEL: z.string().default("gemini-3.8-flash"),

	/** SEO data (keyword volumes, Google rankings) via DataForSEO — optional; empty = SEO hidden. */
	DATAFORSEO_LOGIN: z.string().default(""),
	DATAFORSEO_PASSWORD: z.string().default(""),

	/** Website research crawl limits: polite by default. */
	RESEARCH_MAX_PAGES: z.coerce.number().int().min(1).max(500).default(40),
	RESEARCH_USER_AGENT: z
		.string()
		.default("SocialFlyBot/1.0 (+https://github.com/Bhanuteja005/Socialflyai)"),

	/**
	 * Spend cap per organization per calendar month (USD). Generation is refused
	 * once the org's recorded cost reaches it. 0 = unlimited (self-hosters).
	 */
	AI_ORG_MONTHLY_BUDGET_USD: z.coerce.number().min(0).default(25),
} as const;
