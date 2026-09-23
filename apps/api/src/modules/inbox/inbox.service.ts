import {
	type AiModels,
	type BrandContext,
	draftReply,
	isAiError,
	PLATFORM_GUIDES,
	type Platform,
	type TextResult,
} from "@socialfly/ai";
import { AppError, badRequest, conflict, notFound } from "@socialfly/core/errors";
import type { Logger } from "@socialfly/core/logger";
import type { Redis } from "@socialfly/core/redis";
import {
	and,
	asc,
	type Database,
	desc,
	eq,
	gte,
	ilike,
	inArray,
	ne,
	or,
	type SQL,
	schema,
	sql,
} from "@socialfly/db";
import type { EngagementSupport, ProviderRegistry } from "@socialfly/integrations";
import type { JobProducer } from "@socialfly/queue";
import { roleAtLeast } from "#src/middlewares/auth.ts";
import { assertBudget } from "#src/modules/ai/ai.budget.ts";
import { toAppError } from "#src/modules/ai/ai.service.ts";
import { lockOrg } from "#src/modules/research/research.shared.ts";
import type { OrgContext } from "#src/shared/context.ts";
import {
	type CreateQueryInput,
	type CreateReplyInput,
	type DraftInput,
	LIST_TEXT_MAX,
	type ListItemsQuery,
	MAX_ACTIVE_QUERIES,
	type UpdateItemInput,
	type UpdateQueryInput,
	type UpdateReplyInput,
} from "./inbox.schemas.ts";
import { missingScopes } from "./inbox.shared.ts";

const {
	aiGenerations,
	brandProfiles,
	channels,
	engagementItems,
	engagementReplies,
	listeningQueries,
	memberships,
	organizations,
	posts,
	postTargets,
	users,
} = schema;

type ItemRow = typeof engagementItems.$inferSelect;
type ReplyRow = typeof engagementReplies.$inferSelect;
type ItemStatus = ItemRow["status"];
type ReplyStatus = ReplyRow["status"];

/** One manual sync per organization per this many seconds: each spends platform read budget. */
const SYNC_COOLDOWN_SECONDS = 5 * 60;
const POST_EXCERPT_CHARS = 200;
/** Thread context shown with an item (the most recent messages under the same post). */
const THREAD_LIMIT = 200;
/** Replies that are on their way to the platform: one at a time per item. */
const IN_FLIGHT: ReplyStatus[] = ["pending_approval", "approved", "queued", "sending"];
const EDITABLE: ReplyStatus[] = ["draft", "pending_approval", "rejected"];

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

const clip = (text: string, max: number) => {
	const chars = [...text];
	return chars.length <= max ? text : `${chars.slice(0, max - 1).join("")}…`;
};

/** Escapes LIKE wildcards so a search for "50%" matches that text, not everything. */
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

type Cursor = { t: string; id: string; r?: number };
const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString("base64url");
function decodeCursor(raw: string, sort: ListItemsQuery["sort"]): Cursor {
	try {
		const c = JSON.parse(Buffer.from(raw, "base64url").toString()) as Cursor;
		if (
			typeof c.t !== "string" ||
			Number.isNaN(Date.parse(c.t)) ||
			typeof c.id !== "string" ||
			!/^[0-9a-f-]{36}$/i.test(c.id) ||
			(sort === "relevance" && typeof c.r !== "number")
		)
			throw new Error("bad cursor");
		return c;
	} catch {
		throw badRequest("Invalid cursor");
	}
}

const replyNotPossible = (reason: string) =>
	new AppError(409, "reply_not_possible", reason, { reason });

/**
 * The engagement inbox: items the worker synced (comments, mentions, discussions), AI
 * reply drafts, and the reply workflow up to the moment a reply is queued.
 *
 * Reply status ownership (mirrors post_targets): this service writes draft,
 * pending_approval, approved, rejected and queued (including manual retries); the
 * worker's reply sender (apps/worker/src/engagement) writes sending, sent, failed and
 * unconfirmed. Nobody else writes engagement_replies.status. Every transition here is
 * a conditional UPDATE on the expected current status, so two users acting at once
 * cannot both succeed.
 */
export class InboxService {
	constructor(
		private readonly db: Database,
		/** Read on every call so tests can swap the text model. */
		private readonly ai: AiModels,
		private readonly jobs: JobProducer,
		private readonly redis: Redis,
		/** Read at call time so tests can swap in a fake registry. */
		private readonly providers: () => ProviderRegistry,
		private readonly logger: Logger,
	) {}

	// ── capability ──────────────────────────────────────────────────────────────

	/** The provider's inbox support, when the provider is configured on this server. */
	private engagementOf(provider: string): EngagementSupport | null {
		const p = this.providers().get(provider);
		return p?.isConfigured() ? (p.engagement ?? null) : null;
	}

