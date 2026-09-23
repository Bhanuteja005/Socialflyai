import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { AppError, forbidden, unauthorized } from "../errors";
import { csrfMatches } from "../security";
import { authCookieNames } from "./cookies";
import { type JwtConfig, verifyAccessJwt } from "./jwt";
import type { AccessClaims, AuthContext, AuthVariables } from "./types";

export type RequireAuthOptions = JwtConfig & {
	/**
	 * Optional revocation check (session revoked, token_version bumped by a password
	 * reset). Without it a stolen access token lives until its 15-minute expiry;
	 * with it, a logout or reset takes effect on the next request.
	 */
	isRevoked?: (claims: AccessClaims) => Promise<boolean>;
};

const toContext = (claims: AccessClaims): AuthContext => ({
	userId: claims.sub,
	sessionId: claims.sid,
	clientId: claims.cid,
	email: claims.email,
	emailVerified: claims.email_verified,
	principal: claims.principal,
	scopes: claims.scope?.split(" ").filter(Boolean) ?? [],
});

/** Accepts a Bearer token (service-to-service, CLI) or the httpOnly access cookie (browser). */
export const requireAuth = (
	options: RequireAuthOptions,
): MiddlewareHandler<{ Variables: AuthVariables }> => {
	return async (ctx, next) => {
		const bearer = ctx.req.header("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
		const token = bearer ?? getCookie(ctx, authCookieNames.access);
		if (!token) throw unauthorized();

		const claims = await verifyAccessJwt(options, token);
		if (options.isRevoked && (await options.isRevoked(claims))) {
			throw unauthorized("Session has been revoked");
		}
		ctx.set("auth", toContext(claims));
		await next();
	};
};

/** Service tokens must carry the scope; user tokens are never allowed through. */
export const requireServiceScope =
	(scope: string): MiddlewareHandler<{ Variables: AuthVariables }> =>
	async (ctx, next) => {
		const auth = ctx.get("auth");
		if (auth.principal !== "service" || !auth.scopes.includes(scope)) {
			throw forbidden(`Requires service scope "${scope}"`);
		}
		await next();
	};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Double-submit CSRF check for cookie-authenticated, state-changing requests.
 * Bearer-token requests are exempt: a cross-site attacker cannot attach one.
 */
export const requireCsrf = (): MiddlewareHandler => async (ctx, next) => {
	const usesBearer = /^Bearer\s/i.test(ctx.req.header("Authorization") ?? "");
	if (!SAFE_METHODS.has(ctx.req.method) && !usesBearer) {
		if (!csrfMatches(ctx.req.header("X-CSRF-Token"), getCookie(ctx, authCookieNames.csrf))) {
			throw new AppError(403, "csrf_invalid", "Missing or invalid CSRF token");
		}
	}
	await next();
};
