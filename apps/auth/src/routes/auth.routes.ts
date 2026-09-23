import { authEnv as env } from "@socialfly/config";
import {
	type AuthVariables,
	accessCookieOptions,
	authCookieNames,
	csrfCookieOptions,
	refreshCookieOptions,
	requireAuth,
	requireCsrf,
	verifyAccessJwt,
} from "@socialfly/core/auth";
import { AppError, badRequest, unauthorized } from "@socialfly/core/errors";
import { jsonResponse, validate } from "@socialfly/core/http";
import { createCsrfToken, randomToken } from "@socialfly/core/security";
import { isAccessRevoked } from "@socialfly/db";
import { type Context, Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { assertClientOrigin, getClient } from "#src/config/clients.ts";
import { db } from "#src/infrastructure/index.ts";
import type { RequestMeta } from "#src/services/audit.ts";
import type { IssuedSession } from "#src/services/auth.service.ts";
import {
	authService,
	googleOAuthService,
	jwtConfig,
	serviceTokenService,
} from "#src/services/index.ts";
import {
	authResultSchema,
	clientQuery,
	emailRequestBody,
	googleStartQuery,
	loginBody,
	okSchema,
	passwordChangeBody,
	profileBody,
	publicUserSchema,
	recoveryConfirmBody,
	registerBody,
	sessionIdParam,
	tokenBody,
} from "#src/validators/auth.validator.ts";

const cookieConfig = { domain: env.AUTH_COOKIE_DOMAIN, secure: env.AUTH_COOKIE_SECURE };
const tags = ["Auth"];

const meta = (ctx: Context): RequestMeta => ({
	// Behind Azure Container Apps ingress the client IP is the first X-Forwarded-For hop.
	ip: ctx.req.header("X-Forwarded-For")?.split(",")[0]?.trim() || undefined,
	userAgent: ctx.req.header("User-Agent")?.slice(0, 512),
});

const setSessionCookies = (ctx: Context, issued: IssuedSession) => {
	setCookie(ctx, authCookieNames.access, issued.accessToken, accessCookieOptions(cookieConfig));
	if (issued.refreshToken) {
		setCookie(
			ctx,
			authCookieNames.refresh,
			issued.refreshToken,
			refreshCookieOptions(cookieConfig),
		);
	}
};

const clearSessionCookies = (ctx: Context) => {
	deleteCookie(ctx, authCookieNames.access, accessCookieOptions(cookieConfig));
	deleteCookie(ctx, authCookieNames.refresh, refreshCookieOptions(cookieConfig));
};

const authenticated = requireAuth({
	...jwtConfig,
	isRevoked: (claims) => isAccessRevoked(db, claims),
});

export const authRoutes = new Hono<{ Variables: AuthVariables }>()
	// Cookie-authenticated state changes need the double-submit CSRF header.
	// /token is exempt: it authenticates with client credentials, not cookies.
	.use("*", async (ctx, next) =>
		ctx.req.path.endsWith("/token") ? next() : requireCsrf()(ctx, next),
	)

	.get(
		"/csrf",
		describeRoute({ tags, summary: "Issue a CSRF token (call before any POST)" }),
		validate("query", clientQuery),
		(ctx) => {
			assertClientOrigin(ctx.req.valid("query").client_id, ctx.req.header("Origin"));
			const token = createCsrfToken();
			setCookie(ctx, authCookieNames.csrf, token, csrfCookieOptions(cookieConfig));
			return ctx.json({ csrfToken: token });
		},
	)

	.post(
		"/register",
		describeRoute({
			tags,
			summary: "Create an account",
			responses: { 201: jsonResponse(authResultSchema, "Signed in") },
		}),
		validate("json", registerBody),
		async (ctx) => {
			const body = ctx.req.valid("json");
			const client = assertClientOrigin(body.client_id, ctx.req.header("Origin"));
			if (!client.registrationEnabled)
				throw new AppError(403, "registration_disabled", "Sign-ups are closed");
			const issued = await authService.register({ clientId: client.clientId, ...body }, meta(ctx));
			setSessionCookies(ctx, issued);
			return ctx.json({ user: issued.user, session: issued.session }, 201);
		},
	)

	.post(
		"/login",
		describeRoute({
			tags,
			summary: "Sign in with email and password",
			responses: { 200: jsonResponse(authResultSchema, "Signed in") },
		}),
		validate("json", loginBody),
		async (ctx) => {
			const body = ctx.req.valid("json");
			const client = assertClientOrigin(body.client_id, ctx.req.header("Origin"));
			if (!client.loginEnabled)
				throw new AppError(403, "login_disabled", "Sign-in is disabled for this app");
			const issued = await authService.login({ clientId: client.clientId, ...body }, meta(ctx));
			setSessionCookies(ctx, issued);
			return ctx.json({ user: issued.user, session: issued.session });
		},
	)

	.post(
		"/refresh",
		describeRoute({ tags, summary: "Rotate the refresh token and issue a new access token" }),
		async (ctx) => {
			const refreshToken = getCookie(ctx, authCookieNames.refresh);
			if (!refreshToken) throw unauthorized("No refresh token");
			try {
				const issued = await authService.refresh(refreshToken, meta(ctx));
				setSessionCookies(ctx, issued);
				return ctx.json({ user: issued.user, session: issued.session });
			} catch (error) {
				clearSessionCookies(ctx);
				throw error;
			}
		},
	)

	.post("/logout", describeRoute({ tags, summary: "Sign out this session" }), async (ctx) => {
		const token = getCookie(ctx, authCookieNames.access);
		const claims = token ? await verifyAccessJwt(jwtConfig, token).catch(() => null) : null;
		await authService.logout(claims?.sid, meta(ctx));
		clearSessionCookies(ctx);
		return ctx.json({ ok: true as const });
	})

	.get(
		"/session",
		describeRoute({ tags, summary: "Current session, or { authenticated: false }" }),
		async (ctx) => {
			const token =
				getCookie(ctx, authCookieNames.access) ??
				ctx.req.header("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
			const claims = token ? await verifyAccessJwt(jwtConfig, token).catch(() => null) : null;
			const current = claims?.principal === "user" ? await authService.getSession(claims) : null;
			return ctx.json(current ? { authenticated: true, ...current } : { authenticated: false });
		},
	)

	.get(
		"/me",
		describeRoute({
			tags,
			summary: "The signed-in user",
			responses: { 200: jsonResponse(publicUserSchema, "User") },
		}),
		authenticated,
		async (ctx) => {
			const user = await authService.activeUser(ctx.get("auth").userId);
			return ctx.json({
				id: user.id,
				email: user.email,
				emailVerified: Boolean(user.emailVerifiedAt),
				name: user.name,
				avatarUrl: user.avatarUrl,
			});
		},
	)

	// ── email verification & recovery ──
	.post(
		"/verification/request",
		describeRoute({ tags, summary: "Send (or resend) the verification email" }),
		validate("json", emailRequestBody),
		async (ctx) => {
			const body = ctx.req.valid("json");
			assertClientOrigin(body.client_id, ctx.req.header("Origin"));
			return ctx.json({
				ok: true as const,
				...(await authService.requestEmailToken("verification", body.email)),
			});
		},
	)
	.post(
		"/verification/confirm",
		describeRoute({
			tags,
			summary: "Confirm an email address",
			responses: { 200: jsonResponse(okSchema, "Verified") },
		}),
		validate("json", tokenBody),
		async (ctx) => {
			await authService.confirmVerification(ctx.req.valid("json").token, meta(ctx));
			return ctx.json({ ok: true as const });
		},
	)
	.post(
		"/recovery/request",
		describeRoute({ tags, summary: "Send a password-reset email" }),
		validate("json", emailRequestBody),
		async (ctx) => {
			const body = ctx.req.valid("json");
			assertClientOrigin(body.client_id, ctx.req.header("Origin"));
			return ctx.json({
				ok: true as const,
				...(await authService.requestEmailToken("recovery", body.email)),
			});
		},
	)
	.post(
		"/recovery/confirm",
		describeRoute({ tags, summary: "Set a new password from a reset link (signs out everywhere)" }),
		validate("json", recoveryConfirmBody),
		async (ctx) => {
			const body = ctx.req.valid("json");
			await authService.confirmRecovery(body.token, body.password, meta(ctx));
			return ctx.json({ ok: true as const });
		},
	)

	// ── account settings ──
	.patch(
		"/settings/profile",
		describeRoute({ tags, summary: "Update name / avatar" }),
		authenticated,
		validate("json", profileBody),
		async (ctx) =>
			ctx.json(await authService.updateProfile(ctx.get("auth").userId, ctx.req.valid("json"))),
	)
	.patch(
		"/settings/password",
		describeRoute({ tags, summary: "Change password (signs out other sessions)" }),
		authenticated,
		validate("json", passwordChangeBody),
		async (ctx) => {
			const auth = ctx.get("auth");
			const issued = await authService.changePassword(
				auth.userId,
				auth.sessionId,
				ctx.req.valid("json"),
				meta(ctx),
			);
			setSessionCookies(ctx, issued);
			return ctx.json({ ok: true as const });
		},
	)
	.get(
		"/sessions",
		describeRoute({ tags, summary: "Active sessions" }),
		authenticated,
		async (ctx) => {
			const auth = ctx.get("auth");
			return ctx.json({ sessions: await authService.listSessions(auth.userId, auth.sessionId) });
		},
	)
	.delete(
		"/sessions/:id",
		describeRoute({ tags, summary: "Sign out a specific session" }),
		authenticated,
		validate("param", sessionIdParam),
		async (ctx) => {
			await authService.revokeSession(ctx.get("auth").userId, ctx.req.valid("param").id, meta(ctx));
			return ctx.json({ ok: true as const });
		},
	)

	// ── Google sign-in ──
	.get(
		"/oauth/google/start",
		describeRoute({ tags, summary: "Redirect to Google" }),
		validate("query", googleStartQuery),
		(ctx) => {
			const query = ctx.req.valid("query");
			const client = getClient(query.client_id);
			if (!client.oauthProviders.includes("google"))
				throw badRequest("Google sign-in is disabled for this client");
			const redirectUri = query.redirect_uri ?? client.redirectUris[0];
			if (!redirectUri || !client.redirectUris.includes(redirectUri))
				throw badRequest("redirect_uri is not allowed");

			const nonce = randomToken(24);
			setCookie(
				ctx,
				"sf_oauth_state",
				JSON.stringify({ nonce, clientId: client.clientId, redirectUri }),
				{
					httpOnly: true,
					secure: cookieConfig.secure,
					sameSite: "Lax",
					path: "/auth/oauth",
					maxAge: 600,
				},
			);
			return ctx.redirect(googleOAuthService.authorizationUrl(nonce));
		},
	)
	.get(
		"/oauth/google/callback",
		validate(
			"query",
			z.object({
				code: z.string().optional(),
				state: z.string().optional(),
				error: z.string().optional(),
			}),
		),
		async (ctx) => {
			const query = ctx.req.valid("query");
			const raw = getCookie(ctx, "sf_oauth_state");
			deleteCookie(ctx, "sf_oauth_state", { path: "/auth/oauth" });
			const state = raw
				? (JSON.parse(raw) as { nonce: string; clientId: string; redirectUri: string })
				: null;

			const back = (params: Record<string, string>) => {
				const url = new URL(state?.redirectUri ?? env.WEB_URL);
				for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
				return ctx.redirect(url.toString());
			};
			if (!state || state.nonce !== query.state) return back({ error: "invalid_state" });
			if (query.error || !query.code) return back({ error: query.error ?? "access_denied" });

			try {
				const user = await googleOAuthService.signIn(query.code, state.clientId, meta(ctx));
				setSessionCookies(ctx, await authService.createSession(user, state.clientId, meta(ctx)));
				return back({ status: "ok" });
			} catch (error) {
				return back({ error: error instanceof AppError ? error.code : "oauth_failed" });
			}
		},
	)

	// ── machine clients ──
	.post(
		"/token",
		describeRoute({ tags: ["Service tokens"], summary: "OAuth2 client-credentials grant" }),
		async (ctx) => {
			const basic = ctx.req.header("Authorization")?.match(/^Basic\s+(.+)$/i)?.[1];
			const [id, secret] = basic
				? Buffer.from(basic, "base64").toString("utf8").split(/:(.*)/s)
				: [];
			if (!id || !secret) throw unauthorized("Use HTTP Basic auth with client_id:client_secret");
			const form = await ctx.req.parseBody();
			if (form.grant_type !== "client_credentials") {
				throw new AppError(400, "unsupported_grant_type", "grant_type must be client_credentials");
			}
			return ctx.json(
				await serviceTokenService.issue(
					id,
					secret,
					typeof form.scope === "string" ? form.scope : undefined,
				),
			);
		},
	);