	private providerName(provider: string) {
		return this.providers().get(provider)?.displayName ?? provider;
	}

	/** Why the brand cannot answer this item right now; null when it can. */
	private replyBlockedReason(
		item: { fromSelf: boolean; provider: string },
		channel: { status: string; scopes: string[] },
	): string | null {
		if (item.fromSelf) return "This is the brand's own message";
		if (channel.status === "needs_reauth") return "Reconnect this channel to reply";
		if (channel.status !== "active") return "This channel is disconnected";
		const engagement = this.engagementOf(item.provider);
		if (!engagement) return `Replying on ${this.providerName(item.provider)} is not supported`;
		if (missingScopes(channel.scopes, engagement.requiredScopes.reply).length > 0)
			return "Reconnect this channel to allow SocialFly to reply";
		return null;
	}

	private assertLength(text: string, provider: string) {
		const engagement = this.engagementOf(provider);
		if (!engagement) return;
		const limit = engagement.maxReplyLength;
		const length = [...text].length;
		if (length > limit) {
			throw new AppError(
				422,
				"reply_too_long",
				`Replies on ${this.providerName(provider)} can be at most ${limit} characters`,
				{ limit, length },
			);
		}
	}

	// ── items ───────────────────────────────────────────────────────────────────

	/** Item + channel + (our post) in one query; columns are qualified because it joins. */
	private itemQuery() {
		return this.db
			.select({
				item: engagementItems,
				channelName: channels.name,
				channelStatus: channels.status,
				channelScopes: channels.scopes,
				postId: postTargets.postId,
				postText: sql<string | null>`coalesce(${postTargets.contentOverride}, ${posts.content})`,
				postDeletedAt: posts.deletedAt,
			})
			.from(engagementItems)
			.innerJoin(channels, eq(channels.id, engagementItems.channelId))
			.leftJoin(postTargets, eq(postTargets.id, engagementItems.postTargetId))
			.leftJoin(posts, eq(posts.id, postTargets.postId));
	}

	private async latestReplies(itemIds: string[]) {
		if (itemIds.length === 0)
			return new Map<string, { id: string; status: ReplyStatus; text: string }>();
		const rows = await this.db
			.selectDistinctOn([engagementReplies.itemId], {
				itemId: engagementReplies.itemId,
				id: engagementReplies.id,
				status: engagementReplies.status,
				text: engagementReplies.text,
			})
			.from(engagementReplies)
			.where(inArray(engagementReplies.itemId, itemIds))
			.orderBy(
				engagementReplies.itemId,
				desc(engagementReplies.createdAt),
				desc(engagementReplies.id),
			);
		return new Map(rows.map((r) => [r.itemId, { id: r.id, status: r.status, text: r.text }]));
	}

	private toItemDto(
		row: Awaited<ReturnType<ReturnType<InboxService["itemQuery"]>["execute"]>>[number],
		latest: { id: string; status: ReplyStatus; text: string } | null,
		opts: { full: boolean },
	) {
		const i = row.item;
		const blocked = this.replyBlockedReason(i, {
			status: row.channelStatus,
			scopes: row.channelScopes,
		});
		return {
			id: i.id,
			kind: i.kind,
			provider: i.provider,
			channel: { id: i.channelId, name: row.channelName, provider: i.provider },
			author: i.author,
			text: opts.full ? i.text : clip(i.text, LIST_TEXT_MAX),
			title: i.title,
			url: i.url,
			community: i.community,
			postedAt: i.postedAt.toISOString(),
			status: i.status,
			relevance: i.relevance,
			relevanceReason: i.relevanceReason,
			sentiment: i.sentiment,
			fromSelf: i.fromSelf,
			post:
				row.postId && !row.postDeletedAt
					? { postId: row.postId, excerpt: clip(row.postText ?? "", POST_EXCERPT_CHARS) }
					: null,
			latestReply: latest,
			canReply: blocked === null,
			replyBlockedReason: blocked,
			// Lets the composer count against the real limit before the first submit.
			maxReplyLength: this.engagementOf(i.provider)?.maxReplyLength ?? null,
		};
	}

