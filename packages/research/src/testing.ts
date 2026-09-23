import { AiError } from "@socialfly/ai";
import type { DataForSeo, KeywordMetric } from "./seo";
import type { EngineAnswer, VisibilityEngine, VisibilityEngineId } from "./visibility";

/**
 * Deterministic stand-ins for the api and worker test suites: no network, no keys,
 * no cost. Same pattern as @socialfly/ai/testing — queue a response per call; every
 * request is recorded so tests can assert on what would have been sent.
 */

export class FakeVisibilityEngine implements VisibilityEngine {
	readonly model: string;
	readonly prompts: string[] = [];
	private readonly queue: (Partial<EngineAnswer> | Error)[] = [];

	constructor(readonly id: VisibilityEngineId = "claude") {
		this.model = `fake:${id}`;
	}

	/** Next `ask` returns this answer (defaults fill the rest) or throws it. */
	reply(answer: Partial<EngineAnswer> | Error) {
		this.queue.push(answer);
		return this;
	}

	async ask(prompt: string): Promise<EngineAnswer> {
		this.prompts.push(prompt);
		const next = this.queue.shift();
		if (next === undefined) throw new Error(`FakeVisibilityEngine(${this.id}): no reply queued`);
		if (next instanceof Error) throw next;
		return { answer: "", citations: [], model: this.model, costMicros: 12_000, ...next };
	}
}

type SeoCall =
	| { method: "keywordMetrics"; keywords: string[]; opts: unknown }
	| { method: "keywordIdeas"; seeds: string[]; opts: unknown }
	| { method: "serpPosition"; keyword: string; domain: string; opts: unknown };

/**
 * Same public methods as DataForSeo. Metrics come from `metrics` (unknown keywords
 * get nulls), ideas and positions are queued; `failNext` makes the next call throw.
 */
export class FakeDataForSeo
	implements Pick<DataForSeo, "keywordMetrics" | "keywordIdeas" | "serpPosition">
{
	readonly calls: SeoCall[] = [];
	readonly metrics = new Map<string, Omit<KeywordMetric, "keyword">>();
	private readonly ideas: KeywordMetric[][] = [];
	private readonly positions: { position: number | null; url: string | null }[] = [];
	private readonly failures: Error[] = [];

	setMetric(keyword: string, metric: Omit<KeywordMetric, "keyword">) {
		this.metrics.set(keyword.trim().toLowerCase(), metric);
		return this;
	}
	replyIdeas(items: KeywordMetric[]) {
		this.ideas.push(items);
		return this;
	}
	replyPosition(position: number | null, url: string | null = null) {
		this.positions.push({ position, url });
		return this;
	}
	failNext(error: Error = new AiError("transient", "fake DataForSEO failure")) {
		this.failures.push(error);
		return this;
	}

	private maybeFail() {
		const failure = this.failures.shift();
		if (failure) throw failure;
	}

	async keywordMetrics(keywords: string[], opts: { locationCode: number; languageCode: string }) {
		this.calls.push({ method: "keywordMetrics", keywords, opts });
		this.maybeFail();
		const unique = [...new Set(keywords.map((k) => k.trim().toLowerCase()).filter(Boolean))];
		return {
			items: unique.map((keyword) => ({
				keyword,
				...(this.metrics.get(keyword) ?? { searchVolume: null, difficulty: null, cpcUsd: null }),
			})),
			costMicros: unique.length ? 1_000 : 0,
		};
	}

	async keywordIdeas(
		seeds: string[],
		opts: { locationCode: number; languageCode: string; limit?: number },
	) {
		this.calls.push({ method: "keywordIdeas", seeds, opts });
		this.maybeFail();
		const items = this.ideas.shift() ?? [];
		return { items: items.slice(0, opts.limit ?? items.length), costMicros: 10_000 };
	}

	async serpPosition(
		keyword: string,
		domain: string,
		opts: { locationCode: number; languageCode: string; depth?: number },
	) {
		this.calls.push({ method: "serpPosition", keyword, domain, opts });
		this.maybeFail();
		const next = this.positions.shift() ?? { position: null, url: null };
		return { ...next, costMicros: 2_000 };
	}
}

type FakePage =
	| string
	| {
			status?: number;
			html?: string;
			/** Redirect target for 3xx statuses. */
			location?: string;
			contentType?: string;
	  };

export type FakeSiteFetch = typeof fetch & {
	/** Every URL requested, in order. */
	requests: string[];
};

/**
 * A website in memory, as a `fetch` implementation for crawler tests. Keys are
 * paths ("/about") served on any host, or absolute URLs ("https://other.com/x")
 * for one host only. Unknown URLs are 404s; `robots` and `sitemap` serve
 * /robots.txt and /sitemap.xml (other sitemaps are ordinary entries with an XML
 * content type).
 */
export function fakeSite(
	pages: Record<string, FakePage>,
	opts: { robots?: string; sitemap?: string } = {},
): FakeSiteFetch {
	const requests: string[] = [];
	const impl = async (input: string | URL | Request, _init?: RequestInit) => {
		const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
		requests.push(href);
		const url = new URL(href);
		const path = `${url.pathname}${url.search}`;
		if (path === "/robots.txt" && opts.robots !== undefined && !(url.href in pages)) {
			return new Response(opts.robots, { headers: { "content-type": "text/plain" } });
		}
		if (path === "/sitemap.xml" && opts.sitemap !== undefined && !(url.href in pages)) {
			return new Response(opts.sitemap, { headers: { "content-type": "application/xml" } });
		}
		const page = pages[`${url.origin}${path}`] ?? pages[path];
		if (page === undefined) {
			return new Response("<html><body>Not found</body></html>", {
				status: 404,
				headers: { "content-type": "text/html" },
			});
		}
		const spec = typeof page === "string" ? { html: page } : page;
		const status = spec.status ?? 200;
		const headers = new Headers({ "content-type": spec.contentType ?? "text/html; charset=utf-8" });
		if (spec.location) headers.set("location", spec.location);
		return new Response(status >= 300 && status < 400 ? null : (spec.html ?? ""), {
			status,
			headers,
		});
	};
	return Object.assign(impl, { requests, preconnect: () => {} }) as unknown as FakeSiteFetch;
}
