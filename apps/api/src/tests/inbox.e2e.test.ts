import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { FakeTextModel } from "@socialfly/ai/testing";
import { eq, schema } from "@socialfly/db";
import {
	type EngagementSupport,
	ProviderRegistry,
	type SocialProvider,
} from "@socialfly/integrations";
import {
	createQueueConnection,
	engagementReplyQueueName,
	jobIds,
	QUEUE_PREFIX,
	QUEUES,
} from "@socialfly/queue";
import { Queue } from "bullmq";
import { ai, db, inboxTools } from "#src/infrastructure/index.ts";
import { type ApiClient, createChannel, createUser } from "./helpers";

const queueRedis = createQueueConnection(process.env.REDIS_URL as string);
const replyQueue = new Queue(engagementReplyQueueName("linkedin"), {
	connection: queueRedis,
	prefix: QUEUE_PREFIX,
});
const engagementQueue = new Queue(QUEUES.engagement, {
	connection: queueRedis,
	prefix: QUEUE_PREFIX,
});

/**
 * Deterministic inbox support: the real adapters are exercised in packages/integrations.
 * linkedin can read, reply and search; x can read and reply but not search.
 */
function fakeProvider(id: string, engagement: Partial<EngagementSupport> | null): SocialProvider {
	return {
		id,
		displayName: `Fake ${id}`,
		isConfigured: () => true,
		...(engagement
			? {
					engagement: {
						requiredScopes: { read: ["r_comments"], reply: ["w_comments"] },
						maxPostsPerCall: 10,
						maxReplyLength: 50,
						listComments: async () => [],
						reply: async () => ({ externalId: "x", url: null }),
						...engagement,
					},
				}
			: {}),
	} as unknown as SocialProvider;
}

const realProviders = inboxTools.providers;
beforeAll(() => {
	inboxTools.providers = new ProviderRegistry([
		fakeProvider("linkedin", { searchDiscussions: async () => [] }),
		fakeProvider("x", {}),
		fakeProvider("youtube", null),
	]);
});

let text: FakeTextModel;
beforeEach(() => {
	text = new FakeTextModel();
	ai.text = text;
});

afterAll(async () => {
	inboxTools.providers = realProviders;
	await Promise.all([
		replyQueue.obliterate({ force: true }).catch(() => {}),
		engagementQueue.obliterate({ force: true }).catch(() => {}),
	]);
	await Promise.all([replyQueue.close(), engagementQueue.close()]);
	await queueRedis.quit();
});

const INBOX_SCOPES = ["w_member_social", "r_comments", "w_comments"];

async function member(owner: ApiClient, orgId: string, role: "viewer" | "editor" | "admin") {
	const { user, client } = await createUser(`${role} user`);
	const invite = await owner.request("POST", "/organization/invitations", {
		email: user.email,
		role,
	});
	expect(invite.status).toBe(201);
	await client.request("POST", "/organizations/invitations/accept", { token: invite.json.token });
	client.orgId = orgId;
	return { user, client };
}

async function newOrg() {
	const { user, client } = await createUser("Owner");
	const res = await client.request("POST", "/organizations", { name: "Inbox Co" });
	expect(res.status).toBe(201);
	const orgId = res.json.id as string;
	client.orgId = orgId;
	const channel = await createChannel(orgId, "linkedin", "Acme on LinkedIn");
	await db
		.update(schema.channels)
		.set({ scopes: INBOX_SCOPES })
		.where(eq(schema.channels.id, channel.id));
	return { owner: client, ownerUser: user, orgId, channelId: channel.id };
}

const author = (name: string) => ({
	externalId: `a-${name}`,
	name,
	handle: name.toLowerCase(),
	avatarUrl: null,
	profileUrl: null,
});

async function item(
	orgId: string,
	channelId: string,
	over: Partial<typeof schema.engagementItems.$inferInsert> = {},
) {
	const [row] = await db
		.insert(schema.engagementItems)
		.values({
			organizationId: orgId,
			channelId,
			provider: "linkedin",
			kind: "comment",
			externalId: `ext-${crypto.randomUUID()}`,
			author: author("Sam"),
			text: "Do you ship to Ireland?",
			postedAt: new Date(),
			...over,
		})
		.returning();
	if (!row) throw new Error("no item");
	return row;
}

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);