	async listItems(orgId: string, q: ListItemsQuery) {
		const filters: SQL[] = [
			eq(engagementItems.organizationId, orgId),
			eq(engagementItems.fromSelf, false),
			q.status === "open"
				? inArray(engagementItems.status, ["new", "read"])
				: eq(engagementItems.status, q.status),
		];
		if (q.channelIds?.length) filters.push(inArray(engagementItems.channelId, q.channelIds));
		if (q.kinds?.length) filters.push(inArray(engagementItems.kind, q.kinds));
		if (q.minRelevance !== undefined) filters.push(gte(engagementItems.relevance, q.minRelevance));
		if (q.sentiment) filters.push(eq(engagementItems.sentiment, q.sentiment));
		if (q.q) {
			const pattern = likePattern(q.q);
			filters.push(
				or(
					ilike(engagementItems.text, pattern),
					ilike(engagementItems.title, pattern),
					sql`${engagementItems.author}->>'name' ilike ${pattern}`,
					sql`${engagementItems.author}->>'handle' ilike ${pattern}`,
				) as SQL,
			);
		}
		// Keyset pagination. Relevance sorts unscored items last (as -1), then by recency.
		const score = sql`coalesce(${engagementItems.relevance}, -1)`;
		if (q.before) {
			const c = decodeCursor(q.before, q.sort);
			filters.push(
				q.sort === "relevance"
					? sql`(${score}, ${engagementItems.postedAt}, ${engagementItems.id}) < (${c.r}, ${c.t}::timestamptz, ${c.id}::uuid)`
					: sql`(${engagementItems.postedAt}, ${engagementItems.id}) < (${c.t}::timestamptz, ${c.id}::uuid)`,
			);
		}
		const order =
			q.sort === "relevance"
				? [sql`${score} desc`, desc(engagementItems.postedAt), desc(engagementItems.id)]
				: [desc(engagementItems.postedAt), desc(engagementItems.id)];

		const rows = await this.itemQuery()
			.where(and(...filters))
			.orderBy(...order)
			.limit(q.limit + 1);
		const page = rows.slice(0, q.limit);
		const latest = await this.latestReplies(page.map((r) => r.item.id));
		const last = page.at(-1)?.item;
		return {
			items: page.map((r) => this.toItemDto(r, latest.get(r.item.id) ?? null, { full: false })),
			nextCursor:
				rows.length > q.limit && last
					? encodeCursor({
							t: last.postedAt.toISOString(),
							id: last.id,
							...(q.sort === "relevance" ? { r: last.relevance ?? -1 } : {}),
						})
					: null,
			counts: await this.counts(orgId),
		};
	}

	/** Whole-inbox counters for the sidebar badges (not affected by list filters). */
	private async counts(orgId: string) {
		const [items] = (await this.db.execute(sql`
			select count(*) filter (where i.status = 'new')::int as "new",
				count(*) filter (where i.status in ('new', 'read'))::int as "open"
			from engagement_items i
			where i.organization_id = ${orgId} and i.from_self = false and i.status in ('new', 'read')
		`)) as unknown as { new: number; open: number }[];
		const [replies] = (await this.db.execute(sql`
			select count(*)::int as n from engagement_replies r
			where r.organization_id = ${orgId} and r.status = 'pending_approval'
		`)) as unknown as { n: number }[];
		return {
			new: Number(items?.new ?? 0),
			open: Number(items?.open ?? 0),
			needsApproval: Number(replies?.n ?? 0),
		};
	}

	private async itemRow(orgId: string, itemId: string) {
		const [row] = await this.itemQuery()
			.where(and(eq(engagementItems.id, itemId), eq(engagementItems.organizationId, orgId)))
			.limit(1);
		if (!row) throw notFound("Item");
		return row;
	}

	async getItem(orgId: string, itemId: string) {
		const row = await this.itemRow(orgId, itemId);
		const [thread, replies, latest] = await Promise.all([
			this.threadRows(row.item),
			this.replyRows(orgId, [eq(engagementReplies.itemId, itemId)]),
			this.latestReplies([itemId]),
		]);
		const threadLatest = await this.latestReplies(thread.map((r) => r.item.id));
		return {
			...this.toItemDto(row, latest.get(itemId) ?? null, { full: true }),
			thread: thread.map((r) =>
				this.toItemDto(r, threadLatest.get(r.item.id) ?? null, { full: true }),
			),
			replies: await this.toReplyDtos(replies),
		};
	}

	/**
	 * The conversation around an item on its channel, oldest first: everything under the
	 * same post, plus its parent and direct answers (which covers mentions and
	 * discussions, which have no post). Our own replies are included — that is the point.
	 */
	private async threadRows(item: ItemRow) {
		const related: SQL[] = [
			eq(engagementItems.id, item.id),
			eq(engagementItems.parentExternalId, item.externalId),
		];
		if (item.postExternalId) related.push(eq(engagementItems.postExternalId, item.postExternalId));
		if (item.parentExternalId) related.push(eq(engagementItems.externalId, item.parentExternalId));
		const rows = await this.itemQuery()
			.where(and(eq(engagementItems.channelId, item.channelId), or(...related)))
			.orderBy(desc(engagementItems.postedAt), desc(engagementItems.id))
			.limit(THREAD_LIMIT);
		return rows.reverse();
	}

	async bulkUpdateItems(orgId: string, ids: string[], status: ItemStatus) {
		const rows = await this.db
			.update(engagementItems)
			.set({ status })
			.where(and(eq(engagementItems.organizationId, orgId), inArray(engagementItems.id, ids)))
			.returning({ id: engagementItems.id });
		return { updated: rows.length };
	}

