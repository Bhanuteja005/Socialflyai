import { AiError, type AiErrorKind, usdToMicros } from "@socialfly/ai";
import { kindFromStatus } from "./errors";
import { hostBelongsTo, normalizeDomain } from "./urls";

/**
 * SEO data from DataForSEO v3 (docs.dataforseo.com/v3): search volume and CPC from
 * Google Ads, keyword difficulty and ideas from DataForSEO Labs, rankings from the
 * live Google organic SERP. Stateless like the AI providers: every call returns
 * what it cost (the `cost` field DataForSEO reports, USD → micro-USD) so callers
 * can meter it against the organization's budget.
 *
 * DataForSEO answers HTTP 200 for most failures and puts the real outcome in
 * `status_code` (20000 = ok) at the top level and per task; both are checked.
 */

export type KeywordMetric = {
	keyword: string;
	searchVolume: number | null;
	/** 0–100: how hard it is to reach Google's top 10. */
	difficulty: number | null;
	cpcUsd: number | null;
};

type Locale = { locationCode: number; languageCode: string };

type Task<R> = {
	status_code: number;
	status_message: string;
	cost?: number;
	result: R[] | null;
};
type Envelope<R> = {
	status_code: number;
	status_message: string;
	cost?: number;
	tasks?: Task<R>[] | null;
};

/** Google Ads search_volume: up to 1,000 keywords, each ≤ 80 chars and ≤ 10 words. */
const ADS_MAX_KEYWORDS = 1_000;
const ADS_MAX_CHARS = 80;
const ADS_MAX_WORDS = 10;
/** bulk_keyword_difficulty: up to 1,000 keywords per task. */
const DIFFICULTY_MAX_KEYWORDS = 1_000;
/** keyword_ideas: up to 200 seed keywords, up to 1,000 results. */
const IDEAS_MAX_SEEDS = 200;
const IDEAS_MAX_LIMIT = 1_000;
const SERP_MAX_DEPTH = 200;

/** DataForSEO's own status codes → what the caller should do. */
function kindFromStatusCode(code: number): AiErrorKind {
	if (code >= 40100 && code < 40200) return "not_configured"; // credentials, verification, IP whitelist
	if (code === 40202) return "rate_limited";
	if (code === 40203) return "rate_limited"; // daily cost limit — try again tomorrow
	if (code >= 40200 && code < 40300) return "not_configured"; // balance / payment: the operator must top up
	if (code >= 50000) return "transient";
	return "invalid_request";
}

const cleanKeyword = (k: string) => k.trim().replace(/\s+/g, " ").toLowerCase();