describe("list", () => {
	test("filters, sorts, pages with a cursor and reports counts", async () => {
		const { owner, orgId, channelId } = await newOrg();
		const viewer = await member(owner, orgId, "viewer");
		const other = await newOrg();

		const a = await item(orgId, channelId, {
			postedAt: at(1),
			relevance: 40,
			sentiment: "positive",
			text: "x".repeat(2500),
		});
		const b = await item(orgId, channelId, {
			postedAt: at(2),
			relevance: 90,
			sentiment: "question",
			status: "read",
			author: author("Mary"),
		});
		const c = await item(orgId, channelId, { postedAt: at(3), kind: "mention" }); // unscored
		const d = await item(orgId, channelId, { postedAt: at(4), relevance: 70, status: "archived" });
		await item(orgId, channelId, { postedAt: at(5), fromSelf: true, status: "read" });
		await item(other.orgId, other.channelId, { postedAt: at(1) });

		const res = await viewer.client.request("GET", "/inbox/items");
		expect(res.status).toBe(200);
		expect(res.json.items.map((i: { id: string }) => i.id)).toEqual([a.id, b.id, c.id]);
		expect(res.json.counts).toEqual({ new: 2, open: 3, needsApproval: 0 });
		expect(res.json.nextCursor).toBeNull();
		const first = res.json.items[0];
		expect(first.text).toHaveLength(2000);
		expect(first).toMatchObject({
			kind: "comment",
			provider: "linkedin",
			channel: { id: channelId, name: "Acme on LinkedIn", provider: "linkedin" },
			author: { name: "Sam" },
			status: "new",
			relevance: 40,
			sentiment: "positive",
			fromSelf: false,
			post: null,
			latestReply: null,
			canReply: true,
			replyBlockedReason: null,
		});

		const ids = async (query: string) =>
			(await owner.request("GET", `/inbox/items?${query}`)).json.items.map(
				(i: { id: string }) => i.id,
			);
		expect(await ids("status=archived")).toEqual([d.id]);
		expect(await ids("status=new")).toEqual([a.id, c.id]);
		expect(await ids("kinds=mention")).toEqual([c.id]);
		expect(await ids("minRelevance=50")).toEqual([b.id]);
		expect(await ids("sentiment=question")).toEqual([b.id]);
		expect(await ids("q=mar")).toEqual([b.id]);
		expect(await ids(`channelIds=${other.channelId}`)).toEqual([]);
		// Unscored items sort last by relevance.
		expect(await ids("sort=relevance")).toEqual([b.id, a.id, c.id]);

		// Keyset pages, both sorts.
		for (const sort of ["newest", "relevance"]) {
			const seen: string[] = [];
			let cursor: string | null = null;
			do {
				const page: { json: { items: { id: string }[]; nextCursor: string | null } } =
					await owner.request(
						"GET",
						`/inbox/items?sort=${sort}&limit=2${cursor ? `&before=${cursor}` : ""}`,
					);
				seen.push(...page.json.items.map((i) => i.id));
				cursor = page.json.nextCursor;
			} while (cursor);
			expect(seen).toEqual(sort === "newest" ? [a.id, b.id, c.id] : [b.id, a.id, c.id]);
		}
		expect((await owner.request("GET", "/inbox/items?before=garbage")).status).toBe(400);
	});

	test("canReply explains what blocks a reply", async () => {
		const { owner, orgId, channelId } = await newOrg();
		const noScopes = await createChannel(orgId, "linkedin", "Old connection");
		const youtube = await createChannel(orgId, "youtube", "Videos");
		await item(orgId, noScopes.id, { postedAt: at(1) });
		await item(orgId, youtube.id, { postedAt: at(2), provider: "youtube" });
		await item(orgId, channelId, { postedAt: at(3) });
		const res = await owner.request("GET", "/inbox/items");
		expect(
			res.json.items.map((i: { canReply: boolean; replyBlockedReason: string | null }) => [
				i.canReply,
				i.replyBlockedReason,
			]),
		).toEqual([
			[false, "Reconnect this channel to allow SocialFly to reply"],
			[false, "Replying on Fake youtube is not supported"],
			[true, null],
		]);
	});
});

