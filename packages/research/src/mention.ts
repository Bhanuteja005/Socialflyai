import { hostBelongsTo, normalizeDomain, registrableDomain } from "./urls";

/**
 * Deterministic mention analysis of one AI answer. No model call: the same answer
 * always scores the same, so re-scoring after a competitor list changes is free and
 * results can be trusted in trend charts.
 *
 * Matching rules (each is a deliberate choice, covered by tests):
 *
 *  - Whole words only, Unicode-aware: "Acme" matches "Acme's", "(Acme)", "Acme-based"
 *    and "acme.com", never "Acmeist". Accents are folded ("Café" = "Cafe") and
 *    whitespace/hyphens inside a name are interchangeable ("Hub Spot" / "Hub-Spot").
 *    Names in scripts written without spaces (Chinese, Japanese, Thai) match anywhere.
 *  - Case-insensitive, EXCEPT a single Title-case word ("Notion", "Buffer", "Linear").
 *    Those are usually also ordinary words, so the match must start with a capital:
 *    "try Buffer" and "BUFFER" count, "a buffer of time" does not. Anything with more
 *    than one word, digits, symbols or inner capitals ("HubSpot", "monday.com",
 *    "Sprout Social") is distinctive enough to match in any case. Configure an alias
 *    in lowercase to opt a name into case-insensitive matching.
 *  - The brand's domain is always an alias, so "acme.io" in the text is a mention.
 *  - Overlapping names: the longest match wins its characters. With a competitor
 *    "Acme Cloud" and the brand "Acme", "Acme Cloud is great" mentions only the
 *    competitor. An exact tie goes to the brand.
 *  - A citation of a site counts as a mention of its owner, even when the name is
 *    not in the text (subdomains included: docs.acme.io belongs to acme.io).
 *  - brandRank is the brand's position among brand + competitors ordered by first
 *    appearance in the TEXT (1 = named first); null when the text never names it.
 */

export type MentionTarget = { id: string; name: string; aliases: string[]; domain: string | null };

export type MentionAnalysis = {
	brandMentioned: boolean;
	brandRank: number | null;
	competitorsMentioned: string[];
	citations: { url: string; domain: string; own: boolean; competitorId?: string }[];
};

const BRAND_ID = "\u0000brand";

/** Accent- and compatibility-folding so "Café", "Cafe" and "Ｃafe" compare equal. */
function fold(text: string): string {
	return text.normalize("NFKD").replace(/\p{M}/gu, "");
}

type Term = { regex: RegExp; requireCapital: boolean };

function compileTerm(raw: string, isDomain: boolean): Term | null {
	const term = fold(raw.trim());
	if (term.length < 2) return null;
	const body = term
		.split(/[\s-]+/)
		.filter(Boolean)
		.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
		.join("[\\s\\u00a0-]+");
	if (!body) return null;
	// Scripts written without spaces between words have no boundaries to check.
	const unspaced =
		/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\s]+$/u.test(term);
	return {
		regex: unspaced
			? new RegExp(body, "giu")
			: new RegExp(`(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])`, "giu"),
		requireCapital: !isDomain && /^\p{Lu}\p{Ll}+$/u.test(term),
	};
}

type Match = { start: number; end: number; target: string; order: number };

export function analyzeMention(
	answer: string,
	citations: { url: string }[],
	brand: { name: string; aliases: string[]; domain: string | null },
	competitors: MentionTarget[],
): MentionAnalysis {
	const text = fold(answer);
	const brandDomain = normalizeDomain(brand.domain);
	const targets = [
		{ id: BRAND_ID, name: brand.name, aliases: brand.aliases, domain: brandDomain },
		...competitors.map((c) => ({ ...c, domain: normalizeDomain(c.domain) })),
	];

	// ── Text matches ──
	const matches: Match[] = [];
	targets.forEach((target, order) => {
		const seenTerms = new Set<string>();
		const terms: [string, boolean][] = [
			[target.name, false],
			...target.aliases.map((a): [string, boolean] => [a, false]),
		];
		if (target.domain) terms.push([target.domain, true]);
		for (const [raw, isDomain] of terms) {
			if (!raw || seenTerms.has(raw)) continue;
			seenTerms.add(raw);
			const term = compileTerm(raw, isDomain);
			if (!term) continue;
			for (const m of text.matchAll(term.regex)) {
				const first = m[0].charAt(0);
				if (term.requireCapital && first === first.toLowerCase()) continue;
				matches.push({ start: m.index, end: m.index + m[0].length, target: target.id, order });
			}
		}
	});

	// Longest match claims its characters first; equal length → brand/listing order.
	matches.sort(
		(a, b) => b.end - b.start - (a.end - a.start) || a.order - b.order || a.start - b.start,
	);
	const claimed: Match[] = [];
	for (const m of matches) {
		if (claimed.some((c) => m.start < c.end && c.start < m.end)) continue;
		claimed.push(m);
	}
	const firstSeen = new Map<string, number>();
	for (const m of claimed) {
		const prev = firstSeen.get(m.target);
		if (prev === undefined || m.start < prev) firstSeen.set(m.target, m.start);
	}
	const inTextOrder = [...firstSeen.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);

	// ── Citations ──
	const mapped: MentionAnalysis["citations"] = [];
	const citedTargets = new Set<string>();
	const seenUrls = new Set<string>();
	for (const c of citations) {
		let host: string;
		try {
			const u = new URL(c.url);
			if (u.protocol !== "http:" && u.protocol !== "https:") continue;
			host = u.hostname;
		} catch {
			continue;
		}
		if (seenUrls.has(c.url)) continue;
		seenUrls.add(c.url);
		const own = brandDomain !== null && hostBelongsTo(host, brandDomain);
		let competitorId: string | undefined;
		if (!own) {
			// Most specific domain wins (a competitor on blog.x.com beats one on x.com).
			let best = -1;
			for (const t of targets) {
				if (t.id === BRAND_ID || !t.domain || !hostBelongsTo(host, t.domain)) continue;
				if (t.domain.length > best) {
					best = t.domain.length;
					competitorId = t.id;
				}
			}
		}
		if (own) citedTargets.add(BRAND_ID);
		if (competitorId) citedTargets.add(competitorId);
		mapped.push({
			url: c.url,
			domain: registrableDomain(host),
			own,
			...(competitorId ? { competitorId } : {}),
		});
	}

	const rankIndex = inTextOrder.indexOf(BRAND_ID);
	const competitorsMentioned = [
		...inTextOrder.filter((id) => id !== BRAND_ID),
		...competitors.map((c) => c.id).filter((id) => citedTargets.has(id) && !firstSeen.has(id)),
	];
	return {
		brandMentioned: firstSeen.has(BRAND_ID) || citedTargets.has(BRAND_ID),
		brandRank: rankIndex >= 0 ? rankIndex + 1 : null,
		competitorsMentioned: [...new Set(competitorsMentioned)],
		citations: mapped,
	};
}
