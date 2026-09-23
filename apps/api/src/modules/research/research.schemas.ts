import { z } from "zod";

/** Active visibility prompts per organization: each one is asked of every engine every week. */
export const MAX_ACTIVE_PROMPTS = 25;
/** Keywords per organization: metrics are paid per keyword, so the list stays curated. */
export const MAX_KEYWORDS = 500;

export const idParam = z.object({ id: z.uuid() });

const cursorLimit = (max: number, dflt: number) =>
	z.coerce.number().int().min(1).max(max).default(dflt);

// ── runs ─────────────────────────────────────────────────────────────────────

export const startRunBody = z.object({
	/** Defaults to the brand profile's website. A bare domain is fine: https is assumed. */
	url: z.string().trim().min(1).max(500).optional(),
});
export type StartRunInput = z.infer<typeof startRunBody>;

export const listRunsQuery = z.object({ limit: cursorLimit(20, 10) });

export const pagesQuery = z.object({
	/** `nextCursor` from the previous page. */
	before: z.uuid().optional(),
	limit: cursorLimit(100, 50),
});
export type PagesQuery = z.infer<typeof pagesQuery>;

const promptText = z.string().trim().min(5).max(500);
const competitorName = z.string().trim().min(1).max(100);
/** A bare domain or a URL; stored as the bare host (see normalizeDomain). */
const domainInput = z.string().trim().max(255);
const keywordText = z.string().trim().min(1).max(100);

export const applyInsightsBody = z.object({
	runId: z.uuid(),
	buyerQuestions: z.array(promptText).max(50).optional(),
	competitors: z
		.array(z.object({ name: competitorName, domain: domainInput.nullish() }))
		.max(50)
		.optional(),
	keywords: z.array(keywordText).max(100).optional(),
});
export type ApplyInsightsInput = z.infer<typeof applyInsightsBody>;

// ── competitors ──────────────────────────────────────────────────────────────

const aliases = z.array(z.string().trim().min(1).max(100)).max(10);

export const createCompetitorBody = z.object({
	name: competitorName,
	domain: domainInput.nullish(),
	aliases: aliases.default([]),
});
export type CreateCompetitorInput = z.infer<typeof createCompetitorBody>;

export const updateCompetitorBody = z
	.object({ name: competitorName, domain: domainInput.nullable(), aliases })
	.partial()
	.refine((v) => Object.keys(v).length > 0, "Nothing to update");
export type UpdateCompetitorInput = z.infer<typeof updateCompetitorBody>;

// ── keywords ─────────────────────────────────────────────────────────────────

/** DataForSEO location codes (2840 = United States) and ISO language codes. */
const locationCode = z.coerce.number().int().min(1).max(99_999_999);
const languageCode = z
	.string()
	.trim()
	.toLowerCase()
	.regex(/^[a-z]{2}(-[a-z]{2,4})?$/, "Use a language code like en or pt-br");

export const addKeywordsBody = z.object({
	keywords: z.array(keywordText).min(1).max(50),
	locationCode: locationCode.default(2840),
	languageCode: languageCode.default("en"),
	tracked: z.boolean().default(false),
});
export type AddKeywordsInput = z.infer<typeof addKeywordsBody>;

export const updateKeywordBody = z.object({ tracked: z.boolean() });

export const rankingsQuery = z.object({ days: cursorLimit(365, 90) });

export const keywordIdeasBody = z.object({
	seeds: z.array(keywordText).min(1).max(5),
	locationCode: locationCode.default(2840),
	languageCode: languageCode.default("en"),
	limit: cursorLimit(100, 50),
});
export type KeywordIdeasInput = z.infer<typeof keywordIdeasBody>;

// ── visibility ───────────────────────────────────────────────────────────────

export const createPromptBody = z.object({ prompt: promptText });

export const updatePromptBody = z
	.object({ prompt: promptText, active: z.boolean() })
	.partial()
	.refine((v) => Object.keys(v).length > 0, "Nothing to update");
export type UpdatePromptInput = z.infer<typeof updatePromptBody>;

export const summaryQuery = z.object({ days: cursorLimit(365, 30) });

export const checksQuery = z.object({ limit: cursorLimit(50, 20) });