	async updateItem(orgId: string, itemId: string, input: UpdateItemInput) {
		await this.itemRow(orgId, itemId);
		if (input.assignedTo) {
			const [member] = await this.db
				.select({ id: memberships.id })
				.from(memberships)
				.where(and(eq(memberships.organizationId, orgId), eq(memberships.userId, input.assignedTo)))
				.limit(1);
			if (!member)
				throw new AppError(
					422,
					"invalid_assignee",
					"Assign items to a member of this organization",
				);
		}
		await this.db
			.update(engagementItems)
			.set({
				...(input.status ? { status: input.status } : {}),
				...(input.assignedTo !== undefined ? { assignedTo: input.assignedTo } : {}),
			})
			.where(eq(engagementItems.id, itemId));
		const row = await this.itemRow(orgId, itemId);
		const latest = await this.latestReplies([itemId]);
		return this.toItemDto(row, latest.get(itemId) ?? null, { full: true });
	}

	// ── AI draft ────────────────────────────────────────────────────────────────

	/**
	 * A reply draft from the text model, synchronous like the composer's AI. Budgeted
	 * and metered exactly like every other text task (one ai_generations row, kind
	 * `reply_draft`, failed calls included). Nothing is stored as a reply: the user
	 * edits the text and then creates the reply.
	 */
	async draft(orgId: string, userId: string, itemId: string, input: DraftInput) {
		const model = this.ai.text;
		if (!model)
			throw new AppError(
				503,
				"ai_not_configured",
				"AI text generation is not set up on this server",
			);
		const row = await this.itemRow(orgId, itemId);
		if (row.item.fromSelf) throw replyNotPossible("This is the brand's own message");
		await assertBudget(this.db, orgId);

		const [brand, thread] = await Promise.all([
			this.brandContext(orgId),
			this.threadRows(row.item),
		]);
		const maxLength =
			this.engagementOf(row.item.provider)?.maxReplyLength ??
			PLATFORM_GUIDES[row.item.provider as Platform]?.maxChars ??
			1000;
		const request = {
			item: {
				kind: row.item.kind,
				provider: row.item.provider,
				text: row.item.text,
				authorName: row.item.author.name ?? row.item.author.handle,
			},
			thread: thread
				.filter((t) => t.item.id !== itemId && t.item.postedAt <= row.item.postedAt)
				.map((t) => ({
					author: t.item.author.name ?? t.item.author.handle,
					text: t.item.text,
					fromSelf: t.item.fromSelf,
				})),
			post: row.postText && !row.postDeletedAt ? { text: row.postText } : null,
			tone: input.tone,
			instruction: input.instruction,
			maxLength,
		};

		const base = {
			organizationId: orgId,
			userId,
			kind: "reply_draft" as const,
			input: { itemId, tone: input.tone ?? null, instruction: input.instruction ?? null },
		};
		const started = performance.now();
		let result: TextResult<{ text: string }>;
		try {
			result = await draftReply(model, brand, request);
		} catch (error) {
			await this.db.insert(aiGenerations).values({
				...base,
				status: "failed",
				model: model.id,
				errorCode: isAiError(error) ? error.kind : "internal",
				errorMessage: error instanceof Error ? error.message.slice(0, 1000) : String(error),
				durationMs: Math.round(performance.now() - started),
				completedAt: new Date(),
			});
			throw toAppError(error);
		}
		const [gen] = await this.db
			.insert(aiGenerations)
			.values({
				...base,
				status: "succeeded",
				model: result.model,
				output: result.output,
				inputTokens: result.usage.inputTokens,
				outputTokens: result.usage.outputTokens,
				costMicros: result.costMicros,
				durationMs: Math.round(performance.now() - started),
				completedAt: new Date(),
			})
			.returning({ id: aiGenerations.id });
		if (!gen) throw new Error("ai_generations insert returned no row");
		return { text: result.output.text, generationId: gen.id };
	}

	private async brandContext(orgId: string): Promise<BrandContext | null> {
		const [row] = await this.db
			.select()
			.from(brandProfiles)
			.where(eq(brandProfiles.organizationId, orgId))
			.limit(1);
		if (!row) return null;
		return {
			brandName: row.brandName,
			description: row.description,
			audience: row.audience,
			voice: row.voice,
			website: row.website,
			keywords: row.keywords,
			avoid: row.avoid,
			examplePosts: row.examplePosts,
		};
	}

	// ── replies ─────────────────────────────────────────────────────────────────

	private async approvalRequired(orgId: string) {
		const [org] = await this.db
			.select({ required: organizations.replyApprovalRequired })
			.from(organizations)
			.where(eq(organizations.id, orgId))
			.limit(1);
		return org?.required ?? true;
	}

