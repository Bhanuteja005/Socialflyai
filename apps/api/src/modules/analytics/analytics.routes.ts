import { validate } from "@socialfly/core/http";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { db, jobs, providers, redis } from "#src/infrastructure/index.ts";
import { requireOrg, requireRole, requireUser } from "#src/middlewares/auth.ts";
import type { OrgEnv } from "#src/shared/context.ts";
import {
	bestTimesQuery,
	channelIdParam,
	overviewQuery,
	postIdParam,
	postsQuery,
	rangeQuery,
} from "./analytics.schemas.ts";
import { AnalyticsService } from "./analytics.service.ts";

const service = new AnalyticsService(db, providers, jobs, redis);
const tags = ["Analytics"];

/** Reads are open to every member (viewer and up); only a refresh spends platform budget. */
export const analyticsRoutes = new Hono<OrgEnv>()
	.use(requireUser, requireOrg)
	.get(
		"/overview",
		describeRoute({
			tags,
			summary: "Totals, previous period, daily series, per-channel numbers and top posts",
		}),
		validate("query", overviewQuery),
		async (ctx) => ctx.json(await service.overview(ctx.get("org").id, ctx.req.valid("query"))),
	)
	.get(
		"/posts",
		describeRoute({ tags, summary: "Published posts with their latest metrics" }),
		validate("query", postsQuery),
		async (ctx) => ctx.json(await service.posts(ctx.get("org").id, ctx.req.valid("query"))),
	)
	.get(
		"/posts/:postId",
		describeRoute({ tags, summary: "A post's metrics per channel, with history" }),
		validate("param", postIdParam),
		async (ctx) => ctx.json(await service.post(ctx.get("org").id, ctx.req.valid("param").postId)),
	)
	.get(
		"/channels/:channelId",
		describeRoute({ tags, summary: "Account numbers (followers, reach...) per day" }),
		validate("param", channelIdParam),
		validate("query", rangeQuery),
		async (ctx) =>
			ctx.json(
				await service.channel(
					ctx.get("org").id,
					ctx.req.valid("param").channelId,
					ctx.req.valid("query"),
				),
			),
	)
	.get(
		"/best-times",
		describeRoute({ tags, summary: "When this organization's posts perform best" }),
		validate("query", bestTimesQuery),
		async (ctx) => ctx.json(await service.bestTimes(ctx.get("org").id, ctx.req.valid("query"))),
	)
	.post(
		"/refresh",
		describeRoute({ tags, summary: "Collect metrics now (at most once per 10 minutes)" }),
		requireRole("editor"),
		async (ctx) => ctx.json(await service.refresh(ctx.get("org").id), 202),
	);
