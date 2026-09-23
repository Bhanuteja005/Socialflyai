import { validate } from "@socialfly/core/http";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { ai, db, jobs } from "#src/infrastructure/index.ts";
import { requireOrg, requireRole, requireUser } from "#src/middlewares/auth.ts";
import type { OrgEnv } from "#src/shared/context.ts";
import {
	brandProfileBody,
	carouselBody,
	carouselOutlineInput,
	generatePostsInput,
	generationIdParam,
	hashtagsInput,
	imageBody,
	listGenerationsQuery,
	rewriteInput,
	videoBody,
	videoScriptInput,
} from "./ai.schemas.ts";
import { AiService } from "./ai.service.ts";

const service = new AiService(db, ai, jobs);
const tags = ["AI"];

export const aiRoutes = new Hono<OrgEnv>()
	.use(requireUser, requireOrg)
	.get(
		"/capabilities",
		describeRoute({ tags, summary: "Which AI features are configured, and this month's budget" }),
		async (ctx) => ctx.json(await service.capabilities(ctx.get("org").id)),
	)
	.get(
		"/brand",
		describeRoute({ tags, summary: "The organization's brand profile" }),
		async (ctx) => ctx.json(await service.getBrand(ctx.get("org").id)),
	)
	.put(
		"/brand",
		describeRoute({ tags, summary: "Save the brand profile used in every generation" }),
		requireRole("editor"),
		validate("json", brandProfileBody),
		async (ctx) =>
			ctx.json(
				await service.saveBrand(ctx.get("org").id, ctx.get("auth").userId, ctx.req.valid("json")),
			),
	)
	.post(
		"/posts",
		describeRoute({ tags, summary: "Draft posts for one or more platforms" }),
		requireRole("editor"),
		validate("json", generatePostsInput),
		async (ctx) =>
			ctx.json(
				await service.generatePosts(
					ctx.get("org").id,
					ctx.get("auth").userId,
					ctx.req.valid("json"),
				),
			),
	)
	.post(
		"/rewrite",
		describeRoute({ tags, summary: "Rewrite a draft (shorter, punchier, custom...)" }),
		requireRole("editor"),
		validate("json", rewriteInput),
		async (ctx) =>
			ctx.json(
				await service.rewrite(ctx.get("org").id, ctx.get("auth").userId, ctx.req.valid("json")),
			),
	)
	.post(
		"/hashtags",
		describeRoute({ tags, summary: "Suggest hashtags for a post" }),
		requireRole("editor"),
		validate("json", hashtagsInput),
		async (ctx) =>
			ctx.json(
				await service.hashtags(ctx.get("org").id, ctx.get("auth").userId, ctx.req.valid("json")),
			),
	)
	.post(
		"/carousels/outline",
		describeRoute({ tags, summary: "Plan carousel slides, caption and hashtags" }),
		requireRole("editor"),
		validate("json", carouselOutlineInput),
		async (ctx) =>
			ctx.json(
				await service.carouselOutline(
					ctx.get("org").id,
					ctx.get("auth").userId,
					ctx.req.valid("json"),
				),
			),
	)
	.post(
		"/images",
		describeRoute({ tags, summary: "Generate an image (async — poll the generation)" }),
		requireRole("editor"),
		validate("json", imageBody),
		async (ctx) =>
			ctx.json(
				await service.startImage(ctx.get("org").id, ctx.get("auth").userId, ctx.req.valid("json")),
				202,
			),
	)
	.post(
		"/carousels",
		describeRoute({
			tags,
			summary: "Render carousel slides to images (async — poll the generation)",
		}),
		requireRole("editor"),
		validate("json", carouselBody),
		async (ctx) =>
			ctx.json(
				await service.startCarousel(
					ctx.get("org").id,
					ctx.get("auth").userId,
					ctx.req.valid("json"),
				),
				202,
			),
	)
	.post(
		"/videos/script",
		describeRoute({ tags, summary: "Plan a short video: scenes, caption and hashtags" }),
		requireRole("editor"),
		validate("json", videoScriptInput),
		async (ctx) =>
			ctx.json(
				await service.videoScript(ctx.get("org").id, ctx.get("auth").userId, ctx.req.valid("json")),
			),
	)
	.post(
		"/videos",
		describeRoute({
			tags,
			summary: "Render a short vertical video from scenes (async — poll the generation)",
		}),
		requireRole("editor"),
		validate("json", videoBody),
		async (ctx) =>
			ctx.json(
				await service.startVideo(ctx.get("org").id, ctx.get("auth").userId, ctx.req.valid("json")),
				202,
			),
	)
	.get(
		"/generations",
		describeRoute({ tags, summary: "Generation history (newest first)" }),
		validate("query", listGenerationsQuery),
		async (ctx) =>
			ctx.json(await service.listGenerations(ctx.get("org").id, ctx.req.valid("query"))),
	)
	.get(
		"/generations/:id",
		describeRoute({ tags, summary: "One generation, with its media once ready" }),
		validate("param", generationIdParam),
		async (ctx) =>
			ctx.json(await service.getGeneration(ctx.get("org").id, ctx.req.valid("param").id)),
	);
