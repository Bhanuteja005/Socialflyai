import { validate } from "@socialfly/core/http";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { ai, db, jobs, redis, researchTools } from "#src/infrastructure/index.ts";
import { requireOrg, requireRole, requireUser } from "#src/middlewares/auth.ts";
import type { OrgEnv } from "#src/shared/context.ts";
import { KeywordsService } from "./keywords.service.ts";
import {
	addKeywordsBody,
	applyInsightsBody,
	checksQuery,
	createCompetitorBody,
	createPromptBody,
	idParam,
	keywordIdeasBody,
	listRunsQuery,
	pagesQuery,
	rankingsQuery,
	startRunBody,
	summaryQuery,
	updateCompetitorBody,
	updateKeywordBody,
	updatePromptBody,
} from "./research.schemas.ts";
import { ResearchService } from "./research.service.ts";
import { VisibilityService } from "./visibility.service.ts";

const seo = () => researchTools.seo;
const research = new ResearchService(db, ai, jobs, () => seo() !== null);
const keywords = new KeywordsService(db, jobs, seo);
const visibility = new VisibilityService(db, jobs, redis, () => researchTools.visibilityEngines);
const tags = ["Research"];

/**
 * Website research, competitors, SEO keywords and AI visibility. Every member can read;
 * anything that writes or spends money needs the editor role.
 */
