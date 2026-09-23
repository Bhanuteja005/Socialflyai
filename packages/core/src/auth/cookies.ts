import type { CookieOptions } from "hono/utils/cookie";
import { ACCESS_TOKEN_TTL_SECONDS } from "./jwt";

export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

export const authCookieNames = {
	access: "sf_access",
	refresh: "sf_refresh",
	csrf: "sf_csrf",
} as const;

export type AuthCookieConfig = { domain?: string; secure: boolean };

/**
 * The access cookie is scoped to the parent domain (e.g. `.socialfly.ai`) so the
 * API on api.socialfly.ai can read what auth.socialfly.ai set. SameSite=Lax is
 * enough: app., api. and auth. are the same *site*, so credentialed fetches carry it.
 */
export const accessCookieOptions = ({ domain, secure }: AuthCookieConfig): CookieOptions => ({
	httpOnly: true,
	secure,
	sameSite: "Lax",
	path: "/",
	domain: domain === "localhost" ? undefined : domain,
	maxAge: ACCESS_TOKEN_TTL_SECONDS,
});

/** The refresh token is only ever sent to the auth service's own /auth routes. */
export const refreshCookieOptions = ({ secure }: AuthCookieConfig): CookieOptions => ({
	httpOnly: true,
	secure,
	sameSite: "Lax",
	path: "/auth",
	maxAge: REFRESH_TOKEN_TTL_SECONDS,
});

/** Readable by first-party JS on purpose (double-submit CSRF). */
export const csrfCookieOptions = ({ domain, secure }: AuthCookieConfig): CookieOptions => ({
	httpOnly: false,
	secure,
	sameSite: "Lax",
	path: "/",
	domain: domain === "localhost" ? undefined : domain,
	maxAge: REFRESH_TOKEN_TTL_SECONDS,
});
