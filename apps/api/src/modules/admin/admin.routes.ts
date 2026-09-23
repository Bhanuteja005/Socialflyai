import { validate } from "@socialfly/core/http";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { db, queueStats } from "#src/infrastructure/index.ts";
import { requirePlatformAdmin, requireUser } from "#src/middlewares/auth.ts";
import type { UserEnv } from "#src/shared/context.ts";
import {
	idParam,
	listAuditQuery,
	listGenerationsQuery,
	listOrganizationsQuery,
	listTargetsQuery,
	listUsersQuery,
	updateOrganizationBody,
	updateUserBody,
} from "./admin.schemas.ts";
import { AdminService } from "./admin.service.ts";

const service = new AdminService(db, queueStats);
const tags = ["Admin"];

/**
 * The internal admin console (apps/admin, staff only). Cross-tenant by design, so every
 * route is behind `requirePlatformAdmin`, which answers 404 to everyone else.
 */
export const adminRoutes = new Hono<UserEnv>()
	.use(requireUser, requirePlatformAdmin)
	.get(
		"/me",
		describeRoute({ tags, summary: "The signed-in platform admin (gates the console UI)" }),
		async (ctx) => ctx.json(await service.me(ctx.get("auth").userId)),
	)
	.get(
		"/overview",
		describeRoute({ tags, summary: "Platform-wide counts: users, orgs, publishing, AI spend" }),
		async (ctx) => ctx.json(await service.overview()),
	)
	.get(
		"/organizations",
		describeRoute({ tags, summary: "Search organizations (newest first)" }),
		validate("query", listOrganizationsQuery),
		async (ctx) => ctx.json(await service.listOrganizations(ctx.req.valid("query"))),
	)
	.get(
		"/organizations/:id",
		describeRoute({ tags, summary: "An organization with members, channels, posts and AI budget" }),
		validate("param", idParam),
		async (ctx) => ctx.json(await service.getOrganization(ctx.req.valid("param").id)),
	)
	.patch(
		"/organizations/:id",
		describeRoute({ tags, summary: "Override the organization's monthly AI budget (audited)" }),
		validate("param", idParam),
		validate("json", updateOrganizationBody),
		async (ctx) =>
			ctx.json(
				await service.updateOrganization(
					ctx.get("auth").userId,
					ctx.req.valid("param").id,
					ctx.req.valid("json"),
				),
			),
	)
	.get(
		"/users",
		describeRoute({ tags, summary: "Search users (newest first)" }),
		validate("query", listUsersQuery),
		async (ctx) => ctx.json(await service.listUsers(ctx.req.valid("query"))),
	)
	.patch(
		"/users/:id",
		describeRoute({ tags, summary: "Disable or re-enable a user (audited; cuts access at once)" }),
		validate("param", idParam),
		validate("json", updateUserBody),
		async (ctx) =>
			ctx.json(
				await service.updateUser(
					ctx.get("auth").userId,
					ctx.req.valid("param").id,
					ctx.req.valid("json"),
				),
			),
	)
	.get(
		"/publishing/targets",
		describeRoute({ tags, summary: "Failed and unconfirmed targets across all organizations" }),
		validate("query", listTargetsQuery),
		async (ctx) => ctx.json(await service.listTargets(ctx.req.valid("query"))),
	)
	.get(
		"/ai/generations",
		describeRoute({ tags, summary: "AI generations across all organizations" }),
		validate("query", listGenerationsQuery),
		async (ctx) => ctx.json(await service.listGenerations(ctx.req.valid("query"))),
	)
	.get(
		"/queues",
		describeRoute({ tags, summary: "BullMQ job counts for every queue" }),
		async (ctx) => ctx.json(await service.queueCounts()),
	)
	.get(
		"/audit",
		describeRoute({ tags, summary: "Admin audit trail (newest first)" }),
		validate("query", listAuditQuery),
		async (ctx) => ctx.json(await service.listAudit(ctx.req.valid("query"))),
	);