describe("detail", () => {
	test("full text, our post, the thread oldest first (with our replies) and replies", async () => {
		const { owner, orgId, channelId } = await newOrg();
		const [post] = await db
			.insert(schema.posts)
			.values({ organizationId: orgId, content: "Our Kenyan AA is back", status: "published" })
			.returning();
		const [target] = await db
			.insert(schema.postTargets)
			.values({
				organizationId: orgId,
				postId: post?.id as string,
				channelId,
				status: "published",
				externalId: "post-1",
			})
			.returning();
		const onPost = { postExternalId: "post-1", postTargetId: target?.id as string };
		const parent = await item(orgId, channelId, { ...onPost, postedAt: at(10), externalId: "c1" });
		const ours = await item(orgId, channelId, {
			...onPost,
			postedAt: at(8),
			kind: "reply",
			parentExternalId: "c1",
			fromSelf: true,
			status: "read",
		});
		const follow = await item(orgId, channelId, {
			...onPost,
			postedAt: at(5),
			kind: "reply",
			parentExternalId: "c1",
			text: "y".repeat(2500),
		});
		await item(orgId, channelId, { postedAt: at(4), postExternalId: "post-2" });

		const res = await owner.request("GET", `/inbox/items/${follow.id}`);
		expect(res.status).toBe(200);
		expect(res.json.text).toHaveLength(2500);
		expect(res.json.post).toEqual({ postId: post?.id, excerpt: "Our Kenyan AA is back" });
		expect(res.json.thread.map((t: { id: string }) => t.id)).toEqual([
			parent.id,
			ours.id,
			follow.id,
		]);
		expect(res.json.thread[1]).toMatchObject({ fromSelf: true, canReply: false });
		expect(res.json.replies).toEqual([]);

		// A mention (no post): parent chain and direct answers.
		const mention = await item(orgId, channelId, {
			kind: "mention",
			externalId: "m1",
			postedAt: at(3),
		});
		const answer = await item(orgId, channelId, {
			kind: "reply",
			parentExternalId: "m1",
			fromSelf: true,
			postedAt: at(2),
		});
		const thread = (await owner.request("GET", `/inbox/items/${mention.id}`)).json.thread;
		expect(thread.map((t: { id: string }) => t.id)).toEqual([mention.id, answer.id]);
	});
});

describe("item updates", () => {
	test("bulk status, single status/assignee, roles", async () => {
		const { owner, orgId, channelId, ownerUser } = await newOrg();
		const viewer = await member(owner, orgId, "viewer");
		const other = await newOrg();
		const a = await item(orgId, channelId);
		const b = await item(orgId, channelId);
		const foreign = await item(other.orgId, other.channelId);

		const bulk = await owner.request("PATCH", "/inbox/items", {
			ids: [a.id, b.id, foreign.id],
			status: "archived",
		});
		expect(bulk).toMatchObject({ status: 200, json: { updated: 2 } });
		expect(
			(await viewer.client.request("PATCH", "/inbox/items", { ids: [a.id], status: "read" }))
				.status,
		).toBe(403);

		const one = await owner.request("PATCH", `/inbox/items/${a.id}`, {
			status: "spam",
			assignedTo: ownerUser.id,
		});
		expect(one.status).toBe(200);
		expect(one.json.status).toBe("spam");
		const [row] = await db
			.select()
			.from(schema.engagementItems)
			.where(eq(schema.engagementItems.id, a.id));
		expect(row?.assignedTo).toBe(ownerUser.id);

		const stranger = await createUser("Stranger");
		const bad = await owner.request("PATCH", `/inbox/items/${a.id}`, {
			assignedTo: stranger.user.id,
		});
		expect(bad).toMatchObject({ status: 422, json: { error: { code: "invalid_assignee" } } });
		expect(
			(await owner.request("PATCH", `/inbox/items/${foreign.id}`, { status: "read" })).status,
		).toBe(404);
	});
});

