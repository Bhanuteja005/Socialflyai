import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import type { AiModels } from "@socialfly/ai";
import { FakeTextModel } from "@socialfly/ai/testing";
import { createLogger } from "@socialfly/core/logger";
import { normalizeEmail } from "@socialfly/core/security";
import { and, eq, schema, sql } from "@socialfly/db";
import { type EngagementItem, ProviderError, ProviderRegistry } from "@socialfly/integrations";
import {
	ENGAGEMENT_BUCKET_MS,
	engagementReplyQueueName,
	jobIds,
	QUEUE_PREFIX,
	QUEUES,
} from "@socialfly/queue";
import { Queue } from "bullmq";
import { CallBudgetExhausted } from "#src/analytics/call-budget.ts";
import { ChannelTokens } from "#src/channels/channel-tokens.ts";
import { EngagementProcessor } from "#src/engagement/engagement-processor.ts";
import { ReplySender } from "#src/engagement/reply-sender.ts";
import { ReplyState } from "#src/engagement/reply-state.ts";
import { db, jobs, queueConnection, tokenCipher } from "#src/infrastructure/index.ts";
import { Maintenance } from "#src/maintenance/maintenance.ts";
import { TargetState } from "#src/publishing/target-state.ts";
import { FakeProvider } from "./fake-provider.ts";

const logger = createLogger({ service: "worker-test", level: "fatal" });
const engagementQueue = new Queue(QUEUES.engagement, {
	connection: queueConnection,
	prefix: QUEUE_PREFIX,
});
const replyQueue = new Queue(engagementReplyQueueName("linkedin"), {
	connection: queueConnection,
	prefix: QUEUE_PREFIX,
});

const HOUR = 3600_000;
const DAY = 24 * HOUR;

let fake: FakeProvider;
let text: FakeTextModel;
const ai: AiModels = { text: null, images: null, speech: null };
let processor: EngagementProcessor;
let sender: ReplySender;
let budgetLeft = Number.POSITIVE_INFINITY;

beforeEach(async () => {
	fake = new FakeProvider().withEngagement({ maxPostsPerCall: 2 });
	text = new FakeTextModel();
	ai.text = text;
	budgetLeft = Number.POSITIVE_INFINITY;
	const providers = new ProviderRegistry([fake]);
	const tokens = new ChannelTokens(db, providers, tokenCipher, logger);
	processor = new EngagementProcessor({
		db,
		ai,
		providers,
		tokens,
		budget: {
			take: async () => {
				if (budgetLeft <= 0) return 30_000;
				budgetLeft--;
				return 0;
			},
		},
		jobs,
		logger,
		config: { monthlyBudgetUsd: 0 },
	});
	sender = new ReplySender({ db, providers, tokens, state: new ReplyState(db), jobs, logger });
	await Promise.all([
		engagementQueue.obliterate({ force: true }),
		replyQueue.obliterate({ force: true }),
	]);
});

afterAll(async () => {
	await Promise.all([
		engagementQueue.obliterate({ force: true }),
		replyQueue.obliterate({ force: true }),
	]);
	await Promise.all([engagementQueue.close(), replyQueue.close()]);
});

async function newChannel(
	opts: { scopes?: string[]; refreshable?: boolean; status?: "active" | "needs_reauth" } = {},
) {
	const email = `e-${crypto.randomUUID()}@example.test`;
	const [user] = await db
		.insert(schema.users)
		.values({ email, emailNormalized: normalizeEmail(email) })
		.returning();
	const [org] = await db
		.insert(schema.organizations)
		.values({ name: "Acme", slug: `org-${crypto.randomUUID()}`, createdBy: user?.id })
		.returning();
	const [channel] = await db
		.insert(schema.channels)
		.values({
			organizationId: org?.id as string,
			provider: "linkedin",
			externalId: `me-${crypto.randomUUID()}`,
			name: "Acme on LinkedIn",
			accessTokenEnc: tokenCipher.encrypt("original-token"),
			refreshTokenEnc: opts.refreshable ? tokenCipher.encrypt("original-refresh") : null,
			tokenExpiresAt: opts.refreshable ? new Date(Date.now() + HOUR) : null,
			scopes: opts.scopes ?? ["w_member_social", "r_comments", "w_comments"],
			status: opts.status ?? "active",
		})
		.returning();
	return { orgId: org?.id as string, channelId: channel?.id as string, userId: user?.id as string };
}

