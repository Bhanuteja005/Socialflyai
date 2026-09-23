import { validate } from "@socialfly/core/http";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { db, storage } from "#src/infrastructure/index.ts";
import { requireOrg, requireRole, requireUser } from "#src/middlewares/auth.ts";
import type { OrgEnv } from "#src/shared/context.ts";
import { MediaService } from "./media.service";

export const mediaService = new MediaService(db, storage);
const tags = ["Media"];
const idParam = z.object({ id: z.uuid() });

export const mediaRoutes = new Hono<OrgEnv>()
	.use(requireUser, requireOrg)
	.get(
		"/",
		describeRoute({ tags, summary: "Media library (newest first)" }),
		validate(
			"query",
			z.object({
				kind: z.enum(["image", "video"]).optional(),
				cursor: z.uuid().optional(),
				limit: z.coerce.number().int().min(1).max(100).default(40),
			}),
		),
		async (ctx) => {
			const q = ctx.req.valid("query");
			return ctx.json(
				await mediaService.list(ctx.get("org").id, {
					kind: q.kind,
					before: q.cursor,
					limit: q.limit,
				}),
			);
		},
	)
	.post(
		"/uploads",
		describeRoute({ tags, summary: "Start an upload — returns a presigned PUT URL" }),
		requireRole("editor"),
		validate(
			"json",
			z.object({
				fileName: z.string().min(1).max(255),
				mimeType: z.string().min(3).max(100),
				sizeBytes: z.number().int().positive(),
			}),
		),
		async (ctx) =>
			ctx.json(
				await mediaService.createUpload(
					ctx.get("org").id,
					ctx.get("auth").userId,
					ctx.req.valid("json"),
				),
				201,
			),
	)
	.post(
		"/:id/complete",
		describeRoute({ tags, summary: "Confirm an upload finished" }),
		requireRole("editor"),
		validate("param", idParam),
		validate(
			"json",
			z.object({
				width: z.number().int().positive().optional(),
				height: z.number().int().positive().optional(),
				durationMs: z.number().int().positive().optional(),
			}),
		),
		async (ctx) =>
			ctx.json(
				await mediaService.completeUpload(
					ctx.get("org").id,
					ctx.req.valid("param").id,
					ctx.req.valid("json"),
				),
			),
	)
	.patch(
		"/:id",
		describeRoute({ tags, summary: "Set alt text" }),
		requireRole("editor"),
		validate("param", idParam),
		validate("json", z.object({ altText: z.string().max(1000).nullable() })),
		async (ctx) =>
			ctx.json(
				await mediaService.updateAltText(
					ctx.get("org").id,
					ctx.req.valid("param").id,
					ctx.req.valid("json").altText,
				),
			),
	)
	.delete(
		"/:id",
		describeRoute({ tags, summary: "Delete a file" }),
		requireRole("editor"),
		validate("param", idParam),
		async (ctx) => {
			await mediaService.remove(ctx.get("org").id, ctx.req.valid("param").id);
			return ctx.body(null, 204);
		},
	);