describe("AI draft", () => {
	test("drafts with thread context, bills reply_draft, needs a model and budget", async () => {
		const { owner, orgId, channelId } = await newOrg();
		const editor = await member(owner, orgId, "editor");
		const viewer = await member(owner, orgId, "viewer");
		const it = await item(orgId, channelId, { text: "Where can I buy your beans?" });

		text.reply({ text: "Order on our website — happy brewing!" });
		const res = await editor.client.request("POST", `/inbox/items/${it.id}/draft`, {
			tone: "friendly",
		});
		expect(res.status).toBe(200);
		expect(res.json.text).toBe("Order on our website — happy brewing!");
		expect(text.requests[0]?.prompt).toContain("Where can I buy your beans?");
		expect(text.requests[0]?.prompt).toContain("hard limit is 50");
		const [gen] = await db
			.select()
			.from(schema.aiGenerations)
			.where(eq(schema.aiGenerations.id, res.json.generationId));
		expect(gen).toMatchObject({ kind: "reply_draft", status: "succeeded", costMicros: 17_500 });

		expect((await viewer.client.request("POST", `/inbox/items/${it.id}/draft`, {})).status).toBe(
			403,
		);

		ai.text = null;
		const off = await owner.request("POST", `/inbox/items/${it.id}/draft`, {});
		expect(off).toMatchObject({ status: 503, json: { error: { code: "ai_not_configured" } } });

		ai.text = text;
		await db
			.update(schema.organizations)
			.set({ aiMonthlyBudgetUsd: 0.01 })
			.where(eq(schema.organizations.id, orgId));
		const over = await owner.request("POST", `/inbox/items/${it.id}/draft`, {});
		expect(over).toMatchObject({ status: 429, json: { error: { code: "ai_budget_exceeded" } } });
	});
});