async function publishedTarget(ch: { orgId: string; channelId: string }, ageMs = HOUR) {
	const [post] = await db
		.insert(schema.posts)
		.values({ organizationId: ch.orgId, content: "Our new roast", status: "published" })
		.returning();
	const externalId = `post-${crypto.randomUUID()}`;
	const [target] = await db
		.insert(schema.postTargets)
		.values({
			organizationId: ch.orgId,
			postId: post?.id as string,
			channelId: ch.channelId,
			status: "published",
			externalId,
			publishedAt: new Date(Date.now() - ageMs),
		})
		.returning();
	return { targetId: target?.id as string, externalId };
}

const comment = (
	postExternalId: string | null,
	over: Partial<EngagementItem> = {},
): EngagementItem => ({
	externalId: `c-${crypto.randomUUID()}`,
	kind: "comment",
	postExternalId,
	parentExternalId: null,
	author: { externalId: "u1", name: "Sam", handle: "sam", avatarUrl: null, profileUrl: null },
	fromSelf: false,
	text: "Do you ship to Ireland?",
	url: "https://platform.test/c",
	createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
	...over,
});

const itemsOf = (channelId: string) =>
	db
		.select()
		.from(schema.engagementItems)
		.where(eq(schema.engagementItems.channelId, channelId))
		.orderBy(schema.engagementItems.postedAt);

const bucket = () => Math.floor(Date.now() / ENGAGEMENT_BUCKET_MS);

describe("plan", () => {
	test("syncs only channels holding the read scopes; queues due listening and triage", async () => {
		const ok = await newChannel();
		const noScopes = await newChannel({ scopes: ["w_member_social"] });
		const reauth = await newChannel({ status: "needs_reauth" });
		const [due] = await db
			.insert(schema.listeningQueries)
			.values({ organizationId: ok.orgId, query: "coffee beans", providers: ["linkedin"] })
			.returning();
		const [recent] = await db
			.insert(schema.listeningQueries)
			.values({
				organizationId: ok.orgId,
				query: "espresso",
				providers: ["linkedin"],
				lastRunAt: new Date(Date.now() - 10 * 60_000),
			})
			.returning();
		await db.insert(schema.engagementItems).values({
			organizationId: noScopes.orgId,
			channelId: noScopes.channelId,
			provider: "linkedin",
			kind: "comment",
			externalId: "x1",
			author: { externalId: null, name: null, handle: null, avatarUrl: null, profileUrl: null },
			text: "untriaged",
			postedAt: new Date(),
		});

		const result = await processor.plan();
		expect(result.skippedScopes).toBeGreaterThanOrEqual(1);
		const b = bucket();
		expect(await engagementQueue.getJob(jobIds.engagementSync(ok.channelId, b))).toBeDefined();
		expect(
			await engagementQueue.getJob(jobIds.engagementSync(noScopes.channelId, b)),
		).toBeUndefined();
		expect(
			await engagementQueue.getJob(jobIds.engagementSync(reauth.channelId, b)),
		).toBeUndefined();
		expect(
			await engagementQueue.getJob(jobIds.engagementListen(due?.id as string, b)),
		).toBeDefined();
		expect(
			await engagementQueue.getJob(jobIds.engagementListen(recent?.id as string, b)),
		).toBeUndefined();
		expect(await engagementQueue.getJob(jobIds.engagementTriage(noScopes.orgId, b))).toBeDefined();

		// A replan in the same bucket collapses onto the same jobs.
		const before = await engagementQueue.getJobCounts();
		await processor.plan();
		expect(await engagementQueue.getJobCounts()).toEqual(before);

		// Without a text model nothing is triaged.
		ai.text = null;
		await engagementQueue.obliterate({ force: true });
		expect((await processor.plan()).triage).toBe(0);
	});
});

