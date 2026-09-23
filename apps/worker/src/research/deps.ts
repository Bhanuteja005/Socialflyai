import type { AiModels } from "@socialfly/ai";
import type { Logger } from "@socialfly/core/logger";
import type { Database } from "@socialfly/db";
import type { JobProducer } from "@socialfly/queue";
import type {
	analyzeBrand,
	analyzeMention,
	classifySentiment,
	crawlSite,
	DataForSeo,
	VisibilityEngine,
} from "@socialfly/research";

/**
 * The @socialfly/research functions the processors call, passed in rather than
 * imported so tests can swap in fakes: the real ones fetch websites and call paid
 * APIs.
 */
export type ResearchFns = {
	crawlSite: typeof crawlSite;
	analyzeBrand: typeof analyzeBrand;
	analyzeMention: typeof analyzeMention;
	classifySentiment: typeof classifySentiment;
};

/** DataForSEO's calls, structurally — the class has private members a fake cannot implement. */
export type SeoClient = Pick<DataForSeo, "keywordMetrics" | "keywordIdeas" | "serpPosition">;

export type ResearchDeps = {
	db: Database;
	/** Read on every call (not destructured) so tests can swap the text model. */
	ai: AiModels;
	fns: ResearchFns;
	/** Configured AI engines for visibility checks; empty = the feature is off. */
	engines: VisibilityEngine[];
	/** DataForSEO client; null = SEO is off. */
	seo: SeoClient | null;
	jobs: JobProducer;
	logger: Logger;
	config: {
		maxPages: number;
		userAgent: string;
		/** Server default AI_ORG_MONTHLY_BUDGET_USD (an org override wins). */
		monthlyBudgetUsd: number;
	};
};

/** Bare, lower-case host without `www.` — how citations and competitors are matched. */
export function domainOf(url: string | null | undefined): string | null {
	if (!url) return null;
	try {
		const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`).hostname;
		return host.toLowerCase().replace(/^www\./, "") || null;
	} catch {
		return null;
	}
}

/**
 * Maps with at most `limit` calls in flight. Unlike the AI-media helper this never
 * short-circuits: each item handles its own failure (an engine error is a stored
 * row, not a failed run).
 */
export async function forEachLimit<T>(
	items: T[],
	limit: number,
	fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
	let next = 0;
	const lane = async () => {
		while (next < items.length) {
			const i = next++;
			await fn(items[i] as T, i);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
}