describe("replies", () => {
	test("editor with approval required → pending; admin approves → queued with a job", async () => {
		const { owner, orgId, channelId } = await newOrg();
		const editor = await member(owner, orgId, "editor");
		const admin = await member(owner, orgId, "admin");
		const it = await item(orgId, channelId);

		const created = await editor.client.request("POST", `/inbox/items/${it.id}/replies`, {
			text: "Yes, we do!",
			source: "ai",
			submit: true,
		});
		expect(created.status).toBe(201);
		expect(created.json).toMatchObject({
			itemId: it.id,
			text: "Yes, we do!",
			status: "pending_approval",
			source: "ai",
			createdBy: { id: editor.user.id, name: "editor user" },
			approvedBy: null,
			approvedAt: null,
			error: null,
			sentAt: null,
		});
		const replyId = created.json.id as string;

		// One reply in flight per item.
		const second = await owner.request("POST", `/inbox/items/${it.id}/replies`, {
			text: "Also yes",
			submit: true,
		});
		expect(second).toMatchObject({ status: 409, json: { error: { code: "reply_in_progress" } } });

		const list = await owner.request("GET", "/inbox/items");
		expect(list.json.counts.needsApproval).toBe(1);
		expect(list.json.items[0].latestReply).toEqual({
			id: replyId,
			status: "pending_approval",
			text: "Yes, we do!",
		});

		expect((await editor.client.request("GET", "/inbox/approvals")).status).toBe(403);
		const approvals = await admin.client.request("GET", "/inbox/approvals");
		expect(approvals.json.items).toHaveLength(1);
		expect(approvals.json.items[0].reply.id).toBe(replyId);
		expect(approvals.json.items[0].item.id).toBe(it.id);

		// Editing a pending reply keeps it pending, as the user's own text now.
		const edited = await editor.client.request("PATCH", `/inbox/replies/${replyId}`, {
			text: "Yes — we ship to Ireland.",
		});
		expect(edited.json).toMatchObject({ status: "pending_approval", source: "human" });

		expect((await editor.client.request("POST", `/inbox/replies/${replyId}/approve`)).status).toBe(
			403,
		);
		const approved = await admin.client.request("POST", `/inbox/replies/${replyId}/approve`);
		expect(approved.status).toBe(200);
		expect(approved.json).toMatchObject({
			status: "queued",
			approvedBy: { id: admin.user.id },
		});
		const job = await replyQueue.getJob(jobIds.engagementReply(replyId, 0));
		expect(job?.data).toEqual({ replyId, organizationId: orgId, version: 0 });
		expect(job?.opts.attempts).toBe(1);

		// Queued replies are out of the editor's hands.
		const late = await editor.client.request("PATCH", `/inbox/replies/${replyId}`, { text: "no" });
		expect(late).toMatchObject({ status: 409, json: { error: { code: "reply_not_editable" } } });
		expect((await admin.client.request("POST", `/inbox/replies/${replyId}/approve`)).status).toBe(
			409,
		);
	});

	test("reject, resubmit, admin sends directly, approval off, drafts and deletes", async () => {
		const { owner, orgId, channelId } = await newOrg();
		const editor = await member(owner, orgId, "editor");
		const admin = await member(owner, orgId, "admin");
		const it = await item(orgId, channelId);

		const pending = await editor.client.request("POST", `/inbox/items/${it.id}/replies`, {
			text: "Buy now!!!",
			submit: true,
		});
		const rejected = await admin.client.request(
			"POST",
			`/inbox/replies/${pending.json.id}/reject`,
			{
				reason: "Too salesy",
			},
		);
		expect(rejected.json).toMatchObject({ status: "rejected", rejectionReason: "Too salesy" });
		const resubmitted = await editor.client.request("PATCH", `/inbox/replies/${pending.json.id}`, {
			text: "Happy to help — which grind do you use?",
			submit: true,
		});
		expect(resubmitted.json).toMatchObject({ status: "pending_approval", rejectionReason: null });
		// Withdraw to draft, then delete.
		const withdrawn = await editor.client.request("PATCH", `/inbox/replies/${pending.json.id}`, {
			submit: false,
		});
		expect(withdrawn.json.status).toBe("draft");
		expect(
			(await editor.client.request("DELETE", `/inbox/replies/${pending.json.id}`)).status,
		).toBe(204);

		// An admin's submit is approved by them and queued at once.
		const direct = await admin.client.request("POST", `/inbox/items/${it.id}/replies`, {
			text: "Thanks!",
			submit: true,
		});
		expect(direct.json).toMatchObject({ status: "queued", approvedBy: { id: admin.user.id } });
		expect(await replyQueue.getJob(jobIds.engagementReply(direct.json.id, 0))).toBeDefined();
		expect((await admin.client.request("DELETE", `/inbox/replies/${direct.json.id}`)).status).toBe(
			409,
		);

		// Approval off: an editor's submit goes straight out too.
		expect(
			(await editor.client.request("PATCH", "/inbox/settings", { replyApprovalRequired: false }))
				.status,
		).toBe(403);
		const settings = await admin.client.request("PATCH", "/inbox/settings", {
			replyApprovalRequired: false,
		});
		expect(settings.json.replyApprovalRequired).toBe(false);
		const other = await item(orgId, channelId);
		const free = await editor.client.request("POST", `/inbox/items/${other.id}/replies`, {
			text: "Sure thing",
			submit: true,
		});
		expect(free.json.status).toBe("queued");

		// A draft is just saved.
		const third = await item(orgId, channelId);
		const draft = await editor.client.request("POST", `/inbox/items/${third.id}/replies`, {
			text: "Draft",
			submit: false,
		});
		expect(draft).toMatchObject({ status: 201, json: { status: "draft", source: "human" } });
		const detail = await editor.client.request("GET", `/inbox/items/${third.id}`);
		expect(detail.json.replies.map((r: { id: string }) => r.id)).toEqual([draft.json.id]);
	});

	test("retry rules: failed → queued; unconfirmed needs confirmNotSent; sent is final", async () => {
		const { owner, orgId, channelId } = await newOrg();
		const it = await item(orgId, channelId);
		const insert = async (status: "failed" | "unconfirmed" | "sent", attempts = 1) => {
			const [row] = await db
				.insert(schema.engagementReplies)
				.values({
					organizationId: orgId,
					itemId: it.id,
					text: "Hello",
					status,
					attempts,
					errorCode: status === "sent" ? null : "boom",
					errorMessage: status === "sent" ? null : "It broke",
				})
				.returning();
			return row?.id as string;
		};
		const failed = await insert("failed", 2);
		const res = await owner.request("POST", `/inbox/replies/${failed}/retry`, {});
		expect(res.json).toMatchObject({ status: "queued", error: null });
		// The job carries the reply's current version, so the sender can claim it.
		expect(await replyQueue.getJob(jobIds.engagementReply(failed, 2))).toBeDefined();
		// Settle it so the next retry is not blocked by the in-flight check.
		await db
			.update(schema.engagementReplies)
			.set({ status: "sent" })
			.where(eq(schema.engagementReplies.id, failed));

		const unconfirmed = await insert("unconfirmed");
		const refused = await owner.request("POST", `/inbox/replies/${unconfirmed}/retry`, {});
		expect(refused).toMatchObject({ status: 409, json: { error: { code: "confirm_required" } } });
		const ok = await owner.request("POST", `/inbox/replies/${unconfirmed}/retry`, {
			confirmNotSent: true,
		});
		expect(ok.json.status).toBe("queued");

		const sent = await insert("sent");
		const final = await owner.request("POST", `/inbox/replies/${sent}/retry`, {
			confirmNotSent: true,
		});
		expect(final).toMatchObject({ status: 409, json: { error: { code: "not_retryable" } } });
	});

	test("length and capability are validated", async () => {
		const { owner, orgId, channelId } = await newOrg();
		const it = await item(orgId, channelId);
		const long = await owner.request("POST", `/inbox/items/${it.id}/replies`, {
			text: "x".repeat(51),
			submit: false,
		});
		expect(long).toMatchObject({
			status: 422,
			json: { error: { code: "reply_too_long", details: { limit: 50, length: 51 } } },
		});

		const old = await createChannel(orgId, "linkedin", "No reply scope");
		const blocked = await item(orgId, old.id);
		const res = await owner.request("POST", `/inbox/items/${blocked.id}/replies`, {
			text: "Hi",
			submit: true,
		});
		expect(res).toMatchObject({
			status: 409,
			json: {
				error: {
					code: "reply_not_possible",
					details: { reason: "Reconnect this channel to allow SocialFly to reply" },
				},
			},
		});
		// Saving a draft is still fine.
		const draft = await owner.request("POST", `/inbox/items/${blocked.id}/replies`, {
			text: "Hi",
			submit: false,
		});
		expect(draft.status).toBe(201);

		const own = await item(orgId, channelId, { fromSelf: true, status: "read" });
		const self = await owner.request("POST", `/inbox/items/${own.id}/replies`, {
			text: "Hi",
			submit: true,
		});
		expect(self.json.error.code).toBe("reply_not_possible");
	});
});

