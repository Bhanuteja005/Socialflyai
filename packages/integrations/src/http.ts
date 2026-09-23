import { ProviderError } from "./errors";

const MAX_BODY_CHARS = 2000;
const DEFAULT_TIMEOUT_MS = 30_000;

export type ProviderRequest = RequestInit & {
	/**
	 * True for calls that CREATE something visible (the post itself, a comment).
	 * Decides whether an ambiguous failure is `transient` (safe to retry) or
	 * `unknown_outcome` (never auto-retry). Uploads of not-yet-attached media are
	 * NOT mutating in this sense: an orphaned upload is invisible to followers.
	 */
	mutating?: boolean;
	timeoutMs?: number;
	/** Adapter hook to recognise platform-specific error shapes before the default mapping. */
	classify?: (status: number, body: string) => ProviderError | undefined;
};

/** Network errors that prove the request never reached the platform. */
const NEVER_SENT = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ConnectionRefused"]);

const retryAfterMs = (res: Response): number | undefined => {
	const header = res.headers.get("retry-after");
	if (!header) return undefined;
	const seconds = Number(header);
	if (Number.isFinite(seconds)) return seconds * 1000;
	const date = Date.parse(header);
	return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
};

/**
 * fetch() with the error taxonomy applied. Adapters use this for every platform
 * call so failure handling is uniform across providers.
 */
export async function providerFetch(
	provider: string,
	url: string,
	{ mutating = false, timeoutMs = DEFAULT_TIMEOUT_MS, classify, ...init }: ProviderRequest = {},
): Promise<Response> {
	let res: Response;
	try {
		res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
	} catch (error) {
		const code = (error as { code?: string }).code ?? (error as Error).name;
		const neverSent = code !== undefined && NEVER_SENT.has(code);
		throw new ProviderError(
			mutating && !neverSent ? "unknown_outcome" : "transient",
			provider,
			`${init.method ?? "GET"} ${new URL(url).pathname} failed: ${(error as Error).message}`,
			{},
			{ cause: error },
		);
	}

	if (res.ok) return res;

	const body = (await res.text().catch(() => "")).slice(0, MAX_BODY_CHARS);
	const custom = classify?.(res.status, body);
	if (custom) throw custom;

	const where = `${init.method ?? "GET"} ${new URL(url).pathname}`;
	const details = { status: res.status, body };

	if (res.status === 401)
		throw new ProviderError("auth", provider, `${where}: unauthorized`, details);
	if (res.status === 429) {
		throw new ProviderError("rate_limited", provider, `${where}: rate limited`, {
			...details,
			retryAfterMs: retryAfterMs(res) ?? 60_000,
		});
	}
	if (res.status === 403) {
		// Usually a missing scope or a revoked permission — the user must reconnect.
		throw new ProviderError("auth", provider, `${where}: forbidden`, details);
	}
	if (res.status >= 500) {
		throw new ProviderError(
			mutating ? "unknown_outcome" : "transient",
			provider,
			`${where}: platform error ${res.status}`,
			details,
		);
	}
	throw new ProviderError(
		"invalid_request",
		provider,
		`${where}: rejected (${res.status})`,
		details,
	);
}

export async function providerJson<T>(
	provider: string,
	url: string,
	init?: ProviderRequest,
): Promise<T> {
	const res = await providerFetch(provider, url, init);
	return (await res.json()) as T;
}

/**
 * Downloads a media file for platforms that need the bytes (LinkedIn, X, YouTube).
 * Typed with an ArrayBuffer backing (not ArrayBufferLike) so the bytes are a valid
 * fetch body under both Bun and DOM lib types — the web app type-checks these files.
 */
export async function fetchMediaBytes(
	provider: string,
	url: string,
): Promise<Uint8Array<ArrayBuffer>> {
	const res = await providerFetch(provider, url, { timeoutMs: 120_000 });
	return new Uint8Array(await res.arrayBuffer());
}

export const form = (values: Record<string, string>) => new URLSearchParams(values).toString();

/** PKCE (RFC 7636) S256 pair. */
export async function createPkce(): Promise<{ verifier: string; challenge: string }> {
	const verifier = Buffer.from(crypto.getRandomValues(new Uint8Array(48))).toString("base64url");
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
	return { verifier, challenge: Buffer.from(digest).toString("base64url") };
}

export const expiresAtFrom = (expiresInSeconds: number | undefined | null) =>
	expiresInSeconds ? new Date(Date.now() + expiresInSeconds * 1000) : null;
