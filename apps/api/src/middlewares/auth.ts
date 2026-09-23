import { apiEnv as env } from "@socialfly/config";
import { requireAuth } from "@socialfly/core/auth";
import { forbidden, notFound } from "@socialfly/core/errors";
import { and, eq, isAccessRevoked, isNull, schema } from "@socialfly/db";
import { createMiddleware } from "hono/factory";
import { db } from "#src/infrastructure/index.ts";
import type { MemberRole, OrgEnv, UserEnv } from "#src/shared/context.ts";

/** Verifies the access token (cookie or Bearer) and that its session is still live. */
export const requireUser = requireAuth({
	issuer: env.AUTH_ISSUER,
	audience: env.AUTH_AUDIENCE,
	secret: env.AUTH_JWT_SECRET,
	isRevoked: (claims) => isAccessRevoked(db, claims),
});

/**
 * Resolves the organization from `X-Organization-Id` and the caller's role in it.
 *
 * Membership is checked on EVERY request rather than baked into the JWT, so
 * removing a member takes effect immediately. A non-member gets 404, not 403:
 * we do not confirm that an organization id exists to someone outside it.
 */
export const requireOrg = createMiddleware<OrgEnv>(async (ctx, next) => {
	const orgId = ctx.req.header("X-Organization-Id");
	if (!orgId || !/^[0-9a-f-]{36}$/i.test(orgId)) throw notFound("Organization");

	const [membership] = await db
		.select({ role: schema.memberships.role })
		.from(schema.memberships)
		.innerJoin(schema.organizations, eq(schema.organizations.id, schema.memberships.organizationId))
		.where(
			and(
				eq(schema.memberships.organizationId, orgId),
				eq(schema.memberships.userId, ctx.get("auth").userId),
				isNull(schema.organizations.deletedAt),
			),
		)
		.limit(1);
	if (!membership) throw notFound("Organization");

	ctx.set("org", { id: orgId, role: membership.role });
	await next();
});

const RANK: Record<MemberRole, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

/** Minimum role for a route: `requireRole("editor")` admits editor, admin and owner. */
export const requireRole = (minimum: MemberRole) =>
	createMiddleware<OrgEnv>(async (ctx, next) => {
		if (RANK[ctx.get("org").role] < RANK[minimum]) {
			throw forbidden(`This action needs the ${minimum} role or higher`);
		}
		await next();
	});

export const roleAtLeast = (role: MemberRole, minimum: MemberRole) => RANK[role] >= RANK[minimum];

/**
 * Gate for the internal admin console. Runs after `requireUser`.
 *
 * The role is read from the database on EVERY request, never from the token: tokens are
 * identity-only, so revoking staff access (`bun run cli admin revoke`) takes effect on
 * the next request. Anyone who is not a platform admin — including service principals —
 * gets the same 404 as an unknown route, so the console's existence is not revealed.
 */
export const requirePlatformAdmin = createMiddleware<UserEnv>(async (ctx, next) => {
	const auth = ctx.get("auth");
	if (auth.principal !== "user") throw notFound("Route");

	const [user] = await db
		.select({ platformRole: schema.users.platformRole, status: schema.users.status })
		.from(schema.users)
		.where(eq(schema.users.id, auth.userId))
		.limit(1);
	if (user?.platformRole !== "admin") throw notFound("Route");
	// Normally unreachable (a disabled user's token is already refused by requireUser),
	// but authorization must not depend on that check staying in place.
	if (user.status !== "active") throw forbidden("This account is disabled");

	await next();
});