describe("listening", () => {
	test("CRUD, available providers and the active cap", async () => {
		const { owner, orgId, channelId } = await newOrg();
		const viewer = await member(owner, orgId, "viewer");
		await createChannel(orgId, "x", "Acme on X");

		const empty = await viewer.client.request("GET", "/inbox/listening");
		// x supports the inbox but not search; reddit has no channel here.
		expect(empty.json).toEqual({ items: [], availableProviders: ["linkedin"] });

		const unavailable = await owner.request("POST", "/inbox/listening", {
			query: "coffee",
			providers: ["x"],
		});
		expect(unavailable).toMatchObject({
			status: 422,
			json: { error: { code: "provider_unavailable", details: { providers: ["x"] } } },
		});
		expect(
			(
				await viewer.client.request("POST", "/inbox/listening", {
					query: "coffee",
					providers: ["linkedin"],
				})
			).status,
		).toBe(403);

		const created = await owner.request("POST", "/inbox/listening", {
			query: "best grinder",
			providers: ["linkedin", "linkedin"],
		});
		expect(created.status).toBe(201);
		expect(created.json).toMatchObject({
			query: "best grinder",
			providers: ["linkedin"],
			active: true,
			lastRunAt: null,
			newCount: 0,
		});
		await item(orgId, channelId, { kind: "discussion", listeningQueryId: created.json.id });
		await item(orgId, channelId, {
			kind: "discussion",
			listeningQueryId: created.json.id,
			status: "read",
		});
		const listed = await owner.request("GET", "/inbox/listening");
		expect(listed.json.items[0]).toMatchObject({ id: created.json.id, newCount: 1 });

		for (let i = 0; i < 9; i++) {
			const r = await owner.request("POST", "/inbox/listening", {
				query: `query ${i}`,
				providers: ["linkedin"],
			});
			expect(r.status).toBe(201);
		}
		const capped = await owner.request("POST", "/inbox/listening", {
			query: "one too many",
			providers: ["linkedin"],
		});
		expect(capped).toMatchObject({ status: 409, json: { error: { code: "query_limit" } } });

		const paused = await owner.request("PATCH", `/inbox/listening/${created.json.id}`, {
			active: false,
		});
		expect(paused.json).toMatchObject({ active: false, newCount: 1 });
		const now = await owner.request("POST", "/inbox/listening", {
			query: "fits now",
			providers: ["linkedin"],
		});
		expect(now.status).toBe(201);
		const resume = await owner.request("PATCH", `/inbox/listening/${created.json.id}`, {
			active: true,
		});
		expect(resume.json.error.code).toBe("query_limit");

		expect((await owner.request("DELETE", `/inbox/listening/${created.json.id}`)).status).toBe(204);
		expect((await owner.request("DELETE", `/inbox/listening/${created.json.id}`)).status).toBe(404);
	});
});

