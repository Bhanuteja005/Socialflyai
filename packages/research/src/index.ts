/**
 * Website research, SEO data and AI-visibility (AEO) checks. Stateless providers
 * in the same mould as @socialfly/ai: request in, result + cost (integer micro-USD)
 * out; persistence, budgets and retries belong to the callers (apps/worker, apps/api).
 */

export { analyzeBrand, BRAND_SYSTEM_PROMPT, type BrandInsights, selectPages } from "./brand";
export { type CrawledPage, type CrawlOptions, type CrawlResult, crawlSite } from "./crawler";
export {
	ClaudeVisibilityEngine,
	dedupeCitations,
	GeminiVisibilityEngine,
	OpenAiVisibilityEngine,
	PerplexityVisibilityEngine,
	perplexityTarget,
} from "./engines";
export { analyzeMention, type MentionAnalysis, type MentionTarget } from "./mention";
export { engineCostMicros, SEARCH_FEE_MICROS } from "./pricing";
export { parseRobots, type Robots } from "./robots";
export { createDataForSeo, DataForSeo, type KeywordMetric } from "./seo";
export { hostBelongsTo, normalizeDomain, registrableDomain } from "./urls";
export {
	classifySentiment,
	createVisibilityEngines,
	type EngineAnswer,
	type VisibilityEngine,
	type VisibilityEngineId,
	type VisibilityEnv,
} from "./visibility";
