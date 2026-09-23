import { validate } from "@socialfly/core/http";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { ai, db, inboxTools, jobs, logger, redis } from "#src/infrastructure/index.ts";
import { requireOrg, requireRole, requireUser } from "#src/middlewares/auth.ts";
import type { OrgEnv } from "#src/shared/context.ts";
import {
	bulkUpdateItemsBody,
	createQueryBody,
	createReplyBody,
	draftBody,
	idParam,
	listItemsQuery,
	rejectReplyBody,
	retryReplyBody,
	updateItemBody,
	updateQueryBody,
	updateReplyBody,
	updateSettingsBody,
} from "./inbox.schemas.ts";
import { InboxService } from "./inbox.service.ts";

const service = new InboxService(db, ai, jobs, redis, () => inboxTools.providers, logger);
const tags = ["Inbox"];

/**
 * The engagement inbox. Every member can read; triage, drafts and replies need the
 * editor role; approving or rejecting replies and changing the approval rule need
 * admin (or owner) — replies are public posts in the brand's name.
 */
export const inboxRoutes = new Hono<OrgEnv>()
	.use(requireUser, requireOrg)

	// ── items ─────────────────────────────────────────────────────────────────
	.get(
		"/items",
		describeRoute({ tags, summary: "Comments, mentions and discussions, with inbox counters" }),
		validate("query", listItemsQuery),
		async (ctx) => ctx.json(await service.listItems(ctx.get("org").id, ctx.req.valid("query"))),
	)
	.patch(
		"/items",
		describeRoute({ tags, summary: "Set the status of several items (read, archived, spam...)" }),
		requireRole("editor"),
		validate("json", bulkUpdateItemsBody),
		async (ctx) => {
			const { ids, status } = ctx.req.valid("json");
			return ctx.json(await service.bulkUpdateItems(ctx.get("org").id, ids, status));
		},
	)
	.get(
		"/items/:id",
		describeRoute({ tags, summary: "One item with its thread and our replies" }),
		validate("param", idParam),
		async (ctx) => ctx.json(await service.getItem(ctx.get("org").id, ctx.req.valid("param").id)),
	)
	.patch(
		"/items/:id",
		describeRoute({ tags, summary: "Change an item's status or assignee" }),
		requireRole("editor"),
		validate("param", idParam),
		validate("json", updateItemBody),
		async (ctx) =>
			ctx.json(
				await service.updateItem(
					ctx.get("org").id,
					ctx.req.valid("param").id,
					ctx.req.valid("json"),
				),
			),
	)
	.post(
		"/items/:id/draft",
		describeRoute({ tags, summary: "Draft a reply with AI (not saved)" }),
		requireRole("editor"),
		validate("param", idParam),
		validate("json", draftBody),
		async (ctx) =>
			ctx.json(
				await service.draft(
					ctx.get("org").id,
					ctx.get("auth").userId,
					ctx.req.valid("param").id,
					ctx.req.valid("json"),
				),
			),
	)
	.post(
		"/items/:id/replies",
		describeRoute({
			tags,
			summary: "Save a reply draft, or submit it (sent, or sent for approval)",
		}),
		requireRole("editor"),
		validate("param", idParam),
		validate("json", createReplyBody),
		async (ctx) =>
			ctx.json(
				await service.createReply(
					ctx.get("org"),
					ctx.get("auth").userId,
					ctx.req.valid("param").id,
					ctx.req.valid("json"),
				),
				201,
			),
	)

	// ── replies ───────────────────────────────────────────────────────────────
	.patch(
		"/replies/:id",
		describeRoute({ tags, summary: "Edit or (re)submit a draft, pending or rejected reply" }),
		requireRole("editor"),
		validate("param", idParam),
		validate("json", updateReplyBody),
		async (ctx) =>
			ctx.json(
				await service.updateReply(
					ctx.get("org"),
					ctx.get("auth").userId,
					ctx.req.valid("param").id,
					ctx.req.valid("json"),
				),
			),
	)
	.post(
		"/replies/:id/approve",
		describeRoute({ tags, summary: "Approve a pending reply — it is sent right away" }),
		requireRole("admin"),
		validate("param", idParam),
		async (ctx) =>
			ctx.json(
				await service.approveReply(
					ctx.get("org"),
					ctx.get("auth").userId,
					ctx.req.valid("param").id,
				),
			),
	)
	.post(
		"/replies/:id/reject",
		describeRoute({ tags, summary: "Reject a pending reply, with a reason for its author" }),
		requireRole("admin"),
		validate("param", idParam),
		validate("json", rejectReplyBody),
		async (ctx) =>
			ctx.json(
				await service.rejectReply(
					ctx.get("org").id,
					ctx.req.valid("param").id,
					ctx.req.valid("json").reason,
				),
			),
	)
	.post(
		"/replies/:id/retry",
		describeRoute({
			tags,
			summary: "Send a failed reply again (unconfirmed ones need confirmNotSent)",
		}),
		requireRole("editor"),
		validate("param", idParam),
		validate("json", retryReplyBody),
		async (ctx) =>
			ctx.json(
				await service.retryReply(
					ctx.get("org").id,
					ctx.req.valid("param").id,
					ctx.req.valid("json").confirmNotSent,
				),
			),
	)
	.delete(
		"/replies/:id",
		describeRoute({ tags, summary: "Delete a draft or rejected reply" }),
		requireRole("editor"),
		validate("param", idParam),
		async (ctx) => {
			await service.deleteReply(ctx.get("org").id, ctx.req.valid("param").id);
			return ctx.body(null, 204);
		},
	)
	.get(
		"/approvals",
		describeRoute({ tags, summary: "Replies waiting for approval, with their items" }),
		requireRole("admin"),
		async (ctx) => ctx.json(await service.approvals(ctx.get("org").id)),
	)

	// ── listening ─────────────────────────────────────────────────────────────
	.get(
		"/listening",
		describeRoute({ tags, summary: "Keyword listening queries and the platforms they can use" }),
		async (ctx) => ctx.json(await service.listQueries(ctx.get("org").id)),
	)
	.post(
		"/listening",
		describeRoute({ tags, summary: "Start listening for a keyword (at most 10 active)" }),
		requireRole("editor"),
		validate("json", createQueryBody),
		async (ctx) =>
			ctx.json(await service.createQuery(ctx.get("org").id, ctx.req.valid("json")), 201),
	)
	.patch(
		"/listening/:id",
		describeRoute({ tags, summary: "Change, pause or resume a listening query" }),
		requireRole("editor"),
		validate("param", idParam),
		validate("json", updateQueryBody),
		async (ctx) =>
			ctx.json(
				await service.updateQuery(
					ctx.get("org").id,
					ctx.req.valid("param").id,
					ctx.req.valid("json"),
				),
			),
	)
	.delete(
		"/listening/:id",
		describeRoute({ tags, summary: "Delete a listening query (found discussions stay)" }),
		requireRole("editor"),
		validate("param", idParam),
		async (ctx) => {
			await service.deleteQuery(ctx.get("org").id, ctx.req.valid("param").id);
			return ctx.body(null, 204);
		},
	)

	// ── settings & sync ───────────────────────────────────────────────────────
	.get(
		"/settings",
		describeRoute({ tags, summary: "Reply approval rule and what each channel can do" }),
		async (ctx) => ctx.json(await service.settings(ctx.get("org").id)),
	)
	.patch(
		"/settings",
		describeRoute({ tags, summary: "Turn reply approval on or off" }),
		requireRole("admin"),
		validate("json", updateSettingsBody),
		async (ctx) => ctx.json(await service.updateSettings(ctx.get("org").id, ctx.req.valid("json"))),
	)
	.post(
		"/sync",
		describeRoute({ tags, summary: "Read new comments and mentions now (once per 5 minutes)" }),
		requireRole("editor"),
		async (ctx) => ctx.json(await service.sync(ctx.get("org").id), 202),
	);