function chunk<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export class DataForSeo {
	private readonly authorization: string;
	private readonly fetch: typeof fetch;
	private readonly baseURL: string;

	constructor(opts: { login: string; password: string; fetch?: typeof fetch; baseURL?: string }) {
		this.authorization = `Basic ${Buffer.from(`${opts.login}:${opts.password}`).toString("base64")}`;
		this.fetch = opts.fetch ?? fetch;
		this.baseURL = (opts.baseURL ?? "https://api.dataforseo.com").replace(/\/+$/, "");
	}

	/**
	 * Volume + CPC (Google Ads) and difficulty (Labs) for known keywords, in input
	 * order. Keywords Google Ads rejects (too long / too many words) still get their
	 * difficulty; unknown values are null, never 0.
	 */
	async keywordMetrics(
		keywords: string[],
		opts: Locale,
	): Promise<{ items: KeywordMetric[]; costMicros: number }> {
		const unique = [...new Set(keywords.map(cleanKeyword).filter(Boolean))];
		if (!unique.length) return { items: [], costMicros: 0 };
		let costMicros = 0;
		const volume = new Map<string, { searchVolume: number | null; cpcUsd: number | null }>();
		const difficulty = new Map<string, number | null>();

		const adsEligible = unique.filter(
			(k) => k.length <= ADS_MAX_CHARS && k.split(" ").length <= ADS_MAX_WORDS,
		);
		for (const batch of chunk(adsEligible, ADS_MAX_KEYWORDS)) {
			const res = await this.post<{
				keyword?: string;
				search_volume?: number | null;
				cpc?: number | null;
			}>("/v3/keywords_data/google_ads/search_volume/live", {
				keywords: batch,
				location_code: opts.locationCode,
				language_code: opts.languageCode,
			});
			costMicros += res.costMicros;
			for (const row of res.results) {
				if (!row.keyword) continue;
				volume.set(cleanKeyword(row.keyword), {
					searchVolume: num(row.search_volume),
					cpcUsd: num(row.cpc),
				});
			}
		}

		for (const batch of chunk(unique, DIFFICULTY_MAX_KEYWORDS)) {
			const res = await this.post<{
				items?: { keyword?: string; keyword_difficulty?: number | null }[] | null;
			}>("/v3/dataforseo_labs/google/bulk_keyword_difficulty/live", {
				keywords: batch,
				location_code: opts.locationCode,
				language_code: opts.languageCode,
			});
			costMicros += res.costMicros;
			for (const result of res.results) {
				for (const item of result.items ?? []) {
					if (item.keyword)
						difficulty.set(cleanKeyword(item.keyword), num(item.keyword_difficulty));
				}
			}
		}

		return {
			items: unique.map((keyword) => ({
				keyword,
				searchVolume: volume.get(keyword)?.searchVolume ?? null,
				difficulty: difficulty.get(keyword) ?? null,
				cpcUsd: volume.get(keyword)?.cpcUsd ?? null,
			})),
			costMicros,
		};
	}

	/** Related keywords people search for, with metrics, from DataForSEO Labs. */
	async keywordIdeas(
		seeds: string[],
		opts: Locale & { limit?: number },
	): Promise<{ items: KeywordMetric[]; costMicros: number }> {
		const unique = [...new Set(seeds.map(cleanKeyword).filter(Boolean))].slice(0, IDEAS_MAX_SEEDS);
		if (!unique.length) return { items: [], costMicros: 0 };
		const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? 100)), IDEAS_MAX_LIMIT);
		const res = await this.post<{
			items?:
				| {
						keyword?: string;
						keyword_info?: { search_volume?: number | null; cpc?: number | null } | null;
						keyword_properties?: { keyword_difficulty?: number | null } | null;
				  }[]
				| null;
		}>("/v3/dataforseo_labs/google/keyword_ideas/live", {
			keywords: unique,
			location_code: opts.locationCode,
			language_code: opts.languageCode,
			limit,
		});
		const seen = new Set<string>();
		const items: KeywordMetric[] = [];
		for (const result of res.results) {
			for (const item of result.items ?? []) {
				if (!item.keyword) continue;
				const keyword = cleanKeyword(item.keyword);
				if (seen.has(keyword)) continue;
				seen.add(keyword);
				items.push({
					keyword,
					searchVolume: num(item.keyword_info?.search_volume),
					difficulty: num(item.keyword_properties?.keyword_difficulty),
					cpcUsd: num(item.keyword_info?.cpc),
				});
			}
		}
		return { items: items.slice(0, limit), costMicros: res.costMicros };
	}

	/**
	 * Where `domain` ranks in Google's organic results for `keyword` (subdomains
	 * count as the domain). Billed per 10 results, so the default depth is 20 —
	 * page two is still worth knowing about, beyond that rarely.
	 */
	async serpPosition(
		keyword: string,
		domain: string,
		opts: Locale & { depth?: number },
	): Promise<{ position: number | null; url: string | null; costMicros: number }> {
		const target = normalizeDomain(domain);
		if (!target)
			throw new AiError("invalid_request", `Not a domain: ${domain}`, { provider: "dataforseo" });
		const depth = Math.min(Math.max(1, Math.floor(opts.depth ?? 20)), SERP_MAX_DEPTH);
		const res = await this.post<{
			items?: { type?: string; rank_group?: number; url?: string; domain?: string }[] | null;
		}>("/v3/serp/google/organic/live/advanced", {
			keyword: cleanKeyword(keyword),
			location_code: opts.locationCode,
			language_code: opts.languageCode,
			depth,
		});
		let best: { position: number; url: string } | null = null;
		for (const result of res.results) {
			for (const item of result.items ?? []) {
				if (item.type !== "organic" || typeof item.rank_group !== "number") continue;
				let host = item.domain ?? "";
				if (!host && item.url) {
					try {
						host = new URL(item.url).hostname;
					} catch {
						continue;
					}
				}
				if (!host || !hostBelongsTo(host, target)) continue;
				if (!best || item.rank_group < best.position)
					best = { position: item.rank_group, url: item.url ?? "" };
			}
		}
		return { position: best?.position ?? null, url: best?.url || null, costMicros: res.costMicros };
	}

	/** One live task per request; returns its results and what the request cost. */
	private async post<R>(path: string, task: Record<string, unknown>) {
		let res: Response;
		try {
			res = await this.fetch(`${this.baseURL}${path}`, {
				method: "POST",
				headers: { authorization: this.authorization, "content-type": "application/json" },
				body: JSON.stringify([task]),
				// Live endpoints can take up to 120 s on DataForSEO's side.
				signal: AbortSignal.timeout(130_000),
			});
		} catch (error) {
			throw new AiError(
				"transient",
				"Could not reach DataForSEO",
				{ provider: "dataforseo" },
				{ cause: error },
			);
		}
		let body: Envelope<R> | null = null;
		try {
			body = (await res.json()) as Envelope<R>;
		} catch {
			body = null;
		}
		if (!res.ok && !body?.status_code) {
			throw new AiError(kindFromStatus(res.status), `DataForSEO answered HTTP ${res.status}`, {
				provider: "dataforseo",
				status: res.status,
			});
		}
		if (!body) {
			throw new AiError("invalid_output", "DataForSEO returned an unreadable response", {
				provider: "dataforseo",
			});
		}
		const costMicros = usdToMicros(num(body.cost) ?? 0);
		if (body.status_code !== 20000) throw this.statusError(body.status_code, body.status_message);
		const t = body.tasks?.[0];
		if (!t) {
			throw new AiError("invalid_output", "DataForSEO returned no task", {
				provider: "dataforseo",
			});
		}
		// 20000 = ok; per-task failures (bad location, invalid keyword) are reported here.
		if (t.status_code !== 20000) throw this.statusError(t.status_code, t.status_message);
		return { results: t.result ?? [], costMicros };
	}

	private statusError(code: number, message: string) {
		return new AiError(kindFromStatusCode(code), `DataForSEO: ${message} (${code})`, {
			provider: "dataforseo",
			status: code,
		});
	}
}

export function createDataForSeo(env: {
	DATAFORSEO_LOGIN: string;
	DATAFORSEO_PASSWORD: string;
}): DataForSeo | null {
	if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) return null;
	return new DataForSeo({ login: env.DATAFORSEO_LOGIN, password: env.DATAFORSEO_PASSWORD });
}
