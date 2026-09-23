import { AiError } from "@socialfly/ai";
import { parseHtml, parseSitemap } from "./html";
import { assertPublicHost } from "./net-guard";
import { ALLOW_ALL, DISALLOW_ALL, parseRobots, type Robots } from "./robots";
import { cleanUrl, pageKey, siteHost } from "./urls";

/**
 * A polite same-site crawler for brand research: plain HTTP + Bun's HTMLRewriter,
 * no browser. Pages that need JavaScript to render show up thin — acceptable for
 * understanding what a business says about itself, and far cheaper and safer than
 * running a headless browser against arbitrary URLs.
 *
 * Politeness: robots.txt (RFC 9309) is obeyed, Crawl-delay honoured up to 5 s, at
 * most 2 requests in flight, a per-request timeout, and a hard page cap.
 */

export type CrawledPage = {
	url: string;
	statusCode: number;
	title: string | null;
	description: string | null;
	headings: string[];
	text: string;
	wordCount: number;
};

export type CrawlOptions = {
	maxPages: number;
	userAgent: string;
	timeoutMs?: number;
	signal?: AbortSignal;
	fetch?: typeof fetch;
	/**
	 * Skip the SSRF guard (private/internal addresses). Only for local development
	 * against your own machine. The guard is also skipped when `fetch` is injected:
	 * tests use fake sites whose hostnames never resolve.
	 */
	allowPrivateNetwork?: boolean;
	onPage?: (
		page: CrawledPage,
		progress: { crawled: number; found: number },
	) => Promise<void> | void;
};

export type CrawlResult = { pages: CrawledPage[]; pagesFound: number; blockedByRobots: boolean };

const MAX_TEXT_CHARS = 20_000;
const MAX_BODY_BYTES = 5_000_000;
const MAX_REDIRECTS = 5;
const MAX_CONCURRENCY = 2;
const MAX_CRAWL_DELAY_S = 5;
/** Bounds memory on sites with enormous sitemaps; the page cap is far lower anyway. */
const MAX_QUEUED = 5_000;
const MAX_CHILD_SITEMAPS = 10;

/** Files, not pages: never worth a request. */
const ASSET_EXTENSIONS = new Set(
	(
		"pdf doc docx xls xlsx ppt pptx odt csv txt rtf zip gz tgz rar 7z tar bz2 dmg exe msi apk iso bin " +
		"jpg jpeg png gif webp avif bmp tif tiff ico svg heic psd ai eps " +
		"mp3 wav ogg m4a flac aac mp4 m4v mov avi wmv webm mkv flv " +
		"css js mjs map json xml rss atom woff woff2 ttf otf eot"
	).split(" "),
);

function isAssetPath(pathname: string): boolean {
	const dot = pathname.lastIndexOf(".");
	if (dot < 0 || dot < pathname.lastIndexOf("/")) return false;
	return ASSET_EXTENSIONS.has(pathname.slice(dot + 1).toLowerCase());
}

const isHtml = (contentType: string | null) =>
	!contentType || /text\/html|application\/xhtml\+xml/i.test(contentType);

type Fetched = { response: Response; url: URL };