	/**
	 * What "submit" means for this caller: an editor's reply waits for an admin when the
	 * organization requires approval; an admin's or owner's (or anyone's, when approval
	 * is off) is approved and queued at once.
	 */
	private async submitStatus(org: OrgContext): Promise<"pending_approval" | "queued"> {
		if (roleAtLeast(org.role, "admin")) return "queued";
		return (await this.approvalRequired(org.id)) ? "pending_approval" : "queued";
	}

	private async replyRows(orgId: string, where: SQL[]) {
		return this.db
			.select()
			.from(engagementReplies)
			.where(and(eq(engagementReplies.organizationId, orgId), ...where))
			.orderBy(asc(engagementReplies.createdAt), asc(engagementReplies.id));
	}

	private async toReplyDtos(rows: ReplyRow[]) {
		const userIds = [
			...new Set(rows.flatMap((r) => [r.createdBy, r.approvedBy]).filter((x): x is string => !!x)),
		];
		const people = userIds.length
			? await this.db
					.select({ id: users.id, name: users.name, email: users.email })
					.from(users)
					.where(inArray(users.id, userIds))
			: [];
		const byId = new Map(people.map((u) => [u.id, { id: u.id, name: u.name ?? u.email }]));
		return rows.map((r) => ({
			id: r.id,
			itemId: r.itemId,
			text: r.text,
			status: r.status,
			source: r.source as "ai" | "human",
			createdBy: r.createdBy ? (byId.get(r.createdBy) ?? null) : null,
			approvedBy: r.approvedBy ? (byId.get(r.approvedBy) ?? null) : null,
			approvedAt: iso(r.approvedAt),
			rejectionReason: r.rejectionReason,
			externalUrl: r.externalUrl,
			error: r.errorCode ? { code: r.errorCode, message: r.errorMessage ?? "" } : null,
			sentAt: iso(r.sentAt),
			createdAt: r.createdAt.toISOString(),
			updatedAt: r.updatedAt.toISOString(),
		}));
	}

	private async replyDto(row: ReplyRow) {
		const [dto] = await this.toReplyDtos([row]);
		if (!dto) throw new Error("unreachable");
		return dto;
	}

	/** Reply + its item (for the channel checks), scoped to the organization. */
	private async replyWithItem(orgId: string, replyId: string) {
		const [reply] = await this.db
			.select()
			.from(engagementReplies)
			.where(and(eq(engagementReplies.id, replyId), eq(engagementReplies.organizationId, orgId)))
			.limit(1);
		if (!reply) throw notFound("Reply");
		const item = await this.itemRow(orgId, reply.itemId);
		return { reply, item };
	}

	private assertCanReply(row: Awaited<ReturnType<InboxService["itemRow"]>>) {
		const blocked = this.replyBlockedReason(row.item, {
			status: row.channelStatus,
			scopes: row.channelScopes,
		});
		if (blocked) throw replyNotPossible(blocked);
	}

	/**
	 * Hands a queued reply to the worker. The row is committed first, so a failed enqueue
	 * loses nothing: the maintenance sweep re-enqueues replies left `queued` without a
	 * job within minutes (and the job id + claim make a duplicate harmless).
	 */
	private async enqueue(reply: ReplyRow, provider: string) {
		try {
			await this.jobs.enqueueReply(provider, {
				replyId: reply.id,
				organizationId: reply.organizationId,
				version: reply.attempts,
			});
		} catch (error) {
			this.logger.warn(
				{ err: error, replyId: reply.id },
				"reply enqueue failed; the sweep will retry",
			);
		}
	}

	async createReply(org: OrgContext, userId: string, itemId: string, input: CreateReplyInput) {
		const row = await this.itemRow(org.id, itemId);
		if (row.item.fromSelf) throw replyNotPossible("This is the brand's own message");
		this.assertLength(input.text, row.item.provider);
		const status = input.submit ? await this.submitStatus(org) : "draft";
		if (input.submit) this.assertCanReply(row);

		const reply = await this.db.transaction(async (tx) => {
			if (status !== "draft") {
				// Serialise submits per item: two people answering the same comment at once
				// must not both go out.
				await tx
					.select({ id: engagementItems.id })
					.from(engagementItems)
					.where(eq(engagementItems.id, itemId))
					.for("update");
				await this.assertNoReplyInFlight(tx, itemId);
			}
			const now = new Date();
			const [inserted] = await tx
				.insert(engagementReplies)
				.values({
					organizationId: org.id,
					itemId,
					text: input.text,
					source: input.source,
					createdBy: userId,
					status,
					...(status === "queued" ? { approvedBy: userId, approvedAt: now } : {}),
				})
				.returning();
			return inserted as ReplyRow;
		});
		if (reply.status === "queued") await this.enqueue(reply, row.item.provider);
		return this.replyDto(reply);
	}

