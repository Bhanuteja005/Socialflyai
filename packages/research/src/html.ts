import { cleanUrl } from "./urls";

/**
 * Page parsing on Bun's built-in HTMLRewriter (lol-html): a streaming parser, so a
 * crawl needs no browser and no DOM library. It hands over raw source text —
 * entities included — which is why `decodeEntities` exists.
 */

export type ParsedPage = {
	title: string | null;
	description: string | null;
	headings: string[];
	text: string;
	links: string[];
};

/** Chrome and boilerplate: repeated on every page and not what the page is about. */
const SKIPPED = "script, style, nav, footer, header, svg, noscript, template, iframe, head, select";

/** Elements that separate words; inline ones (a, span, strong…) must not add spaces. */
const BLOCKS =
	"p, div, li, ul, ol, dl, dt, dd, h1, h2, h3, h4, h5, h6, section, article, main, aside, blockquote, pre, table, tr, td, th, figcaption, label, button, form, fieldset, details, summary";

const NAMED_ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
	ndash: "–",
	mdash: "—",
	hellip: "…",
	lsquo: "‘",
	rsquo: "’",
	ldquo: "“",
	rdquo: "”",
	laquo: "«",
	raquo: "»",
	bull: "•",
	middot: "·",
	copy: "©",
	reg: "®",
	trade: "™",
	deg: "°",
	euro: "€",
	pound: "£",
	yen: "¥",
	cent: "¢",
	times: "×",
	divide: "÷",
	eacute: "é",
	egrave: "è",
	ecirc: "ê",
	euml: "ë",
	aacute: "á",
	agrave: "à",
	acirc: "â",
	auml: "ä",
	aring: "å",
	iacute: "í",
	igrave: "ì",
	iuml: "ï",
	oacute: "ó",
	ograve: "ò",
	ocirc: "ô",
	ouml: "ö",
	oslash: "ø",
	uacute: "ú",
	ugrave: "ù",
	ucirc: "û",
	uuml: "ü",
	ntilde: "ñ",
	ccedil: "ç",
	szlig: "ß",
	Eacute: "É",
	Aacute: "Á",
	Ouml: "Ö",
	Uuml: "Ü",
	Auml: "Ä",
	Ntilde: "Ñ",
	Ccedil: "Ç",
};

export function decodeEntities(text: string): string {
	return text.replace(/&(#x[\da-f]+|#\d+|[a-z][a-z\d]*);/gi, (match, body: string) => {
		if (body[0] === "#") {
			const code =
				body[1] === "x" || body[1] === "X"
					? Number.parseInt(body.slice(2), 16)
					: Number.parseInt(body.slice(1), 10);
			if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
			try {
				return String.fromCodePoint(code);
			} catch {
				return match;
			}
		}
		return NAMED_ENTITIES[body] ?? match;
	});
}

export const collapseWhitespace = (text: string) => text.replace(/\s+/g, " ").trim();

/** Reads everything we need from one page in a single streaming pass. */
export function parseHtml(html: string, pageUrl: string): ParsedPage {
	let title: string | null = null;
	let titleBuffer = "";
	let description: string | null = null;
	let ogDescription: string | null = null;
	let baseHref: string | null = null;
	const headings: string[] = [];
	let heading: string | null = null;
	const hrefs: string[] = [];
	const text: string[] = [];
	let skipDepth = 0;

	new HTMLRewriter()
		.on("base[href]", {
			element(el) {
				baseHref ??= el.getAttribute("href");
			},
		})
		.on("title", {
			text(chunk) {
				// Only the first <title> counts; inline SVGs have their own.
				if (title === null) titleBuffer += chunk.text;
				if (chunk.lastInTextNode && title === null && titleBuffer.trim()) {
					title = collapseWhitespace(decodeEntities(titleBuffer));
				}
			},
		})
		.on("meta", {
			element(el) {
				const name = (el.getAttribute("name") ?? el.getAttribute("property") ?? "").toLowerCase();
				const content = el.getAttribute("content");
				if (!content) return;
				if (name === "description") description ??= collapseWhitespace(decodeEntities(content));
				if (name === "og:description")
					ogDescription ??= collapseWhitespace(decodeEntities(content));
			},
		})
		.on("a[href]", {
			element(el) {
				const rel = (el.getAttribute("rel") ?? "").toLowerCase();
				// rel=nofollow is the site asking crawlers not to follow — honour it.
				if (rel.split(/\s+/).includes("nofollow")) return;
				const href = el.getAttribute("href");
				if (href) hrefs.push(decodeEntities(href));
			},
		})
		.on(SKIPPED, {
			element(el) {
				skipDepth++;
				el.onEndTag(() => {
					skipDepth--;
				});
			},
		})
		.on(BLOCKS, {
			element(el) {
				text.push(" ");
				el.onEndTag(() => {
					text.push(" ");
				});
			},
		})
		// Line breaks and inline wrappers often separate words visually without any
		// whitespace in the source ("Create<br>Consistently", <span class="block">), so
		// they count as a space — in page text and in headings alike.
		.on("br, hr, img, span, a", {
			element(el) {
				text.push(" ");
				if (heading !== null) heading += " ";
				if (el.tagName !== "br" && el.tagName !== "hr" && el.tagName !== "img") {
					el.onEndTag(() => {
						text.push(" ");
						if (heading !== null) heading += " ";
					});
				}
			},
		})
		.on("h1, h2, h3", {
			element(el) {
				heading = "";
				el.onEndTag(() => {
					const h = collapseWhitespace(decodeEntities(heading ?? ""));
					if (h && headings.length < 50) headings.push(h.slice(0, 300));
					heading = null;
				});
			},
			text(chunk) {
				if (heading !== null && skipDepth === 0) heading += chunk.text;
			},
		})
		.onDocument({
			text(chunk) {
				if (skipDepth === 0) text.push(chunk.text);
			},
		})
		.transform(html);

	const base = (baseHref && cleanUrl(baseHref, pageUrl)?.href) || pageUrl;
	const links: string[] = [];
	for (const href of hrefs) {
		const url = cleanUrl(href, base);
		if (url) links.push(url.href);
	}

	return {
		title,
		description: description ?? ogDescription,
		headings,
		text: collapseWhitespace(decodeEntities(text.join(""))),
		links,
	};
}

/** `<loc>` values from a sitemap or sitemap index (XML; a regex is enough for this flat format). */
export function parseSitemap(xml: string): { isIndex: boolean; locations: string[] } {
	const isIndex = /<sitemapindex[\s>]/i.test(xml);
	const locations: string[] = [];
	for (const match of xml.matchAll(
		/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi,
	)) {
		const loc = match[1];
		if (loc) locations.push(decodeEntities(loc));
	}
	return { isIndex, locations };
}
