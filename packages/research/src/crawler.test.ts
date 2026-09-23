import { describe, expect, test } from "bun:test";
import { AiError } from "@socialfly/ai";
import { crawlSite } from "./crawler";
import { decodeEntities, parseHtml, parseSitemap } from "./html";
import { parseRobots } from "./robots";
import { fakeSite } from "./testing";
import { cleanUrl, pageKey, registrableDomain } from "./urls";

const UA = "SocialFlyBot/1.0 (+https://example.org/bot)";
const page = (title: string, body: string) =>
	`<html><head><title>${title}</title></head><body>${body}</body></html>`;

describe("urls", () => {
	test("cleanUrl strips fragments, tracking params and sorts the rest", () => {
		expect(cleanUrl("https://Acme.com:443/a?utm_source=x&b=2&gclid=1&a=1#top")?.href).toBe(
			"https://acme.com/a?a=1&b=2",
		);
		expect(cleanUrl("mailto:hi@acme.com")).toBeNull();
		expect(cleanUrl("javascript:void(0)")).toBeNull();
		expect(cleanUrl("/x", "https://acme.com/a/b")?.href).toBe("https://acme.com/x");
	});

	test("pageKey treats www, trailing slash and scheme as the same page", () => {
		const a = cleanUrl("https://www.acme.com/about/") as URL;
		const b = cleanUrl("http://acme.com/about") as URL;
		expect(pageKey(a)).toBe(pageKey(b));
		expect(pageKey(cleanUrl("https://acme.com/") as URL)).toBe("acme.com/");
	});

	test("registrableDomain handles multi-label suffixes", () => {
		expect(registrableDomain("blog.shop.acme.co.uk")).toBe("acme.co.uk");
		expect(registrableDomain("www.acme.com")).toBe("acme.com");
		expect(registrableDomain("docs.acme.com")).toBe("acme.com");
	});
});

describe("robots", () => {
	test("our group beats *, longest match wins, Allow wins ties, wildcards and $", () => {
		const robots = parseRobots(
			[
				"User-agent: *",
				"Disallow: /",
				"",
				"User-agent: SocialFlyBot",
				"User-agent: otherbot",
				"Disallow: /private",
				"Allow: /private/public",
				"Disallow: /*.pdf$",
				"Disallow: /tmp/",
				"Allow: /tmp/",
				"Crawl-delay: 2",
				"Sitemap: https://acme.com/sm.xml",
			].join("\n"),
			UA,
		);
		expect(robots.isAllowed("/")).toBe(true);
		expect(robots.isAllowed("/private/x")).toBe(false);
		expect(robots.isAllowed("/private/public/y")).toBe(true);
		expect(robots.isAllowed("/files/a.pdf")).toBe(false);
		expect(robots.isAllowed("/files/a.pdf?x=1")).toBe(true);
		expect(robots.isAllowed("/tmp/a")).toBe(true);
		expect(robots.crawlDelay).toBe(2);
		expect(robots.sitemaps).toEqual(["https://acme.com/sm.xml"]);
	});

	test("falls back to * when no group names us; empty Disallow allows all", () => {
		const robots = parseRobots(
			"User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow:\n",
			UA,
		);
		expect(robots.isAllowed("/anything")).toBe(true);
	});
});

describe("html", () => {
	test("extracts title, description, headings, text and links; skips chrome", () => {
		const parsed = parseHtml(
			`<html><head><title>Acme &amp; Co</title><meta name="description" content="We make &quot;anvils&quot;"><style>.x{}</style></head>
			<body><header><a href="/login">Log in</a> Top bar</header><nav><a href="/menu">Menu</a></nav>
			<main><h1>Anvils <em>for</em> everyone</h1><p>Caf&eacute; strength.</p><p>Second&nbsp;para<br>line</p>
			<script>var hidden = 1</script><noscript>enable js</noscript><svg><text>svg text</text></svg>
			<a href="/pricing#plans">Pricing</a> <a href="https://other.com/x" rel="nofollow">x</a></main>
			<footer>Footer text</footer></body></html>`,
			"https://acme.com/",
		);
		expect(parsed.title).toBe("Acme & Co");
		expect(parsed.description).toBe('We make "anvils"');
		expect(parsed.headings).toEqual(["Anvils for everyone"]);
		expect(parsed.text).toBe("Anvils for everyone Café strength. Second para line Pricing x");
		// Navigation links still count for discovery, even though nav text is skipped.
		expect(parsed.links).toEqual([
			"https://acme.com/login",
			"https://acme.com/menu",
			"https://acme.com/pricing",
		]);
	});

	test("decodes numeric entities", () => {
		expect(decodeEntities("it&#39;s &#x2014; ok &unknown;")).toBe("it's — ok &unknown;");
	});

	test("reads sitemaps and sitemap indexes", () => {
		expect(parseSitemap("<urlset><url><loc> https://a.com/x </loc></url></urlset>")).toEqual({
			isIndex: false,
			locations: ["https://a.com/x"],
		});
		expect(
			parseSitemap(
				"<sitemapindex><sitemap><loc>https://a.com/s1.xml</loc></sitemap></sitemapindex>",
			).isIndex,
		).toBe(true);
	});
});