describe("settings and sync", () => {
	test("settings list what each channel can do and what a reconnect unlocks", async () => {
		const { owner, orgId, channelId } = await newOrg();
		const old = await createChannel(orgId, "linkedin", "Old connection");
		const yt = await createChannel(orgId, "youtube", "Videos");
		const gone = await createChannel(orgId, "x", "Gone");
		await db
			.update(schema.channels)
			.set({ status: "disconnected" })
			.where(eq(schema.channels.id, gone.id));

		const res = await owner.request("GET", "/inbox/settings");
		expect(res.json).toEqual({
			replyApprovalRequired: true,
			channels: [
				{
					id: channelId,
					name: "Acme on LinkedIn",
					provider: "linkedin",
					supportsInbox: true,
					canRead: true,
					canReply: true,
					missingScopes: [],
				},
				{
					id: old.id,
					name: "Old connection",
					provider: "linkedin",
					supportsInbox: true,
					canRead: false,
					canReply: false,
					missingScopes: ["r_comments", "w_comments"],
				},
				{
					id: yt.id,
					name: "Videos",
					provider: "youtube",
					supportsInbox: false,
					canRead: false,
					canReply: false,
					missingScopes: [],
				},
			],
		});
	});

	test("sync queues readable channels, once per 5 minutes", async () => {
		const { owner, orgId } = await newOrg();
		const viewer = await member(owner, orgId, "viewer");
		await createChannel(orgId, "linkedin", "No scopes");
		expect((await viewer.client.request("POST", "/inbox/sync")).status).toBe(403);
		const first = await owner.request("POST", "/inbox/sync");
		expect(first).toMatchObject({ status: 202, json: { queued: 1 } });
		const again = await owner.request("POST", "/inbox/sync");
		expect(again.status).toBe(429);
		expect(again.json.error.code).toBe("rate_limited");
		expect(again.json.error.details.retryAfterSeconds).toBeGreaterThan(0);
	});
});

describe("tenancy", () => {
	test("another organization's items and replies are 404", async () => {
		const mine = await newOrg();
		const theirs = await newOrg();
		const it = await item(theirs.orgId, theirs.channelId);
		const [reply] = await db
			.insert(schema.engagementReplies)
			.values({
				organizationId: theirs.orgId,
				itemId: it.id,
				text: "hi",
				status: "pending_approval",
			})
			.returning();
		const [query] = await db
			.insert(schema.listeningQueries)
			.values({ organizationId: theirs.orgId, query: "theirs", providers: ["linkedin"] })
			.returning();
		const c = mine.owner;
		expect((await c.request("GET", `/inbox/items/${it.id}`)).status).toBe(404);
		expect((await c.request("POST", `/inbox/items/${it.id}/draft`, {})).status).toBe(404);
		expect(
			(await c.request("POST", `/inbox/items/${it.id}/replies`, { text: "x", submit: false }))
				.status,
		).toBe(404);
		expect((await c.request("PATCH", `/inbox/replies/${reply?.id}`, { text: "x" })).status).toBe(
			404,
		);
		expect((await c.request("POST", `/inbox/replies/${reply?.id}/approve`)).status).toBe(404);
		expect(
			(await c.request("POST", `/inbox/replies/${reply?.id}/reject`, { reason: "x" })).status,
		).toBe(404);
		expect((await c.request("DELETE", `/inbox/replies/${reply?.id}`)).status).toBe(404);
		expect(
			(await c.request("PATCH", `/inbox/listening/${query?.id}`, { active: false })).status,
		).toBe(404);
		expect((await c.request("DELETE", `/inbox/listening/${query?.id}`)).status).toBe(404);
		expect((await c.request("GET", "/inbox/approvals")).json.items).toEqual([]);
	});
});