export const researchRoutes = new Hono<OrgEnv>()
	.use(requireUser, requireOrg)
	.get(
		"/capabilities",
		describeRoute({ tags, summary: "Which research features are configured on this server" }),
		(ctx) =>
			ctx.json({
				research: ai.text !== null,
				seo: seo() !== null,
				visibilityEngines: researchTools.visibilityEngines,
			}),
	)

	// ── runs ──────────────────────────────────────────────────────────────────
	.post(
		"/runs",
		describeRoute({ tags, summary: "Research the brand's website (async — poll the run)" }),
		requireRole("editor"),
		validate("json", startRunBody),
		async (ctx) =>
			ctx.json(
				await research.startRun(ctx.get("org").id, ctx.get("auth").userId, ctx.req.valid("json")),
				202,
			),
	)
	.get(
		"/runs",
		describeRoute({ tags, summary: "Recent research runs (newest first)" }),
		validate("query", listRunsQuery),
		async (ctx) =>
			ctx.json(await research.listRuns(ctx.get("org").id, ctx.req.valid("query").limit)),
	)
	.get(
		"/runs/latest",
		describeRoute({
			tags,
			summary: "The latest successful run, else the latest run; null if none",
		}),
		async (ctx) => ctx.json(await research.latestRun(ctx.get("org").id)),
	)
	.get(
		"/runs/:id",
		describeRoute({ tags, summary: "One research run with its brief" }),
		validate("param", idParam),
		async (ctx) => ctx.json(await research.getRun(ctx.get("org").id, ctx.req.valid("param").id)),
	)
	.get(
		"/runs/:id/pages",
		describeRoute({ tags, summary: "Pages a run crawled (keyset paginated)" }),
		validate("param", idParam),
		validate("query", pagesQuery),
		async (ctx) =>
			ctx.json(
				await research.listPages(
					ctx.get("org").id,
					ctx.req.valid("param").id,
					ctx.req.valid("query"),
				),
			),
	)
	.post(
		"/insights/apply",
		describeRoute({
			tags,
			summary: "Add picked buyer questions, competitors and keywords from a brief",
		}),
		requireRole("editor"),
		validate("json", applyInsightsBody),
		async (ctx) => ctx.json(await research.applyInsights(ctx.get("org").id, ctx.req.valid("json"))),
	)

	// ── competitors ───────────────────────────────────────────────────────────
	.get(
		"/competitors",
		describeRoute({ tags, summary: "Competitors tracked in AI answers" }),
		async (ctx) => ctx.json(await research.listCompetitors(ctx.get("org").id)),
	)
	.post(
		"/competitors",
		describeRoute({ tags, summary: "Add a competitor" }),
		requireRole("editor"),
		validate("json", createCompetitorBody),
		async (ctx) =>
			ctx.json(await research.createCompetitor(ctx.get("org").id, ctx.req.valid("json")), 201),
	)
	.patch(
		"/competitors/:id",
		describeRoute({ tags, summary: "Rename a competitor or change its domain and aliases" }),
		requireRole("editor"),
		validate("param", idParam),
		validate("json", updateCompetitorBody),
		async (ctx) =>
			ctx.json(
				await research.updateCompetitor(
					ctx.get("org").id,
					ctx.req.valid("param").id,
					ctx.req.valid("json"),
				),
			),
	)
	.delete(
		"/competitors/:id",
		describeRoute({ tags, summary: "Remove a competitor" }),
		requireRole("editor"),
		validate("param", idParam),
		async (ctx) => {
			await research.deleteCompetitor(ctx.get("org").id, ctx.req.valid("param").id);
			return ctx.body(null, 204);
		},
	)

	// ── keywords ──────────────────────────────────────────────────────────────
	.get(
		"/keywords",
		describeRoute({ tags, summary: "Keywords with metrics and latest Google positions" }),
		async (ctx) => ctx.json({ items: await keywords.list(ctx.get("org").id) }),
	)
	.post(
		"/keywords",
		describeRoute({ tags, summary: "Add keywords (measured right away when SEO is configured)" }),
		requireRole("editor"),
		validate("json", addKeywordsBody),
		async (ctx) => ctx.json(await keywords.add(ctx.get("org").id, ctx.req.valid("json")), 201),
	)
	.post(
		"/keywords/ideas",
		describeRoute({ tags, summary: "Related keyword ideas with volumes (synchronous, paid)" }),
		requireRole("editor"),
		validate("json", keywordIdeasBody),
		async (ctx) =>
			ctx.json(
				await keywords.ideas(ctx.get("org").id, ctx.get("auth").userId, ctx.req.valid("json")),
			),
	)
	.patch(
		"/keywords/:id",
		describeRoute({ tags, summary: "Track or stop tracking a keyword's Google position" }),
		requireRole("editor"),
		validate("param", idParam),
		validate("json", updateKeywordBody),
		async (ctx) =>
			ctx.json(
				await keywords.update(
					ctx.get("org").id,
					ctx.req.valid("param").id,
					ctx.req.valid("json").tracked,
				),
			),
	)
	.delete(
		"/keywords/:id",
		describeRoute({ tags, summary: "Remove a keyword and its ranking history" }),
		requireRole("editor"),
		validate("param", idParam),
		async (ctx) => {
			await keywords.remove(ctx.get("org").id, ctx.req.valid("param").id);
			return ctx.body(null, 204);
		},
	)
	.get(
		"/keywords/:id/rankings",
		describeRoute({ tags, summary: "A keyword's Google position per checked day" }),
		validate("param", idParam),
		validate("query", rankingsQuery),
		async (ctx) =>
			ctx.json(
				await keywords.rankings(
					ctx.get("org").id,
					ctx.req.valid("param").id,
					ctx.req.valid("query").days,
				),
			),
	)

	// ── AI visibility ─────────────────────────────────────────────────────────
	.get(
		"/visibility/prompts",
		describeRoute({ tags, summary: "Buyer questions checked across AI engines" }),
		async (ctx) => ctx.json(await visibility.listPrompts(ctx.get("org").id)),
	)
	.post(
		"/visibility/prompts",
		describeRoute({ tags, summary: "Add a prompt (at most 25 active)" }),
		requireRole("editor"),
		validate("json", createPromptBody),
		async (ctx) =>
			ctx.json(await visibility.createPrompt(ctx.get("org").id, ctx.req.valid("json").prompt), 201),
	)
	.patch(
		"/visibility/prompts/:id",
		describeRoute({ tags, summary: "Edit, pause or resume a prompt" }),
		requireRole("editor"),
		validate("param", idParam),
		validate("json", updatePromptBody),
		async (ctx) =>
			ctx.json(
				await visibility.updatePrompt(
					ctx.get("org").id,
					ctx.req.valid("param").id,
					ctx.req.valid("json"),
				),
			),
	)
	.delete(
		"/visibility/prompts/:id",
		describeRoute({ tags, summary: "Delete a prompt and its checks" }),
		requireRole("editor"),
		validate("param", idParam),
		async (ctx) => {
			await visibility.deletePrompt(ctx.get("org").id, ctx.req.valid("param").id);
			return ctx.body(null, 204);
		},
	)
	.get(
		"/visibility/prompts/:id/checks",
		describeRoute({ tags, summary: "Recent answers to one prompt, newest first" }),
		validate("param", idParam),
		validate("query", checksQuery),
		async (ctx) =>
			ctx.json(
				await visibility.promptChecks(
					ctx.get("org").id,
					ctx.req.valid("param").id,
					ctx.req.valid("query").limit,
				),
			),
	)
	.post(
		"/visibility/run",
		describeRoute({ tags, summary: "Run visibility checks now (at most once per hour)" }),
		requireRole("editor"),
		async (ctx) => ctx.json(await visibility.runNow(ctx.get("org").id), 202),
	)
	.get(
		"/visibility/summary",
		describeRoute({
			tags,
			summary: "Mention rate, rank, sentiment, share of voice and weekly trend",
		}),
		validate("query", summaryQuery),
		async (ctx) =>
			ctx.json(await visibility.summary(ctx.get("org").id, ctx.req.valid("query").days)),
	)
	.get(
		"/visibility/checks/:id",
		describeRoute({ tags, summary: "One check with the full answer" }),
		validate("param", idParam),
		async (ctx) => ctx.json(await visibility.check(ctx.get("org").id, ctx.req.valid("param").id)),
	);