describe("sync-channel", () => {
	test("stores new items once, links targets, keeps fromSelf read, advances the cursor", async () => {
		const ch = await newChannel();
		const t1 = await publishedTarget(ch);
		const t2 = await publishedTarget(ch, 2 * HOUR);
		const t3 = await publishedTarget(ch, 3 * HOUR);
		await publishedTarget(ch, 20 * DAY); // outside the comment window
		const question = comment(t1.externalId);
		const ours = comment(t1.externalId, {
			kind: "reply",
			parentExternalId: question.externalId,
			fromSelf: true,
			text: "Yes we do!",
		});
		fake.platformComments.push(question, ours, comment(t3.externalId, { text: "Love it" }));
		fake.platformMentions.push(comment(null, { kind: "mention", text: "@acme is great" }));

		const first = await processor.syncChannel(ch.channelId);
		expect(first).toEqual({ inserted: 4, posts: 3 });
		// Batched by maxPostsPerCall, newest first; the first sync looks back 14 days.
		expect(fake.commentCalls.map((c) => c.ids)).toEqual([
			[t1.externalId, t2.externalId],
			[t3.externalId],
		]);
		expect(Date.parse(fake.commentCalls[0]?.since as string)).toBeLessThan(Date.now() - 13 * DAY);

		const rows = await itemsOf(ch.channelId);
		const q = rows.find((r) => r.externalId === question.externalId);
		expect(q).toMatchObject({ status: "new", postTargetId: t1.targetId, kind: "comment" });
		expect(rows.find((r) => r.externalId === ours.externalId)).toMatchObject({
			status: "read",
			fromSelf: true,
			parentExternalId: question.externalId,
		});
		expect(rows.find((r) => r.kind === "mention")?.postTargetId).toBeNull();

		const [cursor] = await db
			.select()
			.from(schema.engagementCursors)
			.where(eq(schema.engagementCursors.channelId, ch.channelId));
		expect(cursor?.commentsSince).not.toBeNull();
		expect(cursor?.mentionsSince).not.toBeNull();
		// New items trigger triage right away.
		expect(await engagementQueue.getJob(jobIds.engagementTriage(ch.orgId, bucket()))).toBeDefined();

		// The user archives the question; the platform returns it again with edited text.
		await db
			.update(schema.engagementItems)
			.set({ status: "archived", relevance: 80 })
			.where(eq(schema.engagementItems.id, q?.id as string));
		question.text = "edited on the platform";
		question.createdAt = new Date().toISOString();
		fake.commentCalls = [];
		expect(await processor.syncChannel(ch.channelId)).toMatchObject({ inserted: 0 });
		// The next run asks from the cursor minus the 10-minute overlap.
		const since = Date.parse(fake.commentCalls[0]?.since as string);
		expect(since).toBe((cursor?.commentsSince?.getTime() ?? 0) - 10 * 60_000);
		const [again] = await db
			.select()
			.from(schema.engagementItems)
			.where(eq(schema.engagementItems.id, q?.id as string));
		expect(again).toMatchObject({ status: "archived", relevance: 80, text: q?.text });
	});

	test("auth refused after a refresh: gives up without flagging the channel", async () => {
		const ch = await newChannel({ refreshable: true });
		await publishedTarget(ch);
		fake.engagementErrors.push(
			new ProviderError("auth", "linkedin", "401"),
			new ProviderError("auth", "linkedin", "403 scope"),
		);
		const result = await processor.syncChannel(ch.channelId);
		expect(result).toMatchObject({ skipped: "auth" });
		expect(fake.refreshCalls).toBe(1);
		const [channel] = await db
			.select()
			.from(schema.channels)
			.where(eq(schema.channels.id, ch.channelId));
		expect(channel?.status).toBe("active");
		const [cursor] = await db
			.select()
			.from(schema.engagementCursors)
			.where(eq(schema.engagementCursors.channelId, ch.channelId));
		expect(cursor).toMatchObject({ lastError: "auth", commentsSince: null });
	});

	test("rate limits propagate for a BullMQ retry; a spent budget delays the job", async () => {
		const ch = await newChannel();
		await publishedTarget(ch);
		fake.engagementErrors.push(new ProviderError("rate_limited", "linkedin", "429"));
		expect(await processor.syncChannel(ch.channelId).catch((e) => e)).toBeInstanceOf(ProviderError);

		budgetLeft = 0;
		const error = await processor.syncChannel(ch.channelId).catch((e) => e);
		expect(error).toBeInstanceOf(CallBudgetExhausted);
	});

	test("channels without the read scopes are skipped", async () => {
		const ch = await newChannel({ scopes: ["w_member_social"] });
		expect(await processor.syncChannel(ch.channelId)).toEqual({ skipped: "missing_scopes" });
		expect(fake.commentCalls).toHaveLength(0);
	});
});