	private async assertNoReplyInFlight(
		tx: Pick<Database, "select">,
		itemId: string,
		except?: string,
	) {
		const [busy] = await tx
			.select({ id: engagementReplies.id })
			.from(engagementReplies)
			.where(
				and(
					eq(engagementReplies.itemId, itemId),
					inArray(engagementReplies.status, IN_FLIGHT),
					...(except ? [ne(engagementReplies.id, except)] : []),
				),
			)
			.limit(1);
		if (busy)
			throw conflict(
				"Another reply to this item is waiting for approval or being sent",
				"reply_in_progress",
			);
	}

	async updateReply(org: OrgContext, userId: string, replyId: string, input: UpdateReplyInput) {
		const { reply, item } = await this.replyWithItem(org.id, replyId);
		if (!EDITABLE.includes(reply.status))
			throw conflict("This reply can no longer be edited", "reply_not_editable");
		const text = input.text ?? reply.text;
		this.assertLength(text, item.item.provider);

		let status: ReplyStatus = reply.status;
		if (input.submit === true) {
			this.assertCanReply(item);
			status = await this.submitStatus(org);
		} else if (input.submit === false) {
			status = "draft";
		}
		// Otherwise the status is kept: a pending reply edited stays pending (and must be
		// approved as edited), a rejected one stays rejected until it is resubmitted.

		const updated = await this.db.transaction(async (tx) => {
			if (status === "pending_approval" || status === "queued") {
				await tx
					.select({ id: engagementItems.id })
					.from(engagementItems)
					.where(eq(engagementItems.id, reply.itemId))
					.for("update");
				await this.assertNoReplyInFlight(tx, reply.itemId, reply.id);
			}
			const now = new Date();
			const [row] = await tx
				.update(engagementReplies)
				.set({
					text,
					status,
					// "ai" means an unedited AI draft; any edit makes it the user's text.
					...(input.text !== undefined && input.text !== reply.text ? { source: "human" } : {}),
					// Submitted by an admin/owner (or with approval off): approved by the submitter.
					...(status === "queued"
						? { approvedBy: userId, approvedAt: now }
						: { approvedBy: null, approvedAt: null }),
					...(status !== "rejected" ? { rejectionReason: null } : {}),
				})
				.where(and(eq(engagementReplies.id, reply.id), eq(engagementReplies.status, reply.status)))
				.returning();
			return row;
		});
		if (!updated)
			throw conflict("This reply changed meanwhile — reload and try again", "reply_changed");
		if (updated.status === "queued") await this.enqueue(updated, item.item.provider);
		return this.replyDto(updated);
	}

	async approveReply(org: OrgContext, userId: string, replyId: string) {
		const { reply, item } = await this.replyWithItem(org.id, replyId);
		if (reply.status !== "pending_approval")
			throw conflict("Only replies waiting for approval can be approved", "not_pending");
		this.assertCanReply(item);
		this.assertLength(reply.text, item.item.provider);
		const [row] = await this.db
			.update(engagementReplies)
			.set({ status: "queued", approvedBy: userId, approvedAt: new Date(), rejectionReason: null })
			.where(
				and(eq(engagementReplies.id, replyId), eq(engagementReplies.status, "pending_approval")),
			)
			.returning();
		if (!row)
			throw conflict("This reply changed meanwhile — reload and try again", "reply_changed");
		await this.enqueue(row, item.item.provider);
		return this.replyDto(row);
	}

	async rejectReply(orgId: string, replyId: string, reason: string) {
		await this.replyWithItem(orgId, replyId);
		const [row] = await this.db
			.update(engagementReplies)
			.set({ status: "rejected", rejectionReason: reason })
			.where(
				and(eq(engagementReplies.id, replyId), eq(engagementReplies.status, "pending_approval")),
			)
			.returning();
		if (!row) throw conflict("Only replies waiting for approval can be rejected", "not_pending");
		return this.replyDto(row);
	}

	/**
	 * Manual retry. `unconfirmed` needs an explicit "I checked the platform and it is not
	 * there" — the first attempt may have posted it (the same rule as posts' retryTarget).
	 */
	async retryReply(orgId: string, replyId: string, confirmNotSent: boolean) {
		const { reply, item } = await this.replyWithItem(orgId, replyId);
		if (reply.status === "unconfirmed" && !confirmNotSent) {
			throw new AppError(
				409,
				"confirm_required",
				"This reply may already be live. Check the platform, then confirm to send it again.",
			);
		}
		if (reply.status !== "failed" && reply.status !== "unconfirmed")
			throw conflict("Only failed replies can be retried", "not_retryable");
		this.assertCanReply(item);
		this.assertLength(reply.text, item.item.provider);
		await this.assertNoReplyInFlight(this.db, reply.itemId, reply.id);
		const [row] = await this.db
			.update(engagementReplies)
			.set({ status: "queued", errorCode: null, errorMessage: null })
			.where(and(eq(engagementReplies.id, replyId), eq(engagementReplies.status, reply.status)))
			.returning();
		if (!row)
			throw conflict("This reply changed meanwhile — reload and try again", "reply_changed");
		await this.enqueue(row, item.item.provider);
		return this.replyDto(row);
	}

