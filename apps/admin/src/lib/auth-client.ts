import { webEnv } from "@socialfly/config/web";
import { COOKIE_NAMES, readCookie } from "./cookies";
import { ApiError, type ApiErrorBody } from "./errors";

export const AUTH_URL = webEnv.NEXT_PUBLIC_AUTH_URL.replace(/\/+$/, "");
/**
 * The auth service's staff client: login only, and only from the console's origin. Not
 * `webEnv`, whose default is the product app's `socialfly-web` (which the auth service
 * would refuse from this origin), so `bun dev` works here without an .env file.
 */
export const CLIENT_ID = process.env.NEXT_PUBLIC_AUTH_CLIENT_ID || "socialfly-admin";

export type PublicUser = {
	id: string;
	email: string;
	emailVerified: boolean;
	name: string | null;
	avatarUrl: string | null;
};

export type SessionInfo = {
	id: string;
	clientId: string;
	expiresAt: string;
	authenticatedAt: string;
};

export type SessionState =
	| { authenticated: false }
	| { authenticated: true; user: PublicUser; session: SessionInfo };

// ── CSRF ─────────────────────────────────────────────────────────────────────

let csrfPromise: Promise<string> | null = null;

/** The double-submit token: read from the `sf_csrf` cookie, fetching one first if missing. */
export async function ensureCsrf(force = false): Promise<string> {
	const existing = force ? null : readCookie(COOKIE_NAMES.csrf);
	if (existing) return existing;
	csrfPromise ??= fetch(`${AUTH_URL}/auth/csrf?client_id=${encodeURIComponent(CLIENT_ID)}`, {
		credentials: "include",
	})
		.then(async (res) => {
			if (!res.ok) throw await toApiError(res);
			const body = (await res.json()) as { csrfToken: string };
			return readCookie(COOKIE_NAMES.csrf) ?? body.csrfToken;
		})
		.finally(() => {
			csrfPromise = null;
		});
	return csrfPromise;
}

export const isCsrfFailure = (e: unknown) => e instanceof ApiError && e.code === "csrf_invalid";

// ── transport ────────────────────────────────────────────────────────────────

export async function toApiError(res: Response): Promise<ApiError> {
	const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
	if (body?.error) {
		return new ApiError(res.status, body.error.code, body.error.message, body.error.details);
	}
	return new ApiError(res.status, `http_${res.status}`, res.statusText || "Request failed");
}

export async function networkFetch(input: string, init: RequestInit): Promise<Response> {
	try {
		return await fetch(input, init);
	} catch {
		throw new ApiError(0, "network_error", "Can't reach SocialFly right now.");
	}
}

let refreshPromise: Promise<boolean> | null = null;

/**
 * Rotates the session once. Concurrent 401s share a single refresh request: the
 * refresh token is single-use, so two parallel refreshes would trip reuse detection.
 */
export function refreshSession(): Promise<boolean> {
	refreshPromise ??= (async () => {
		try {
			const csrf = await ensureCsrf();
			const res = await networkFetch(`${AUTH_URL}/auth/refresh`, {
				method: "POST",
				credentials: "include",
				headers: { "X-CSRF-Token": csrf },
			});
			return res.ok;
		} catch {
			return false;
		}
	})().finally(() => {
		refreshPromise = null;
	});
	return refreshPromise;
}

type Unauthorized = () => void;
let onUnauthorized: Unauthorized = () => {
	if (typeof window === "undefined") return;
	const next = `${window.location.pathname}${window.location.search}`;
	window.location.assign(`/login?next=${encodeURIComponent(next)}`);
};

/** The console guard replaces this to clear cached data before sending the user to /login. */
export function setUnauthorizedHandler(handler: Unauthorized) {
	onUnauthorized = handler;
}

export function signalUnauthorized() {
	onUnauthorized();
}

async function authRequest<T>(
	path: string,
	{ method = "GET", body }: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<T> {
	const send = async (forceCsrf = false) => {
		const headers: Record<string, string> = {};
		if (body !== undefined) headers["Content-Type"] = "application/json";
		if (method !== "GET") headers["X-CSRF-Token"] = await ensureCsrf(forceCsrf);
		return networkFetch(`${AUTH_URL}${path}`, {
			method,
			credentials: "include",
			headers,
			body: body === undefined ? undefined : JSON.stringify(body),
		});
	};

	let res = await send();
	if (res.status === 403 && method !== "GET") {
		const error = await toApiError(res.clone());
		if (isCsrfFailure(error)) res = await send(true);
	}
	if (!res.ok) throw await toApiError(res);
	return (await res.json()) as T;
}

// ── endpoints ────────────────────────────────────────────────────────────────
// Only what the console needs. The staff client is login-only: no sign-up, and no
// recovery or Google here (password resets happen in the product app, same account).

type AuthResult = { user: PublicUser; session: SessionInfo };

export const authClient = {
	session: () => authRequest<SessionState>("/auth/session"),
	login: (input: { email: string; password: string }) =>
		authRequest<AuthResult>("/auth/login", {
			method: "POST",
			body: { client_id: CLIENT_ID, ...input },
		}),
	logout: () => authRequest<{ ok: true }>("/auth/logout", { method: "POST" }),
};

/** Only allow same-site relative redirects after sign-in. */
export function safeNext(next: string | null | undefined, fallback = "/") {
	if (!next?.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
	return next;
}
