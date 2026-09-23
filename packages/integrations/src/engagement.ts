import { ProviderError } from "./errors";
import type { EngagementAuthor, EngagementItem } from "./types";

/**
 * Small pure helpers shared by the providers' engagement (comments, replies,
 * mentions, listening) support. Kept apart from the adapters so text handling
 * and the `since` rules are tested once.
 */

/**
 * Pages read per post (or per listening query) in one call. Comment threads can
 * be huge; the inbox polls often, so a bounded read per poll protects the
 * platforms' rate limits and quota. Anything beyond the bound is picked up by
 * later polls only where the platform returns newest first (documented per
 * provider in docs/platforms.md).
 */
export const MAX_PAGES_PER_POST = 5;

export const emptyAuthor = (): EngagementAuthor => ({
	externalId: null,
	name: null,
	handle: null,
	avatarUrl: null,
	profileUrl: null,
});

/** ISO timestamp from anything Date can parse; null for garbage (the item is then dropped). */
export function toIso(value: string | number | undefined | null): string | null {
	if (value === undefined || value === null || value === "") return null;
	const ms = typeof value === "number" ? value : Date.parse(value);
	return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Strictly newer than `since` ("newer than" in the contract); everything when since is null. */
export function isNewer(createdAt: string, since: string | null): boolean {
	if (!since) return true;
	const s = Date.parse(since);
	return Number.isNaN(s) || Date.parse(createdAt) > s;
}

/**
 * Filters by `since`, drops duplicates (the same comment can come back on two
 * pages when new comments shift a cursor) and sorts oldest first, so the result
 * does not depend on the order a platform happens to return.
 */
export function finalizeItems<T extends { externalId: string; createdAt: string }>(
	items: T[],
	since: string | null,
): T[] {
	const seen = new Map<string, T>();
	for (const item of items) {
		if (isNewer(item.createdAt, since) && !seen.has(item.externalId)) {
			seen.set(item.externalId, item);
		}
	}
	return [...seen.values()].sort(
		(a, b) => a.createdAt.localeCompare(b.createdAt) || a.externalId.localeCompare(b.externalId),
	);
}

const NAMED_ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
	"#39": "'",
};

/** Decodes the HTML entities platforms put in "plain" text (X escapes &, < and >). */
export function decodeEntities(text: string): string {
	return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (match, entity: string) => {
		const lower = entity.toLowerCase();
		if (lower in NAMED_ENTITIES) return NAMED_ENTITIES[lower] ?? match;
		const code = lower.startsWith("#x")
			? Number.parseInt(lower.slice(2), 16)
			: lower.startsWith("#")
				? Number.parseInt(lower.slice(1), 10)
				: Number.NaN;
		return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
			? String.fromCodePoint(code)
			: match;
	});
}

/** HTML fragment → plain text: line breaks kept, tags dropped, entities decoded. */
export function htmlToText(html: string): string {
	return decodeEntities(
		html
			.replace(/<br\s*\/?>/gi, "\n")
			.replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
			.replace(/<[^>]+>/g, ""),
	).trim();
}

const URL_RE = /https?:\/\/[^\s]+/gi;
/** X's transformed URL length: every link counts as 23 whatever its real length. */
const X_URL_WEIGHT = 23;

/**
 * X's weighted length: code points in the ranges below weigh 1, everything else
 * (CJK, emoji...) weighs 2, and each URL weighs 23. An approximation of
 * twitter-text (emoji sequences joined with ZWJ count per code point here), close
 * enough to refuse clearly-too-long replies before sending them.
 * https://docs.x.com/resources/fundamentals/counting-characters
 */
export function xWeightedLength(text: string): number {
	let length = 0;
	const withoutUrls = text.normalize("NFC").replace(URL_RE, () => {
		length += X_URL_WEIGHT;
		return "";
	});
	for (const ch of withoutUrls) {
		const cp = ch.codePointAt(0) ?? 0;
		const light =
			cp <= 0x10ff ||
			(cp >= 0x2000 && cp <= 0x200d) ||
			(cp >= 0x2010 && cp <= 0x201f) ||
			(cp >= 0x2032 && cp <= 0x2037);
		length += light ? 1 : 2;
	}
	return length;
}

/** Code points, the way most platforms count characters. */
export const charLength = (text: string) => [...text].length;

/**
 * Trims and checks a reply before anything is sent. Failing here costs nothing
 * and is always `invalid_request`: the platform would reject it the same way.
 */
export function checkReplyText(
	provider: string,
	text: string,
	max: number,
	length: (text: string) => number = charLength,
): string {
	const trimmed = text.trim();
	if (!trimmed) throw new ProviderError("invalid_request", provider, "The reply is empty");
	const n = length(trimmed);
	if (n > max) {
		throw new ProviderError(
			"invalid_request",
			provider,
			`Replies are limited to ${max} characters (this one has ${n})`,
		);
	}
	return trimmed;
}

/** Rejects reply kinds a provider cannot answer (e.g. "mention" where we never list mentions). */
export function unsupportedReplyKind(provider: string, kind: EngagementItem["kind"]): never {
	throw new ProviderError("invalid_request", provider, `Cannot reply to a ${kind} on ${provider}`);
}
