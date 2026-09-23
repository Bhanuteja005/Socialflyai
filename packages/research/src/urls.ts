/**
 * URL and domain helpers shared by the crawler and mention analysis. Kept pure so
 * the rules (what counts as "the same site", which query params are noise) are
 * unit-tested in one place.
 */

/** Query params that identify a click, not a page — the same page must not be crawled twice. */
const TRACKING_PARAMS = new Set([
	"gclid",
	"gbraid",
	"wbraid",
	"dclid",
	"fbclid",
	"msclkid",
	"yclid",
	"igshid",
	"twclid",
	"ttclid",
	"li_fat_id",
	"mc_cid",
	"mc_eid",
	"_ga",
	"_gl",
	"_hsenc",
	"_hsmi",
	"ref_src",
	"ref_url",
	"srsltid",
]);

const isTrackingParam = (name: string) => {
	const n = name.toLowerCase();
	return n.startsWith("utm_") || n.startsWith("pk_") || TRACKING_PARAMS.has(n);
};

/**
 * Parses an http(s) URL (relative to `base` when given) and removes what never
 * changes the page: the fragment, tracking params and default ports. Params are
 * sorted so `?a=1&b=2` and `?b=2&a=1` are the same page. Returns null for other
 * schemes (mailto:, javascript:, tel:) and garbage.
 */
export function cleanUrl(raw: string, base?: string | URL): URL | null {
	let url: URL;
	try {
		url = new URL(raw.trim(), base);
	} catch {
		return null;
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") return null;
	if (url.username || url.password) return null;
	url.hash = "";
	const kept = [...url.searchParams].filter(([name]) => !isTrackingParam(name));
	kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	url.search = new URLSearchParams(kept).toString();
	return url;
}

/**
 * Identity of a page for de-duplication: scheme-less, www-less, trailing slash
 * removed (`/about/` and `/about` are one page on virtually every site; the one
 * that is not canonical redirects to the other).
 */
export function pageKey(url: URL): string {
	const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : "/";
	return `${siteHost(url.hostname)}${path || "/"}${url.search}`;
}

/** Lowercased host without a leading `www.` — `www.acme.com` and `acme.com` are one site. */
export function siteHost(hostname: string): string {
	return hostname
		.toLowerCase()
		.replace(/\.$/, "")
		.replace(/^www\./, "");
}

/**
 * Second-level labels under which registrations happen one level deeper
 * (`acme.co.uk`, not `co.uk`). Not the full Public Suffix List — enough for the
 * domains that show up in AI answers; an unknown one only makes a subdomain look
 * like its own site, never merges two different sites.
 */
const MULTI_LABEL_SUFFIXES = new Set([
	"co.uk",
	"org.uk",
	"ac.uk",
	"gov.uk",
	"ltd.uk",
	"plc.uk",
	"me.uk",
	"com.au",
	"net.au",
	"org.au",
	"edu.au",
	"gov.au",
	"co.nz",
	"org.nz",
	"co.jp",
	"ne.jp",
	"or.jp",
	"co.kr",
	"co.in",
	"net.in",
	"org.in",
	"com.br",
	"com.mx",
	"com.ar",
	"com.cn",
	"com.hk",
	"com.sg",
	"com.tr",
	"com.tw",
	"co.za",
	"co.il",
	"co.id",
	"com.my",
	"com.ph",
	"com.vn",
	"com.ua",
	"com.pl",
	"github.io",
	"vercel.app",
	"netlify.app",
	"pages.dev",
	"herokuapp.com",
	"blogspot.com",
	"substack.com",
	"medium.com",
	"wordpress.com",
]);

/** `blog.shop.acme.co.uk` → `acme.co.uk`. Lowercased, www-stripped. */
export function registrableDomain(hostname: string): string {
	const host = siteHost(hostname);
	if (/^[\d.]+$/.test(host) || host.includes(":")) return host; // IP address
	const labels = host.split(".");
	if (labels.length <= 2) return host;
	const lastTwo = labels.slice(-2).join(".");
	const take = MULTI_LABEL_SUFFIXES.has(lastTwo) ? 3 : 2;
	return labels.slice(-take).join(".");
}

/**
 * Accepts what people type as a domain ("https://www.Acme.com/about", "acme.com")
 * and returns the bare host ("acme.com"), or null when it is not a domain.
 */
export function normalizeDomain(input: string | null | undefined): string | null {
	if (!input) return null;
	const trimmed = input.trim();
	if (!trimmed) return null;
	const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
	try {
		const host = siteHost(new URL(withScheme).hostname);
		return host.includes(".") ? host : null;
	} catch {
		return null;
	}
}

/** True when `host` is `domain` or one of its subdomains (`docs.acme.com` belongs to `acme.com`). */
export function hostBelongsTo(host: string, domain: string): boolean {
	const h = siteHost(host);
	const d = siteHost(domain);
	return h === d || h.endsWith(`.${d}`);
}