export async function crawlSite(startUrl: string, opts: CrawlOptions): Promise<CrawlResult> {
	const doFetch = opts.fetch ?? fetch;
	const timeoutMs = opts.timeoutMs ?? 15_000;
	const maxPages = Math.max(1, Math.floor(opts.maxPages));

	const start = parseStartUrl(startUrl);
	opts.signal?.throwIfAborted();

	// Checked once per host per crawl; every redirect hop goes through request(), so a
	// public site cannot bounce us to an internal address either.
	const guardHosts = !opts.fetch && !opts.allowPrivateNetwork;
	const vettedHosts = new Map<string, Promise<void>>();

	/** One request, no redirect following — redirects are checked hop by hop. */
	const request = async (url: URL, accept: string) => {
		if (guardHosts) {
			let vetted = vettedHosts.get(url.hostname);
			if (!vetted) {
				vetted = assertPublicHost(url.hostname);
				vettedHosts.set(url.hostname, vetted);
			}
			await vetted;
		}
		const signals = [AbortSignal.timeout(timeoutMs)];
		if (opts.signal) signals.push(opts.signal);
		const response = await doFetch(url.href, {
			redirect: "manual",
			headers: { "user-agent": opts.userAgent, accept },
			signal: AbortSignal.any(signals),
		});
		return response;
	};

	const loadRobots = async (origin: URL): Promise<Robots> => {
		try {
			const res = await fetchFollowing(
				new URL("/robots.txt", origin),
				"text/plain,*/*",
				request,
				() => true,
			);
			if (res && res.response.status >= 200 && res.response.status < 300) {
				return parseRobots(await readText(res.response, 500_000), opts.userAgent);
			}
			await res?.response.body?.cancel();
			// RFC 9309 §2.3.1.4: a server error on robots.txt means "disallow all";
			// 4xx (usually 404) means there is no robots.txt and everything is allowed.
			return res && res.response.status >= 500 ? DISALLOW_ALL : ALLOW_ALL;
		} catch {
			if (opts.signal?.aborted) throw opts.signal.reason;
			// Unreachable: the start page fetch below reports the real problem.
			return ALLOW_ALL;
		}
	};

	let robots = await loadRobots(start);
	const pathOf = (u: URL) => `${u.pathname}${u.search}`;
	if (!robots.isAllowed(pathOf(start))) {
		return { pages: [], pagesFound: 0, blockedByRobots: true };
	}

	let siteKey = siteHost(start.hostname);
	const onSite = (u: URL) => siteHost(u.hostname) === siteKey;
	const crawlable = (u: URL) =>
		onSite(u) && !isAssetPath(u.pathname) && robots.isAllowed(pathOf(u));

	// ── Pacing: at most 2 in flight, and Crawl-delay between request starts ──
	let nextSlot = 0;
	const paced = async <T>(fn: () => Promise<T>) => {
		const delayMs = Math.min(robots.crawlDelay ?? 0, MAX_CRAWL_DELAY_S) * 1000;
		if (delayMs > 0) {
			const now = Date.now();
			const at = Math.max(now, nextSlot);
			nextSlot = at + delayMs;
			if (at > now) await sleep(at - now, opts.signal);
		}
		return fn();
	};

	const pages: CrawledPage[] = [];
	const seen = new Set<string>();
	const crawled = new Set<string>();
	const queue: URL[] = [];
	const enqueue = (u: URL) => {
		const key = pageKey(u);
		if (seen.has(key) || !crawlable(u) || seen.size >= MAX_QUEUED) return;
		seen.add(key);
		queue.push(u);
	};

	const record = async (page: CrawledPage) => {
		pages.push(page);
		await opts.onPage?.(page, { crawled: pages.length, found: seen.size });
	};

	// ── Home page first: it must work, or the job fails with a clear reason ──
	seen.add(pageKey(start));
	let home: Awaited<ReturnType<typeof fetchPage>>;
	try {
		home = await fetchPage(start, true);
	} catch (error) {
		if (opts.signal?.aborted) throw opts.signal.reason;
		if (error instanceof AiError) throw error;
		throw new AiError(
			"invalid_request",
			`Could not reach ${start.origin}`,
			{ provider: "crawler" },
			{ cause: error },
		);
	}
	if (home === "blocked") return { pages: [], pagesFound: 0, blockedByRobots: true };
	if (!home) {
		throw new AiError("invalid_request", `${start.origin} did not return a web page`, {
			provider: "crawler",
		});
	}
	if (home.page.statusCode >= 400) {
		throw new AiError(
			"invalid_request",
			`${start.origin} answered with HTTP ${home.page.statusCode}`,
			{ provider: "crawler", status: home.page.statusCode },
		);
	}
	await record(home.page);

	// Links on the home page are usually the pages that matter most (about, pricing,
	// product), so they go ahead of the sitemap's long tail.
	for (const link of home.links) {
		const u = cleanUrl(link);
		if (u) enqueue(u);
	}
	if (pages.length < maxPages) {
		for (const u of await sitemapUrls()) enqueue(u);
	}

	// ── BFS, two workers ──
	const worker = async () => {
		while (pages.length < maxPages) {
			const next = queue.shift();
			if (!next) return;
			opts.signal?.throwIfAborted();
			let result: Awaited<ReturnType<typeof fetchPage>>;
			try {
				result = await fetchPage(next, false);
			} catch {
				if (opts.signal?.aborted) throw opts.signal.reason;
				continue; // one bad page never fails the crawl
			}
			if (!result || result === "blocked" || pages.length >= maxPages) continue;
			await record(result.page);
			for (const link of result.links) {
				const u = cleanUrl(link);
				if (u) enqueue(u);
			}
		}
	};
	// Workers can idle while the other one is still discovering links, so re-run
	// until the queue is truly drained or the cap is hit.
	while (pages.length < maxPages && queue.length > 0) {
		await Promise.all(Array.from({ length: MAX_CONCURRENCY }, worker));
	}

	return { pages, pagesFound: seen.size, blockedByRobots: false };

	// ── helpers (hoisted; they close over the crawl state) ──

	async function fetchPage(url: URL, isStart: boolean) {
		const fetched = await paced(() =>
			fetchFollowing(url, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", request, (hop) => {
				// The start URL may redirect anywhere once (http→https, apex→www, a new
				// domain); the crawl then belongs to wherever it landed.
				if (isStart) return true;
				return crawlable(hop);
			}),
		);
		if (!fetched) return null;
		const { response, url: finalUrl } = fetched;
		if (isStart) {
			if (siteHost(finalUrl.hostname) !== siteKey) {
				// Landed on another domain: from here on the crawl belongs to it, rules included.
				siteKey = siteHost(finalUrl.hostname);
				robots = await loadRobots(finalUrl);
			}
			if (!robots.isAllowed(pathOf(finalUrl))) {
				await response.body?.cancel();
				return "blocked" as const;
			}
		}
		const finalKey = pageKey(finalUrl);
		if (response.status >= 300 && response.status < 400) {
			// Redirected off-site or into a disallowed path: not ours to crawl.
			await response.body?.cancel();
			return null;
		}
		if (crawled.has(finalKey)) {
			await response.body?.cancel();
			return null;
		}
		seen.add(finalKey);
		if (!isHtml(response.headers.get("content-type"))) {
			await response.body?.cancel();
			return null;
		}
		crawled.add(finalKey);
		const html = response.status < 400 ? await readText(response, MAX_BODY_BYTES) : "";
		if (response.status >= 400) await response.body?.cancel();
		const parsed = parseHtml(html, finalUrl.href);
		const words = parsed.text ? parsed.text.split(" ").length : 0;
		const page: CrawledPage = {
			url: finalUrl.href,
			statusCode: response.status,
			title: parsed.title,
			description: parsed.description,
			headings: parsed.headings,
			text: parsed.text.slice(0, MAX_TEXT_CHARS),
			wordCount: words,
		};
		return { page, links: parsed.links };
	}

	async function sitemapUrls(): Promise<URL[]> {
		const origin = cleanUrl("/", start) as URL;
		const roots = robots.sitemaps.length ? robots.sitemaps : [new URL("/sitemap.xml", origin).href];
		const found: URL[] = [];
		const load = async (href: string) => {
			const u = cleanUrl(href);
			if (!u || !onSite(u)) return null;
			try {
				const res = await paced(() =>
					fetchFollowing(u, "application/xml,text/xml;q=0.9,*/*;q=0.5", request, onSite),
				);
				if (res?.response.status !== 200) {
					await res?.response.body?.cancel();
					return null;
				}
				if (/\.gz$/i.test(res.url.pathname)) {
					await res.response.body?.cancel();
					return null;
				}
				return parseSitemap(await readText(res.response, 20_000_000));
			} catch {
				if (opts.signal?.aborted) throw opts.signal.reason;
				return null;
			}
		};
		for (const root of roots.slice(0, MAX_CHILD_SITEMAPS)) {
			const map = await load(root);
			if (!map) continue;
			const children = map.isIndex ? map.locations.slice(0, MAX_CHILD_SITEMAPS) : [];
			// Sitemap indexes: one level deep only.
			const sets = map.isIndex
				? await Promise.all(children.map(async (c) => (await load(c))?.locations ?? []))
				: [map.locations];
			for (const loc of sets.flat()) {
				const u = cleanUrl(loc);
				if (u) found.push(u);
				if (found.length >= MAX_QUEUED) return found;
			}
		}
		return found;
	}
}

