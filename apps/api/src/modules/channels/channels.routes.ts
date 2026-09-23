import { validate } from "@socialfly/core/http";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { db, jobs, logger, providers, redis, tokenCipher } from "#src/infrastructure/index.ts";
import { requireOrg, requireRole, requireUser } from "#src/middlewares/auth.ts";
import type { OrgEnv } from "#src/shared/context.ts";
import { ChannelsService } from "./channels.service";

const service = new ChannelsService(db, redis, providers, tokenCipher, jobs, logger);
const tags = ["Channels"];

const providerParam = z.object({ provider: z.string().regex(/^[a-z_]+$/) });
const selectionParam = z.object({ selectionId: z.string().min(8).max(64) });

/**
 * The platform redirects the BROWSER here after consent. It is deliberately not
 * behind requireUser: the single-use state (bound to org + user at connect time)
 * is what authenticates this request.
 */
export const channelCallbackRoutes = new Hono().get(
	"/callback/:provider",
	describeRoute({ tags, summary: "OAuth redirect target (browser)", hide: true }),
	validate("param", providerParam),
	validate(
		"query",
		z.object({
			code: z.string().optional(),
			state: z.string().optional(),
			error: z.string().optional(),
		}),
	),
	async (ctx) =>
		ctx.redirect(
			await service.completeConnect(ctx.req.valid("param").provider, ctx.req.valid("query")),
		),
);

export const channelsRoutes = new Hono<OrgEnv>()
	.use(requireUser, requireOrg)
	.get("/providers", describeRoute({ tags, summary: "Platforms available to connect" }), (ctx) =>
		ctx.json({ providers: service.listProviders() }),
	)
	.get("/", describeRoute({ tags, summary: "Connected channels" }), async (ctx) =>
		ctx.json({ channels: await service.list(ctx.get("org").id) }),
	)
	.post(
		"/connect/:provider",
		describeRoute({ tags, summary: "Start OAuth — returns the platform consent URL" }),
		requireRole("admin"),
		validate("param", providerParam),
		async (ctx) =>
			ctx.json(
				await service.startConnect(
					ctx.get("org").id,
					ctx.get("auth").userId,
					ctx.req.valid("param").provider,
				),
			),
	)
	.get(
		"/selections/:selectionId",
		describeRoute({ tags, summary: "Accounts found during connect (pages, IG accounts...)" }),
		requireRole("admin"),
		validate("param", selectionParam),
		async (ctx) =>
			ctx.json(await service.getSelection(ctx.get("org").id, ctx.req.valid("param").selectionId)),
	)
	.post(
		"/selections/:selectionId",
		describeRoute({ tags, summary: "Connect the chosen accounts" }),
		requireRole("admin"),
		validate("param", selectionParam),
		validate("json", z.object({ externalIds: z.array(z.string().min(1)).min(1).max(50) })),
		async (ctx) =>
			ctx.json(
				{
					channels: await service.confirmSelection(
						ctx.get("org").id,
						ctx.req.valid("param").selectionId,
						ctx.req.valid("json").externalIds,
					),
				},
				201,
			),
	)
	.delete(
		"/:id",
		describeRoute({ tags, summary: "Disconnect a channel (cancels its scheduled posts)" }),
		requireRole("admin"),
		validate("param", z.object({ id: z.uuid() })),
		async (ctx) => {
			await service.disconnect(ctx.get("org").id, ctx.req.valid("param").id);
			return ctx.body(null, 204);
		},
	);