	async deleteReply(orgId: string, replyId: string) {
		await this.replyWithItem(orgId, replyId);
		const rows = await this.db
			.delete(engagementReplies)
			.where(
				and(
					eq(engagementReplies.id, replyId),
					inArray(engagementReplies.status, ["draft", "rejected"]),
				),
			)
			.returning({ id: engagementReplies.id });
		if (rows.length === 0)
			throw conflict("Only drafts and rejected replies can be deleted", "reply_not_deletable");
	}

	async approvals(orgId: string) {
		const replies = await this.replyRows(orgId, [eq(engagementReplies.status, "pending_approval")]);
		const itemIds = [...new Set(replies.map((r) => r.itemId))];
		const itemRows = itemIds.length
			? await this.itemQuery().where(
					and(eq(engagementItems.organizationId, orgId), inArray(engagementItems.id, itemIds)),
				)
			: [];
		const latest = await this.latestReplies(itemIds);
		const items = new Map(
			itemRows.map((r) => [
				r.item.id,
				this.toItemDto(r, latest.get(r.item.id) ?? null, { full: true }),
			]),
		);
		const dtos = await this.toReplyDtos(replies);
		return {
			items: dtos.flatMap((reply) => {
				const item = items.get(reply.itemId);
				return item ? [{ reply, item }] : [];
			}),
		};
	}

	// ── listening ───────────────────────────────────────────────────────────────

	/** Providers that can search AND for which the organization has an active channel. */
	private async availableProviders(orgId: string) {
		const rows = await this.db
			.selectDistinct({ provider: channels.provider })
			.from(channels)
			.where(and(eq(channels.organizationId, orgId), eq(channels.status, "active")));
		return rows
			.map((r) => r.provider)
			.filter((p) => Boolean(this.engagementOf(p)?.searchDiscussions))
			.sort();
	}

	async listQueries(orgId: string) {
		const rows = await this.db
			.select({
				q: listeningQueries,
				// Qualified by hand: drizzle leaves columns unqualified in single-table queries.
				newCount:
					sql<number>`(select count(*) from engagement_items i where i.listening_query_id = listening_queries.id and i.status = 'new')`.mapWith(
						Number,
					),
			})
			.from(listeningQueries)
			.where(eq(listeningQueries.organizationId, orgId))
			.orderBy(asc(listeningQueries.createdAt), asc(listeningQueries.id));
		return {
			items: rows.map((r) => this.toQueryDto(r.q, r.newCount)),
			availableProviders: await this.availableProviders(orgId),
		};
	}

	private toQueryDto(q: typeof listeningQueries.$inferSelect, newCount = 0) {
		return {
			id: q.id,
			query: q.query,
			providers: q.providers,
			active: q.active,
			lastRunAt: iso(q.lastRunAt),
			newCount,
		};
	}

	private async assertProviders(orgId: string, providers: string[]) {
		const available = new Set(await this.availableProviders(orgId));
		const bad = providers.filter((p) => !available.has(p));
		if (bad.length > 0) {
			throw new AppError(
				422,
				"provider_unavailable",
				"Listening needs a connected channel on a platform that supports search",
				{ providers: bad },
			);
		}
	}

	private async assertQueryCapacity(tx: Pick<Database, "execute">, orgId: string, except?: string) {
		const [row] = (await tx.execute(sql`
			select count(*)::int as n from listening_queries q
			where q.organization_id = ${orgId} and q.active ${except ? sql`and q.id <> ${except}` : sql``}
		`)) as unknown as { n: number }[];
		if (Number(row?.n ?? 0) >= MAX_ACTIVE_QUERIES) {
			throw new AppError(
				409,
				"query_limit",
				`At most ${MAX_ACTIVE_QUERIES} listening queries can be active — pause or delete one first`,
				{ limit: MAX_ACTIVE_QUERIES },
			);
		}
	}

	async createQuery(orgId: string, input: CreateQueryInput) {
		const providers = [...new Set(input.providers)];
		await this.assertProviders(orgId, providers);
		const row = await this.db.transaction(async (tx) => {
			await lockOrg(tx, orgId, "listening");
			await this.assertQueryCapacity(tx, orgId);
			const [inserted] = await tx
				.insert(listeningQueries)
				.values({ organizationId: orgId, query: input.query, providers })
				.returning();
			return inserted as typeof listeningQueries.$inferSelect;
		});
		return this.toQueryDto(row);
	}