describe("listen", () => {
	test("stores discussions per channel (deduped, capped at 25 new) and sets lastRunAt", async () => {
		const ch = await newChannel();
		const [query] = await db
			.insert(schema.listeningQueries)
			.values({
				organizationId: ch.orgId,
				query: "best coffee grinder",
				providers: ["x", "linkedin"],
			})
			.returning();
		for (let i = 0; i < 30; i++) {
			fake.platformDiscussions.push({
				externalId: `d-${i}`,
				author: {
					externalId: null,
					name: `P${i}`,
					handle: null,
					avatarUrl: null,
					profileUrl: null,
				},
				title: `Grinder question ${i}`,
				text: "Which grinder should I buy?",
				url: `https://platform.test/d/${i}`,
				community: "r/coffee",
				createdAt: new Date(Date.now() - i * 60_000).toISOString(),
				score: 10,
				commentCount: 3,
			});
		}
		// x has no search here; the fake returns at most `limit` (25) results per search.
		const first = await processor.listen(query?.id as string);
		expect(first).toEqual({ inserted: 25, byProvider: { linkedin: 25, x: "unsupported" } });
		expect(fake.searchCalls[0]).toMatchObject({ query: "best coffee grinder", limit: 25 });
		const rows = await itemsOf(ch.channelId);
		expect(rows).toHaveLength(25);
		expect(rows[0]).toMatchObject({
			kind: "discussion",
			listeningQueryId: query?.id,
			community: "r/coffee",
			status: "new",
		});

		const again = await processor.listen(query?.id as string);
		expect(again.inserted).toBe(0);
		const [row] = await db
			.select()
			.from(schema.listeningQueries)
			.where(eq(schema.listeningQueries.id, query?.id as string));
		expect(row?.lastRunAt).not.toBeNull();
	});
});

describe("triage", () => {
	async function untriaged(ch: { orgId: string; channelId: string }, n: number) {
		const rows = Array.from({ length: n }, (_, i) => ({
			organizationId: ch.orgId,
			channelId: ch.channelId,
			provider: "linkedin",
			kind: "comment" as const,
			externalId: `t-${crypto.randomUUID()}`,
			author: { externalId: null, name: `A${i}`, handle: null, avatarUrl: null, profileUrl: null },
			text: `comment ${i}`,
			postedAt: new Date(),
		}));
		await db.insert(schema.engagementItems).values(rows);
		// Our own reply: never triaged.
		await db.insert(schema.engagementItems).values({
			...(rows[0] as (typeof rows)[number]),
			externalId: `self-${crypto.randomUUID()}`,
			fromSelf: true,
		});
	}

	test("scores in batches of 25, writes a ledger row per call", async () => {
		const ch = await newChannel();
		await untriaged(ch, 30);
		text.reply({
			items: Array.from({ length: 25 }, (_, i) => ({
				key: `${i + 1}`,
				relevance: i === 0 ? 90 : 10,
				reason: "why",
				sentiment: i === 0 ? "question" : "positive",
			})),
		});
		// Second batch: the model skips all but one item.
		text.reply({ items: [{ key: "1", relevance: 55, reason: "ok", sentiment: "neutral" }] });

		expect(await processor.triage(ch.orgId)).toEqual({ triaged: 30 });
		expect(text.requests).toHaveLength(2);

		const rows = await itemsOf(ch.channelId);
		const own = rows.find((r) => r.fromSelf);
		expect(own?.triagedAt).toBeNull();
		const scored = rows.filter((r) => !r.fromSelf);
		expect(scored.every((r) => r.triagedAt !== null)).toBe(true);
		expect(scored.filter((r) => r.relevance !== null)).toHaveLength(26);
		expect(scored.find((r) => r.relevance === 90)).toMatchObject({
			sentiment: "question",
			relevanceReason: "why",
		});

		const ledger = await db
			.select()
			.from(schema.aiGenerations)
			.where(eq(schema.aiGenerations.organizationId, ch.orgId));
		expect(ledger).toHaveLength(2);
		expect(ledger.every((g) => g.kind === "triage" && g.status === "succeeded")).toBe(true);
		expect(ledger[0]?.costMicros).toBe(17_500);

		// Nothing left: no call.
		expect(await processor.triage(ch.orgId)).toEqual({ triaged: 0 });
		expect(text.requests).toHaveLength(2);
	});

	test("skips when the AI budget is spent or no text model is configured", async () => {
		const ch = await newChannel();
		await untriaged(ch, 3);
		await db
			.update(schema.organizations)
			.set({ aiMonthlyBudgetUsd: 1 })
			.where(eq(schema.organizations.id, ch.orgId));
		await db.insert(schema.aiGenerations).values({
			organizationId: ch.orgId,
			kind: "post",
			status: "succeeded",
			costMicros: 2_000_000,
		});
		expect(await processor.triage(ch.orgId)).toEqual({ triaged: 0, skipped: "budget_exceeded" });
		expect(text.requests).toHaveLength(0);

		ai.text = null;
		expect(await processor.triage(ch.orgId)).toEqual({ skipped: "no_text_model" });
	});
});