describe("crawlSite", () => {
	test("home first, then links and sitemap pages; stays on-site; skips assets", async () => {
		const fetch = fakeSite(
			{
				"/": page(
					"Home",
					'<a href="/about">About</a><a href="https://other.com/x">Other</a><a href="https://blog.acme.com/">Blog</a><a href="/brochure.pdf">PDF</a><a href="/about/?utm_source=nav">About again</a>',
				),
				"/about": page("About", "<p>We are Acme.</p>"),
				"/from-sitemap": page("Sitemap page", '<p>Deep</p><a href="/">Home</a>'),
			},
			{
				sitemap:
					"<urlset><url><loc>https://acme.com/from-sitemap</loc></url><url><loc>https://other.com/nope</loc></url></urlset>",
			},
		);
		const progress: number[] = [];
		const result = await crawlSite("acme.com", {
			maxPages: 10,
			userAgent: UA,
			fetch,
			onPage: (_p, prog) => {
				progress.push(prog.crawled);
			},
		});

		expect(result.blockedByRobots).toBe(false);
		expect(result.pages.map((p) => p.url)).toEqual([
			"https://acme.com/",
			"https://acme.com/about",
			"https://acme.com/from-sitemap",
		]);
		expect(result.pages[1]).toMatchObject({
			statusCode: 200,
			title: "About",
			text: "We are Acme.",
			wordCount: 3,
		});
		expect(progress).toEqual([1, 2, 3]);
		expect(result.pagesFound).toBe(3);
		expect(fetch.requests.some((u) => u.includes("other.com") || u.includes("blog.acme.com"))).toBe(
			false,
		);
		expect(fetch.requests.some((u) => u.endsWith(".pdf"))).toBe(false);
	});

	test("robots.txt disallowing the start page → blockedByRobots, no pages", async () => {
		const fetch = fakeSite({ "/": page("Home", "hi") }, { robots: "User-agent: *\nDisallow: /" });
		const result = await crawlSite("https://acme.com", { maxPages: 5, userAgent: UA, fetch });
		expect(result).toEqual({ pages: [], pagesFound: 0, blockedByRobots: true });
		expect(fetch.requests).toEqual(["https://acme.com/robots.txt"]);
	});

	test("disallowed paths are never requested; a robots.txt server error blocks everything", async () => {
		const fetch = fakeSite(
			{
				"/": page("Home", '<a href="/private/a">p</a><a href="/ok">ok</a>'),
				"/ok": page("OK", "fine"),
				"/private/a": page("P", "secret"),
			},
			{ robots: "User-agent: *\nDisallow: /private" },
		);
		const result = await crawlSite("https://acme.com", { maxPages: 5, userAgent: UA, fetch });
		expect(result.pages.map((p) => p.title)).toEqual(["Home", "OK"]);
		expect(fetch.requests.some((u) => u.includes("/private"))).toBe(false);

		const broken = fakeSite({ "/": page("Home", "hi"), "/robots.txt": { status: 503, html: "" } });
		const blocked = await crawlSite("https://acme.com", {
			maxPages: 5,
			userAgent: UA,
			fetch: broken,
		});
		expect(blocked.blockedByRobots).toBe(true);
	});

	test("sitemap index (one level) seeds the crawl", async () => {
		// The index itself is registered under its absolute URL.
		const withIndex = fakeSite(
			{
				"https://acme.com/sitemap_index.xml": {
					contentType: "application/xml",
					html: "<sitemapindex><sitemap><loc>https://acme.com/sm-1.xml</loc></sitemap><sitemap><loc>https://acme.com/sm-2.xml</loc></sitemap></sitemapindex>",
				},
				"/": page("Home", "home"),
				"/a": page("A", "a"),
				"/b": page("B", "b"),
				"/sm-1.xml": {
					contentType: "application/xml",
					html: "<urlset><url><loc>https://acme.com/a</loc></url></urlset>",
				},
				"/sm-2.xml": {
					contentType: "application/xml",
					html: "<urlset><url><loc>https://www.acme.com/b</loc></url></urlset>",
				},
			},
			{ robots: "User-agent: *\nAllow: /\nSitemap: https://acme.com/sitemap_index.xml" },
		);
		const result = await crawlSite("https://acme.com", {
			maxPages: 10,
			userAgent: UA,
			fetch: withIndex,
		});
		expect(result.pages.map((p) => p.title).sort()).toEqual(["A", "B", "Home"]);
	});

	test("follows on-site redirects, records the final URL, refuses off-site ones", async () => {
		const fetch = fakeSite({
			"http://acme.com/": { status: 301, location: "https://acme.com/" },
			"https://acme.com/": { status: 301, location: "https://www.acme.com/" },
			"https://www.acme.com/": page(
				"Home",
				'<a href="/old">old</a><a href="/away">away</a><a href="/new">dup</a>',
			),
			"/old": { status: 301, location: "/new" },
			"/new": page("New", "moved here"),
			"/away": { status: 302, location: "https://elsewhere.com/landing" },
		});
		const result = await crawlSite("http://acme.com", { maxPages: 10, userAgent: UA, fetch });
		expect(result.pages.map((p) => p.url)).toEqual([
			"https://www.acme.com/",
			"https://www.acme.com/new",
		]);
		expect(fetch.requests.some((u) => u.includes("elsewhere.com"))).toBe(false);
	});

	test("the start URL may redirect to a new domain; the crawl follows it", async () => {
		const fetch = fakeSite({
			"https://old.com/": { status: 301, location: "https://new.com/" },
			"https://new.com/": page(
				"New home",
				'<a href="/about">a</a><a href="https://old.com/x">x</a>',
			),
			"https://new.com/about": page("About", "about"),
		});
		const result = await crawlSite("https://old.com", { maxPages: 10, userAgent: UA, fetch });
		expect(result.pages.map((p) => p.url)).toEqual(["https://new.com/", "https://new.com/about"]);
		expect(fetch.requests).toContain("https://new.com/robots.txt");
	});

	test("maxPages caps the crawl; broken pages are recorded but never fatal", async () => {
		const links = Array.from({ length: 20 }, (_, i) => `<a href="/p${i}">${i}</a>`).join("");
		const pages: Record<string, string | { status: number; html: string }> = {
			"/": page("Home", `<a href="/gone">gone</a>${links}`),
			"/gone": { status: 404, html: "nope" },
		};
		for (let i = 0; i < 20; i++) pages[`/p${i}`] = page(`P${i}`, `page ${i}`);
		const fetch = fakeSite(pages);
		const result = await crawlSite("https://acme.com", { maxPages: 5, userAgent: UA, fetch });
		expect(result.pages).toHaveLength(5);
		expect(result.pages[1]).toMatchObject({
			url: "https://acme.com/gone",
			statusCode: 404,
			text: "",
		});
		expect(result.pagesFound).toBe(22);
	});

	test("non-HTML responses are skipped; text is capped at 20k characters", async () => {
		const long = "word ".repeat(10_000);
		const fetch = fakeSite({
			"/": page("Home", `<p>${long}</p><a href="/data">data</a>`),
			"/data": { contentType: "application/json", html: "{}" },
		});
		const result = await crawlSite("https://acme.com", { maxPages: 5, userAgent: UA, fetch });
		expect(result.pages).toHaveLength(1);
		expect(result.pages[0]?.text.length).toBe(20_000);
		// Counted before the cap: 10,000 words + the link text.
		expect(result.pages[0]?.wordCount).toBe(10_001);
	});

	test("an unreachable or failing start URL throws invalid_request", async () => {
		const down = Object.assign(
			async () => {
				throw new TypeError("fetch failed");
			},
			{ preconnect: () => {} },
		) as unknown as typeof fetch;
		const error = await crawlSite("https://acme.com", {
			maxPages: 5,
			userAgent: UA,
			fetch: down,
		}).catch((e) => e);
		expect(error).toBeInstanceOf(AiError);
		expect((error as AiError).kind).toBe("invalid_request");

		const notFound = fakeSite({});
		const e2 = (await crawlSite("https://acme.com", {
			maxPages: 5,
			userAgent: UA,
			fetch: notFound,
		}).catch((e) => e)) as AiError;
		expect(e2.kind).toBe("invalid_request");

		const e3 = (await crawlSite("not a url", { maxPages: 5, userAgent: UA, fetch: notFound }).catch(
			(e) => e,
		)) as AiError;
		expect(e3.kind).toBe("invalid_request");
	});

	test("honours Crawl-delay between requests", async () => {
		const fetch = fakeSite(
			{
				"/": page("Home", '<a href="/a">a</a><a href="/b">b</a>'),
				"/a": page("A", "a"),
				"/b": page("B", "b"),
			},
			{ robots: "User-agent: *\nCrawl-delay: 0.1" },
		);
		const started = Date.now();
		const result = await crawlSite("https://acme.com", { maxPages: 3, userAgent: UA, fetch });
		expect(result.pages).toHaveLength(3);
		// Home, sitemap probe, /a, /b are paced: at least three gaps of 100 ms.
		expect(Date.now() - started).toBeGreaterThanOrEqual(290);
	});

	test("sends our user agent", async () => {
		const seen: string[] = [];
		const base = fakeSite({ "/": page("Home", "hi") });
		const spy = Object.assign(
			async (input: string, init?: RequestInit) => {
				seen.push(new Headers(init?.headers).get("user-agent") ?? "");
				return base(input, init);
			},
			{ preconnect: () => {} },
		) as unknown as typeof fetch;
		await crawlSite("https://acme.com", { maxPages: 1, userAgent: UA, fetch: spy });
		expect(seen.every((ua) => ua === UA)).toBe(true);
	});
});
