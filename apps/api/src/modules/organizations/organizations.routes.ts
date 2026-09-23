import { jsonResponse, validate } from "@socialfly/core/http";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { db, mailer } from "#src/infrastructure/index.ts";
import { requireOrg, requireRole, requireUser } from "#src/middlewares/auth.ts";
import type { OrgEnv, UserEnv } from "#src/shared/context.ts";
import {
	acceptInvitationBody,
	createInvitationBody,
	createOrganizationBody,
	idParam,
	memberSchema,
	organizationSchema,
	updateMemberBody,
	updateOrganizationBody,
	userIdParam,
} from "./organizations.schemas";
import { OrganizationsService } from "./organizations.service";

const service = new OrganizationsService(db, mailer);
const tags = ["Organizations"];

/** Routes that act on the user, not on one organization. */
export const organizationsRoutes = new Hono<UserEnv>()
	.use(requireUser)
	.get(
		"/",
		describeRoute({
			tags,
			summary: "Organizations I belong to",
			responses: {
				200: jsonResponse(z.object({ organizations: z.array(organizationSchema) }), "List"),
			},
		}),
		async (ctx) => ctx.json({ organizations: await service.listForUser(ctx.get("auth").userId) }),
	)
	.post(
		"/",
		describeRoute({ tags, summary: "Create an organization (you become its owner)" }),
		validate("json", createOrganizationBody),
		async (ctx) =>
			ctx.json(await service.create(ctx.get("auth").userId, ctx.req.valid("json")), 201),
	)
	.post(
		"/invitations/accept",
		describeRoute({ tags, summary: "Accept an invitation sent to my email" }),
		validate("json", acceptInvitationBody),
		async (ctx) =>
			ctx.json(await service.acceptInvitation(ctx.get("auth").userId, ctx.req.valid("json").token)),
	);

/** Routes scoped to the organization in `X-Organization-Id`. */
export const currentOrganizationRoutes = new Hono<OrgEnv>()
	.use(requireUser, requireOrg)
	.get("/", describeRoute({ tags, summary: "The current organization" }), async (ctx) =>
		ctx.json(await service.get(ctx.get("org"))),
	)
	.patch(
		"/",
		describeRoute({ tags, summary: "Rename / change time zone" }),
		requireRole("admin"),
		validate("json", updateOrganizationBody),
		async (ctx) => ctx.json(await service.update(ctx.get("org"), ctx.req.valid("json"))),
	)
	.delete(
		"/",
		describeRoute({ tags, summary: "Delete the organization" }),
		requireRole("owner"),
		async (ctx) => {
			await service.remove(ctx.get("org"));
			return ctx.body(null, 204);
		},
	)

	// ── members ──
	.get(
		"/members",
		describeRoute({
			tags: ["Members"],
			summary: "Members",
			responses: { 200: jsonResponse(z.object({ members: z.array(memberSchema) }), "List") },
		}),
		async (ctx) => ctx.json({ members: await service.listMembers(ctx.get("org").id) }),
	)
	.patch(
		"/members/:userId",
		describeRoute({ tags: ["Members"], summary: "Change a member's role" }),
		requireRole("admin"),
		validate("param", userIdParam),
		validate("json", updateMemberBody),
		async (ctx) => {
			await service.changeRole(
				ctx.get("org"),
				ctx.req.valid("param").userId,
				ctx.req.valid("json").role,
			);
			return ctx.body(null, 204);
		},
	)
	.delete(
		"/members/:userId",
		describeRoute({ tags: ["Members"], summary: "Remove a member (or leave)" }),
		validate("param", userIdParam),
		async (ctx) => {
			await service.removeMember(
				ctx.get("org"),
				ctx.get("auth").userId,
				ctx.req.valid("param").userId,
			);
			return ctx.body(null, 204);
		},
	)

	// ── invitations ──
	.get(
		"/invitations",
		describeRoute({ tags: ["Members"], summary: "Open invitations" }),
		requireRole("admin"),
		async (ctx) => ctx.json({ invitations: await service.listInvitations(ctx.get("org").id) }),
	)
	.post(
		"/invitations",
		describeRoute({ tags: ["Members"], summary: "Invite someone by email" }),
		requireRole("admin"),
		validate("json", createInvitationBody),
		async (ctx) =>
			ctx.json(
				await service.invite(ctx.get("org"), ctx.get("auth").userId, ctx.req.valid("json")),
				201,
			),
	)
	.delete(
		"/invitations/:id",
		describeRoute({ tags: ["Members"], summary: "Revoke an invitation" }),
		requireRole("admin"),
		validate("param", idParam),
		async (ctx) => {
			await service.revokeInvitation(ctx.get("org").id, ctx.req.valid("param").id);
			return ctx.body(null, 204);
		},
	);