describe("reply sender", () => {
	/** An item on a published post, with a reply in `queued` at version 0. */
	async function queuedReply(
		opts: {
			text?: string;
			scopes?: string[];
			refreshable?: boolean;
			status?: "queued" | "draft";
		} = {},
	) {
		const ch = await newChannel({ scopes: opts.scopes, refreshable: opts.refreshable });
		const t = await publishedTarget(ch);
		const [item] = await db
			.insert(schema.engagementItems)
			.values({
				organizationId: ch.orgId,
				channelId: ch.channelId,
				provider: "linkedin",
				kind: "comment",
				externalId: `c-${crypto.randomUUID()}`,
				postExternalId: t.externalId,
				postTargetId: t.targetId,
				author: { externalId: "u", name: "Sam", handle: null, avatarUrl: null, profileUrl: null },
				text: "Do you ship to Ireland?",
				postedAt: new Date(),
			})
			.returning();
		const [reply] = await db
			.insert(schema.engagementReplies)
			.values({
				organizationId: ch.orgId,
				itemId: item?.id as string,
				text: opts.text ?? "Yes — we ship to Ireland.",
				status: opts.status ?? "queued",
				createdBy: ch.userId,
			})
			.returning();
		return {
			...ch,
			itemId: item?.id as string,
			itemExternalId: item?.externalId as string,
			replyId: reply?.id as string,
			job: { replyId: reply?.id as string, organizationId: ch.orgId, version: 0 },
		};
	}

	const loadReply = async (id: string) => {
		const [row] = await db
			.select()
			.from(schema.engagementReplies)
			.where(eq(schema.engagementReplies.id, id));
		return row;
	};

	test("sends once: reply sent, item replied, our reply joins the thread", async () => {
		const r = await queuedReply();
		fake.replySteps.push({ externalId: "our-reply-1", url: "https://platform.test/r/1" });
		await sender.send(r.job);

		expect(fake.replyCalls).toEqual([
			{
				token: "original-token",
				toExternalId: r.itemExternalId,
				kind: "comment",
				text: "Yes — we ship to Ireland.",
			},
		]);
		expect(await loadReply(r.replyId)).toMatchObject({
			status: "sent",
			attempts: 1,
			externalId: "our-reply-1",
			externalUrl: "https://platform.test/r/1",
		});
		const items = await itemsOf(r.channelId);
		expect(items.find((i) => i.id === r.itemId)?.status).toBe("replied");
		expect(items.find((i) => i.externalId === "our-reply-1")).toMatchObject({
			fromSelf: true,
			kind: "reply",
			parentExternalId: r.itemExternalId,
			status: "read",
		});

		// A duplicate job (same version) finds nothing to claim and never calls the platform.
		await sender.send(r.job);
		expect(fake.replyCalls).toHaveLength(1);
	});

	test("unknown outcome → unconfirmed, never re-enqueued", async () => {
		const r = await queuedReply();
		fake.replySteps.push(new ProviderError("unknown_outcome", "linkedin", "socket hang up"));
		await sender.send(r.job);
		const reply = await loadReply(r.replyId);
		expect(reply).toMatchObject({ status: "unconfirmed", errorCode: "outcome_unknown" });
		expect(reply?.errorMessage).toContain("Check the platform");
		expect(await replyQueue.getJobCounts("waiting", "delayed")).toEqual({ waiting: 0, delayed: 0 });
		expect(fake.replyCalls).toHaveLength(1);
	});

	test("invalid request → failed with the platform's reason", async () => {
		const r = await queuedReply();
		fake.replySteps.push(
			new ProviderError("invalid_request", "linkedin", "Comment is closed", {
				platformCode: "COMMENTS_DISABLED",
			}),
		);
		await sender.send(r.job);
		expect(await loadReply(r.replyId)).toMatchObject({
			status: "failed",
			errorCode: "COMMENTS_DISABLED",
			errorMessage: "Comment is closed",
		});
	});

	test("auth: refresh once and resend; rate limited: back to queued with a new job version", async () => {
		const r = await queuedReply({ refreshable: true });
		fake.replySteps.push(new ProviderError("auth", "linkedin", "401"), {
			externalId: "ok",
			url: null,
		});
		await sender.send(r.job);
		expect(fake.refreshCalls).toBe(1);
		expect(fake.replyCalls.map((c) => c.token)).toEqual(["original-token", "refreshed-1"]);
		expect((await loadReply(r.replyId))?.status).toBe("sent");

		const limited = await queuedReply();
		fake.replySteps.push(
			new ProviderError("rate_limited", "linkedin", "429", { retryAfterMs: 120_000 }),
		);
		await sender.send(limited.job);
		expect(await loadReply(limited.replyId)).toMatchObject({ status: "queued", attempts: 1 });
		const next = await replyQueue.getJob(jobIds.engagementReply(limited.replyId, 1));
		expect(next?.data).toEqual({ ...limited.job, version: 1 });
		expect(next?.opts.attempts).toBe(1);
		expect((next?.opts.delay ?? 0) >= 120_000).toBe(true);
		// The old job is stale now.
		await sender.send(limited.job);
		expect(fake.replyCalls).toHaveLength(3);
	});

	test("re-validates before sending: stale status, missing scopes, too long", async () => {
		const draft = await queuedReply({ status: "draft" });
		await sender.send(draft.job);
		expect((await loadReply(draft.replyId))?.status).toBe("draft");

		const noScope = await queuedReply({ scopes: ["r_comments"] });
		await sender.send(noScope.job);
		expect(await loadReply(noScope.replyId)).toMatchObject({
			status: "failed",
			errorCode: "missing_scopes",
		});

		const long = await queuedReply({ text: "x".repeat(101) });
		await sender.send(long.job);
		expect(await loadReply(long.replyId)).toMatchObject({
			status: "failed",
			errorCode: "text_too_long",
		});
		expect(fake.replyCalls).toHaveLength(0);
	});

	test("maintenance: stuck sending → unconfirmed; orphaned queued → re-enqueued", async () => {
		const stuck = await queuedReply();
		await db.execute(
			sql`update engagement_replies set status = 'sending', attempts = 1, updated_at = now() - interval '11 minutes' where id = ${stuck.replyId}`,
		);
		const fresh = await queuedReply();
		await db.execute(
			sql`update engagement_replies set status = 'sending', attempts = 1 where id = ${fresh.replyId}`,
		);
		const orphan = await queuedReply();
		await db.execute(
			sql`update engagement_replies set updated_at = now() - interval '5 minutes' where id = ${orphan.replyId}`,
		);

		const maintenance = new Maintenance(db, jobs, new TargetState(db), logger);
		await maintenance.run({ task: "recover-stuck-targets" });
		expect(await loadReply(stuck.replyId)).toMatchObject({
			status: "unconfirmed",
			errorCode: "outcome_unknown",
		});
		expect((await loadReply(fresh.replyId))?.status).toBe("sending");

		await maintenance.run({ task: "sweep-due-targets" });
		expect(await replyQueue.getJob(jobIds.engagementReply(orphan.replyId, 0))).toBeDefined();
		const [row] = await db
			.select({ n: sql<number>`count(*)`.mapWith(Number) })
			.from(schema.engagementReplies)
			.where(
				and(
					eq(schema.engagementReplies.id, stuck.replyId),
					eq(schema.engagementReplies.status, "unconfirmed"),
				),
			);
		expect(row?.n).toBe(1);
	});
});
