import { webEnv } from "@socialfly/config/web";
import { COOKIE_NAMES, readCookie } from "./cookies";
import { ApiError, type ApiErrorBody } from "./errors";

export const AUTH_URL = webEnv.NEXT_PUBLIC_AUTH_URL.replace(/\/+$/, "");
export const CLIENT_ID = webEnv.NEXT_PUBLIC_AUTH_CLIENT_ID;

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

export type ActiveSession = SessionInfo & {
	userAgent: string | null;
	ip: string | null;
	lastUsedAt: string | null;
	current: boolean;
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

/** The app shell replaces this to clear cached data before sending the user to /login. */
export function setUnauthorizedHandler(handler: Unauthorized) {
	onUnauthorized = handler;
}

export function signalUnauthorized() {
	onUnauthorized();
}

type AuthRequest = {
	method?: "GET" | "POST" | "PATCH" | "DELETE";
	body?: unknown;
	/** Retry once after refreshing on 401 (for signed-in endpoints). */
	authenticated?: boolean;
};

async function authRequest<T>(
	path: string,
	{ method = "GET", body, authenticated }: AuthRequest = {},
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
	if (res.status === 401 && authenticated) {
		if (await refreshSession()) res = await send();
		if (res.status === 401) {
			signalUnauthorized();
			throw await toApiError(res);
		}
	}
	if (!res.ok) throw await toApiError(res);
	return (await res.json()) as T;
}

// ── endpoints ────────────────────────────────────────────────────────────────

type AuthResult = { user: PublicUser; session: SessionInfo };

export const authClient = {
	session: () => authRequest<SessionState>("/auth/session"),
	me: () => authRequest<PublicUser>("/auth/me", { authenticated: true }),
	login: (input: { email: string; password: string }) =>
		authRequest<AuthResult>("/auth/login", {
			method: "POST",
			body: { client_id: CLIENT_ID, ...input },
		}),
	register: (input: { email: string; password: string; name?: string }) =>
		authRequest<AuthResult>("/auth/register", {
			method: "POST",
			body: { client_id: CLIENT_ID, ...input },
		}),
	logout: () => authRequest<{ ok: true }>("/auth/logout", { method: "POST" }),
	requestVerification: (email: string) =>
		authRequest<{ ok: true }>("/auth/verification/request", {
			method: "POST",
			body: { client_id: CLIENT_ID, email },
		}),
	confirmVerification: (token: string) =>
		authRequest<{ ok: true }>("/auth/verification/confirm", { method: "POST", body: { token } }),
	requestRecovery: (email: string) =>
		authRequest<{ ok: true }>("/auth/recovery/request", {
			method: "POST",
			body: { client_id: CLIENT_ID, email },
		}),
	confirmRecovery: (token: string, password: string) =>
		authRequest<{ ok: true }>("/auth/recovery/confirm", {
			method: "POST",
			body: { token, password },
		}),
	updateProfile: (input: { name?: string; avatarUrl?: string | null }) =>
		authRequest<PublicUser>("/auth/settings/profile", {
			method: "PATCH",
			body: input,
			authenticated: true,
		}),
	changePassword: (input: { currentPassword: string; newPassword: string }) =>
		authRequest<{ ok: true }>("/auth/settings/password", {
			method: "PATCH",
			body: input,
			authenticated: true,
		}),
	sessions: () =>
		authRequest<{ sessions: ActiveSession[] }>("/auth/sessions", { authenticated: true }),
	revokeSession: (id: string) =>
		authRequest<{ ok: true }>(`/auth/sessions/${encodeURIComponent(id)}`, {
			method: "DELETE",
			authenticated: true,
		}),
};

/** Full-page navigation target for "Continue with Google". */
export const googleSignInUrl = () =>
	`${AUTH_URL}/auth/oauth/google/start?client_id=${encodeURIComponent(CLIENT_ID)}`;

/** Mirrors the server rule so the form can explain it before submitting. */
export const PASSWORD_HINT =
	"At least 10 characters with upper and lower case letters, a number and a symbol.";

export function passwordProblems(password: string): string | null {
	if (password.length < 10) return "Use at least 10 characters.";
	if (!/[a-z]/.test(password) || !/[A-Z]/.test(password))
		return "Mix upper and lower case letters.";
	if (!/\d/.test(password)) return "Add a number.";
	if (!/[^A-Za-z0-9]/.test(password)) return "Add a symbol.";
	return null;
}

/** Only allow same-site relative redirects after sign-in. */
export function safeNext(next: string | null | undefined, fallback = "/dashboard") {
	if (!next?.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
	return next;
}
