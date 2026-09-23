import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { createLogger } from "@socialfly/core/logger";
import { normalizeEmail } from "@socialfly/core/security";
import { eq, schema, sql } from "@socialfly/db";
import { ProviderError, ProviderRegistry } from "@socialfly/integrations";
import { jobIds, publishQueueName, QUEUE_PREFIX, QUEUES } from "@socialfly/queue";
import { Queue } from "bullmq";
import { ChannelTokens } from "#src/channels/channel-tokens.ts";
import { db, jobs, queueConnection, tokenCipher } from "#src/infrastructure/index.ts";
import { Maintenance } from "#src/maintenance/maintenance.ts";
import { PublishingEngine } from "#src/publishing/publishing-engine.ts";
import { TargetState } from "#src/publishing/target-state.ts";
import { FakeProvider } from "./fake-provider.ts";

const logger = createLogger({ service: "worker-test", level: "fatal" });
const publishQueue = new Queue(publishQueueName("linkedin"), {
	connection: queueConnection,
	prefix: QUEUE_PREFIX,
});
const statusQueue = new Queue(QUEUES.publishStatus, {
	connection: queueConnection,
	prefix: QUEUE_PREFIX,
});

let fake: FakeProvider;
let engine: PublishingEngine;
let maintenance: Maintenance;

beforeEach(async () => {
	fake = new FakeProvider();
	const providers = new ProviderRegistry([fake]);
	const state = new TargetState(db);
	engine = new PublishingEngine({
		db,
		providers,
		tokens: new ChannelTokens(db, providers, tokenCipher, logger),
		state,
		jobs,
		logger,
		publicMediaUrl: "http://storage.test/media",
	});
	maintenance = new Maintenance(db, jobs, state, logger);
	await Promise.all([
		publishQueue.obliterate({ force: true }),
		statusQueue.obliterate({ force: true }),
	]);
});

afterAll(async () => {
	await Promise.all([publishQueue.close(), statusQueue.close()]);
});

/** An org, a channel and one post with one target scheduled at `scheduleVersion` 1. */
async function scheduledTarget(opts: { refreshable?: boolean; expiresInMs?: number } = {}) {
	const email = `w-${crypto.randomUUID()}@example.test`;
	const [user] = await db
		.insert(schema.users)
		.values({ email, emailNormalized: normalizeEmail(email) })
		.returning();
	const [org] = await db
		.insert(schema.organizations)
		.values({ name: "Org", slug: `org-${crypto.randomUUID()}`, createdBy: user?.id })
		.returning();
	const orgId = org?.id as string;
	const [channel] = await db
		.insert(schema.channels)
		.values({
			organizationId: orgId,
			provider: "linkedin",
			externalId: crypto.randomUUID(),
			name: "Fake channel",
			accessTokenEnc: tokenCipher.encrypt("original-token"),
			refreshTokenEnc: opts.refreshable ? tokenCipher.encrypt("original-refresh") : null,
			tokenExpiresAt:
				opts.expiresInMs !== undefined ? new Date(Date.now() + opts.expiresInMs) : null,
		})
		.returning();
	const [post] = await db
		.insert(schema.posts)
		.values({ organizationId: orgId, content: "Hello from the engine", status: "scheduled" })
		.returning();
	const [target] = await db
		.insert(schema.postTargets)
		.values({
			organizationId: orgId,
			postId: post?.id as string,
			channelId: channel?.id as string,
			status: "scheduled",
			scheduledAt: new Date(),
			scheduleVersion: 1,
		})
		.returning();
	return {
		orgId,
		channelId: channel?.id as string,
		postId: post?.id as string,
		targetId: target?.id as string,
		job: { targetId: target?.id as string, organizationId: orgId, scheduleVersion: 1 },
	};
}

const load = async (targetId: string) => {
	const [target] = await db
		.select()
		.from(schema.postTargets)
		.where(eq(schema.postTargets.id, targetId));
	const [post] = await db
		.select()
		.from(schema.posts)
		.where(eq(schema.posts.id, target?.postId as string));
	const events = await db
		.select()
		.from(schema.postTargetEvents)
		.where(eq(schema.postTargetEvents.targetId, targetId));
	return { target, post, events: events.map((e) => e.type) };
};

