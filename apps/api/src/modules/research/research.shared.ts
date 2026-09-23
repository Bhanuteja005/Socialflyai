import { AppError } from "@socialfly/core/errors";
import { type DbOrTx, sql } from "@socialfly/db";

const invalidUrl = () =>
	new AppError(422, "invalid_url", "Enter a public website address, like https://example.com");

/**
 * The URL a research run starts from: https assumed when no scheme is given, fragment
 * dropped. Only public-looking hosts: the crawler fetches whatever we store, so an
 * intranet name or an IP literal is refused here, before any job exists. (The crawler
 * still has to guard redirects and DNS answers itself.)
 */
export function normalizeUrl(raw: string): string {
	let value = raw.trim();
	if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `https://${value}`;
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw invalidUrl();
	}
	const host = url.hostname.toLowerCase();
	if (url.protocol !== "https:" && url.protocol !== "http:") throw invalidUrl();
	if (url.username || url.password) throw invalidUrl();
	if (!host.includes(".") || host.endsWith(".local") || host.endsWith(".internal"))
		throw invalidUrl();
	if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) throw invalidUrl();
	url.hash = "";
	return url.toString();
}

/** `https://www.Acme.com/about` or `acme.com` → `acme.com`; null when it is not a host name. */
export function normalizeDomain(raw: string | null | undefined): string | null {
	if (!raw?.trim()) return null;
	const value = raw.trim();
	try {
		const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`)
			.hostname;
		const bare = host.toLowerCase().replace(/^www\./, "");
		return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(bare) ? bare : null;
	} catch {
		return null;
	}
}

/** Stored keyword form: lower case, single spaces — so "SEO  Tools" and "seo tools" are one row. */
export const normalizeKeyword = (k: string) => k.trim().toLowerCase().replace(/\s+/g, " ");

/** Case- and space-insensitive key for de-duplicating prompts and competitor names. */
export const dedupeKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Serialises writes that enforce a per-organization limit ("one active run", "25
 * active prompts") within a transaction: two concurrent requests would otherwise both
 * pass the count check. Released at commit.
 */
export async function lockOrg(tx: DbOrTx, orgId: string, scope: string) {
	await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${scope}:${orgId}`}))`);
}

/** Postgres unique_violation, raw or wrapped by drizzle. */
export function isUniqueViolation(error: unknown): boolean {
	for (let e: unknown = error; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
		if ((e as { code?: unknown }).code === "23505") return true;
	}
	return false;
}

/** 0–1 fraction, or null when there is nothing to divide by (unknown ≠ zero). */
export const rate = (part: number, whole: number) => (whole > 0 ? part / whole : null);
