import { validate } from "@socialfly/core/http";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { db, jobs, logger, providers } from "#src/infrastructure/index.ts";
import { requireOrg, requireRole, requireUser } from "#src/middlewares/auth.ts";
import type { OrgEnv } from "#src/shared/context.ts";
import {
	createPostBody,
	listPostsQuery,
	postIdParam,
	retryTargetBody,
	scheduleBody,
	targetParams,
	updatePostBody,
} from "./posts.schemas";
import { PostsService } from "./posts.service";

const service = new PostsService(db, providers, jobs, logger);
const tags = ["Posts"];

export const postsRoutes = new Hono<OrgEnv>()
	.use(requireUser, requireOrg)
	.get(
		"/",
		describeRoute({ tags, summary: "Posts in a date range (calendar / list views)" }),
		validate("query", listPostsQuery),
		async (ctx) => ctx.json(await service.list(ctx.get("org").id, ctx.req.valid("query"))),
	)
	.get(
		"/:id",
		describeRoute({ tags, summary: "A post with its targets and timeline" }),
		validate("param", postIdParam),
		async (ctx) => ctx.json(await service.get(ctx.get("org").id, ctx.req.valid("param").id)),
	)
	.post(
		"/validate",
		describeRoute({ tags, summary: "Check a draft against every selected platform (no save)" }),
		requireRole("editor"),
		validate("json", updatePostBody.pick({ content: true, mediaIds: true, targets: true })),
		async (ctx) => ctx.json(await service.validate(ctx.get("org").id, ctx.req.valid("json"))),
	)
	.post(
		"/",
		describeRoute({ tags, summary: "Create a post (as a draft, or scheduled)" }),
		requireRole("editor"),
		validate("json", createPostBody),
		async (ctx) =>
			ctx.json(
				await service.create(ctx.get("org").id, ctx.get("auth").userId, ctx.req.valid("json")),
				201,
			),
	)
	.put(
		"/:id",
		describeRoute({ tags, summary: "Replace a post's content, media and channels" }),
		requireRole("editor"),
		validate("param", postIdParam),
		validate("json", updatePostBody),
		async (ctx) =>
			ctx.json(
				await service.update(ctx.get("org").id, ctx.req.valid("param").id, ctx.req.valid("json")),
			),
	)
	.post(
		"/:id/schedule",
		describeRoute({ tags, summary: "Schedule (or publish now when scheduledAt is null)" }),
		requireRole("editor"),
		validate("param", postIdParam),
		validate("json", scheduleBody),
		async (ctx) =>
			ctx.json(
				await service.schedule(
					ctx.get("org").id,
					ctx.req.valid("param").id,
					ctx.req.valid("json").scheduledAt ?? null,
				),
			),
	)
	.post(
		"/:id/unschedule",
		describeRoute({ tags, summary: "Move back to drafts" }),
		requireRole("editor"),
		validate("param", postIdParam),
		async (ctx) => ctx.json(await service.unschedule(ctx.get("org").id, ctx.req.valid("param").id)),
	)
	.post(
		"/:id/targets/:targetId/retry",
		describeRoute({ tags, summary: "Retry one failed channel" }),
		requireRole("editor"),
		validate("param", targetParams),
		validate("json", retryTargetBody),
		async (ctx) => {
			const { id, targetId } = ctx.req.valid("param");
			return ctx.json(
				await service.retryTarget(
					ctx.get("org").id,
					id,
					targetId,
					ctx.req.valid("json").confirmNotPublished,
				),
			);
		},
	)
	.delete(
		"/:id",
		describeRoute({ tags, summary: "Delete (published copies stay on the platforms)" }),
		requireRole("editor"),
		validate("param", z.object({ id: z.uuid() })),
		async (ctx) => {
			await service.remove(ctx.get("org").id, ctx.req.valid("param").id);
			return ctx.body(null, 204);
		},
	);