describe("publishing engine", () => {
	test("publishes once and records the result", async () => {
		const t = await scheduledTarget();
		fake.publishSteps.push({
			status: "published",
			externalId: "urn:li:share:1",
			url: "https://x/1",
		});

		await engine.publish(t.job);

		const { target, post, events } = await load(t.targetId);
		expect(target).toMatchObject({
			status: "published",
			externalId: "urn:li:share:1",
			externalUrl: "https://x/1",
			attempts: 1,
		});
		expect(target?.publishedAt).toBeInstanceOf(Date);
		expect(post?.status).toBe("published");
		expect(events).toEqual(["publishing", "published"]);
		expect(fake.publishCalls).toEqual([{ token: "original-token", text: "Hello from the engine" }]);
	});

	test("a duplicate job for the same version never hits the platform twice", async () => {
		const t = await scheduledTarget();
		fake.publishSteps.push({ status: "published", externalId: "1", url: null });
		await Promise.all([engine.publish(t.job), engine.publish(t.job), engine.publish(t.job)]);
		expect(fake.publishCalls).toHaveLength(1);
	});

	test("a stale job (rescheduled since) does nothing", async () => {
		const t = await scheduledTarget();
		await db
			.update(schema.postTargets)
			.set({ scheduleVersion: 2 })
			.where(eq(schema.postTargets.id, t.targetId));
		await engine.publish(t.job); // version 1
		expect(fake.publishCalls).toHaveLength(0);
		expect((await load(t.targetId)).target?.status).toBe("scheduled");
	});

	test("unknown outcome → unconfirmed, and is NOT retried", async () => {
		const t = await scheduledTarget();
		fake.publishSteps.push(new ProviderError("unknown_outcome", "linkedin", "socket hang up"));
		await engine.publish(t.job);

		const { target, post } = await load(t.targetId);
		expect(target?.status).toBe("unconfirmed");
		expect(target?.errorMessage).toContain("may already be live");
		expect(post?.status).toBe("failed");
		expect(await publishQueue.getJobCounts("delayed", "waiting")).toEqual({
			delayed: 0,
			waiting: 0,
		});
	});

	test("transient failure → rescheduled with a new version and a delayed job", async () => {
		const t = await scheduledTarget();
		fake.publishSteps.push(new ProviderError("transient", "linkedin", "503 on media upload"));
		await engine.publish(t.job);

		const { target, events } = await load(t.targetId);
		expect(target).toMatchObject({ status: "scheduled", scheduleVersion: 2, attempts: 1 });
		expect(target?.scheduledAt?.getTime()).toBeGreaterThan(Date.now() + 20_000);
		expect(events).toContain("retry_scheduled");
		const job = await publishQueue.getJob(jobIds.publish(t.targetId, 2));
		expect(await job?.isDelayed()).toBe(true);
	});

	test("rejected content fails immediately with the platform's reason", async () => {
		const t = await scheduledTarget();
		fake.publishSteps.push(
			new ProviderError("invalid_request", "linkedin", "Duplicate post", {
				platformCode: "DUPLICATE_POST",
			}),
		);
		await engine.publish(t.job);
		expect((await load(t.targetId)).target).toMatchObject({
			status: "failed",
			errorCode: "DUPLICATE_POST",
		});
	});

	test("auth failure → refresh token once → resend succeeds with the new token", async () => {
		const t = await scheduledTarget({ refreshable: true, expiresInMs: 3600_000 });
		fake.publishSteps.push(new ProviderError("auth", "linkedin", "401"), {
			status: "published",
			externalId: "2",
			url: null,
		});
		await engine.publish(t.job);

		expect((await load(t.targetId)).target?.status).toBe("published");
		expect(fake.refreshCalls).toBe(1);
		expect(fake.publishCalls.map((c) => c.token)).toEqual(["original-token", "refreshed-1"]);
		const [channel] = await db
			.select()
			.from(schema.channels)
			.where(eq(schema.channels.id, t.channelId));
		expect(tokenCipher.decrypt(channel?.refreshTokenEnc as string)).toBe("rotated-1");
	});

	test("auth failure on a channel that cannot refresh → needs_reauth, target failed", async () => {
		const t = await scheduledTarget();
		fake.publishSteps.push(
			new ProviderError("auth", "linkedin", "401"),
			new ProviderError("auth", "linkedin", "401"),
		);
		await engine.publish(t.job);

		expect((await load(t.targetId)).target).toMatchObject({
			status: "failed",
			errorCode: "channel_needs_reauth",
		});
		const [channel] = await db
			.select()
			.from(schema.channels)
			.where(eq(schema.channels.id, t.channelId));
		expect(channel?.status).toBe("needs_reauth");
	});

	test("expiring tokens are refreshed BEFORE publishing", async () => {
		const t = await scheduledTarget({ refreshable: true, expiresInMs: 60_000 });
		fake.publishSteps.push({ status: "published", externalId: "3", url: null });
		await engine.publish(t.job);
		expect(fake.publishCalls[0]?.token).toBe("refreshed-1");
	});

	test("async media: processing → status polls → published", async () => {
		const t = await scheduledTarget();
		fake.publishSteps.push({
			status: "processing",
			pendingData: { containerId: "c1" },
			pollAfterMs: 10,
		});
		fake.statusSteps.push(
			{ status: "processing", pendingData: { containerId: "c1", step: 2 }, pollAfterMs: 10 },
			{ status: "published", externalId: "ig-1", url: "https://ig/1" },
		);

		await engine.publish(t.job);
		expect((await load(t.targetId)).target).toMatchObject({
			status: "processing",
			pendingData: { containerId: "c1" },
		});
		expect(await statusQueue.getJob(jobIds.publishStatus(t.targetId, 0))).toBeDefined();

		await engine.checkStatus({ targetId: t.targetId, organizationId: t.orgId, check: 0 });
		expect((await load(t.targetId)).target?.pendingData).toEqual({ containerId: "c1", step: 2 });

		await engine.checkStatus({ targetId: t.targetId, organizationId: t.orgId, check: 1 });
		const { target, post } = await load(t.targetId);
		expect(target).toMatchObject({ status: "published", externalId: "ig-1", pendingData: null });
		expect(post?.status).toBe("published");
		expect(fake.publishCalls).toHaveLength(1);
	});

	test("content that no longer fits the platform fails without calling it", async () => {
		const t = await scheduledTarget();
		await db
			.update(schema.posts)
			.set({ content: "x".repeat(281) })
			.where(eq(schema.posts.id, t.postId));
		await engine.publish(t.job);
		expect((await load(t.targetId)).target).toMatchObject({
			status: "failed",
			errorCode: "invalid_content",
		});
		expect(fake.publishCalls).toHaveLength(0);
	});
});

describe("maintenance", () => {
	test("sweep re-enqueues a due target whose job was lost", async () => {
		const t = await scheduledTarget();
		const first = await maintenance.sweepDueTargets();
		expect(first.recovered).toBeGreaterThanOrEqual(1);
		expect(await publishQueue.getJob(jobIds.publish(t.targetId, 1))).toBeDefined();

		// Idempotent: the job exists now, so a second sweep adds nothing for it.
		await maintenance.sweepDueTargets();
		const counts = await publishQueue.getJobCounts("waiting", "delayed");
		expect((counts.waiting ?? 0) + (counts.delayed ?? 0)).toBe(first.recovered);
	});

	test("a target stuck in `publishing` (worker died) becomes unconfirmed", async () => {
		const t = await scheduledTarget();
		await db
			.update(schema.postTargets)
			.set({ status: "publishing", updatedAt: sql`now() - interval '20 minutes'` })
			.where(eq(schema.postTargets.id, t.targetId));
		await maintenance.recoverStuckTargets();
		expect((await load(t.targetId)).target?.status).toBe("unconfirmed");
	});
});