	async updateQuery(orgId: string, id: string, input: UpdateQueryInput) {
		const providers = input.providers ? [...new Set(input.providers)] : undefined;
		if (providers) await this.assertProviders(orgId, providers);
		const row = await this.db.transaction(async (tx) => {
			const [current] = await tx
				.select()
				.from(listeningQueries)
				.where(and(eq(listeningQueries.id, id), eq(listeningQueries.organizationId, orgId)))
				.limit(1);
			if (!current) throw notFound("Listening query");
			if (input.active && !current.active) {
				await lockOrg(tx, orgId, "listening");
				await this.assertQueryCapacity(tx, orgId, id);
			}
			const [updated] = await tx
				.update(listeningQueries)
				.set({
					...(input.query !== undefined ? { query: input.query } : {}),
					...(providers ? { providers } : {}),
					...(input.active !== undefined ? { active: input.active } : {}),
					// A new search starts fresh rather than from the old query's last run.
					...(input.query !== undefined && input.query !== current.query
						? { lastRunAt: null }
						: {}),
				})
				.where(eq(listeningQueries.id, id))
				.returning();
			return updated as typeof listeningQueries.$inferSelect;
		});
		const [count] = (await this.db.execute(sql`
			select count(*)::int as n from engagement_items i
			where i.listening_query_id = ${id} and i.status = 'new'
		`)) as unknown as { n: number }[];
		return this.toQueryDto(row, Number(count?.n ?? 0));
	}

	async deleteQuery(orgId: string, id: string) {
		const rows = await this.db
			.delete(listeningQueries)
			.where(and(eq(listeningQueries.id, id), eq(listeningQueries.organizationId, orgId)))
			.returning({ id: listeningQueries.id });
		if (rows.length === 0) throw notFound("Listening query");
	}

	// ── settings & sync ─────────────────────────────────────────────────────────

	async settings(orgId: string) {
		const [org, rows] = await Promise.all([
			this.approvalRequired(orgId),
			this.db
				.select({
					id: channels.id,
					name: channels.name,
					provider: channels.provider,
					status: channels.status,
					scopes: channels.scopes,
				})
				.from(channels)
				.where(and(eq(channels.organizationId, orgId), ne(channels.status, "disconnected")))
				.orderBy(asc(channels.createdAt), asc(channels.id)),
		]);
		return {
			replyApprovalRequired: org,
			channels: rows.map((c) => {
				const engagement = this.engagementOf(c.provider);
				const active = c.status === "active";
				const missingRead = engagement
					? missingScopes(c.scopes, engagement.requiredScopes.read)
					: [];
				const missingReply = engagement
					? missingScopes(c.scopes, engagement.requiredScopes.reply)
					: [];
				return {
					id: c.id,
					name: c.name,
					provider: c.provider,
					supportsInbox: engagement !== null,
					canRead: engagement !== null && active && missingRead.length === 0,
					canReply: engagement !== null && active && missingReply.length === 0,
					missingScopes: [...new Set([...missingRead, ...missingReply])],
				};
			}),
		};
	}

	async updateSettings(orgId: string, input: { replyApprovalRequired: boolean }) {
		await this.db
			.update(organizations)
			.set({ replyApprovalRequired: input.replyApprovalRequired })
			.where(eq(organizations.id, orgId));
		return this.settings(orgId);
	}

	/**
	 * Read new comments and mentions now. Rate limited per organization (SET NX with a
	 * TTL — one sync per window whatever the replica count): each sync spends the
	 * platforms' read budget that publishing and analytics share.
	 */
	async sync(orgId: string) {
		const key = `inbox:sync:${orgId}`;
		const acquired = await this.redis.set(key, "1", "EX", SYNC_COOLDOWN_SECONDS, "NX");
		if (acquired !== "OK") {
			const ttl = await this.redis.ttl(key);
			throw new AppError(
				429,
				"rate_limited",
				"The inbox was synced a few minutes ago — try again later",
				{ retryAfterSeconds: ttl > 0 ? ttl : SYNC_COOLDOWN_SECONDS },
			);
		}
		try {
			const rows = await this.db
				.select({ id: channels.id, provider: channels.provider, scopes: channels.scopes })
				.from(channels)
				.where(and(eq(channels.organizationId, orgId), eq(channels.status, "active")));
			const readable = rows.filter((c) => {
				const engagement = this.engagementOf(c.provider);
				return engagement && missingScopes(c.scopes, engagement.requiredScopes.read).length === 0;
			});
			const queued = await this.jobs.syncEngagementNow(readable.map((c) => c.id));
			return { queued };
		} catch (error) {
			// Nothing was queued: do not make the user wait out a cooldown for it.
			await this.redis.del(key);
			throw error;
		}
	}
}