function parseStartUrl(input: string): URL {
	const trimmed = input.trim();
	const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
	const url = cleanUrl(withScheme);
	if (!url?.hostname.includes(".") || isAssetPath(url.pathname)) {
		throw new AiError("invalid_request", `Not a website address: ${input}`, {
			provider: "crawler",
		});
	}
	return url;
}

/**
 * Follows redirects by hand so every hop can be vetted (on-site, allowed by
 * robots) before we request it. Returns the last response — a 3xx when a hop was
 * refused — or null when the chain is too long.
 */
async function fetchFollowing(
	url: URL,
	accept: string,
	request: (url: URL, accept: string) => Promise<Response>,
	allowHop: (url: URL) => boolean,
): Promise<Fetched | null> {
	let current = url;
	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		const response = await request(current, accept);
		const location = response.headers.get("location");
		if (response.status < 300 || response.status >= 400 || !location) {
			return { response, url: current };
		}
		const next = cleanUrl(location, current);
		if (!next || !allowHop(next)) return { response, url: current };
		await response.body?.cancel();
		current = next;
	}
	return null;
}

/** Reads a body as text, giving up past `maxBytes` (a crawler must not buffer a 2 GB file). */
async function readText(response: Response, maxBytes: number): Promise<string> {
	const length = Number(response.headers.get("content-length"));
	if (Number.isFinite(length) && length > maxBytes) {
		await response.body?.cancel();
		return "";
	}
	if (!response.body) return "";
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel();
			break;
		}
		chunks.push(value);
	}
	return new TextDecoder().decode(Buffer.concat(chunks));
}

function sleep(ms: number, signal?: AbortSignal) {
	return new Promise<void>((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				reject(signal.reason);
			},
			{ once: true },
		);
	});
}
