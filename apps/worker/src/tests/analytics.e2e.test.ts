import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { createLogger } from "@socialfly/core/logger";
import { normalizeEmail } from "@socialfly/core/security";
import { asc, eq, schema } from "@socialfly/db";
import { ProviderError, ProviderRegistry } from "@socialfly/integrations";
import { jobIds, QUEUE_PREFIX, QUEUES } from "@socialfly/queue";
import { Queue } from "bullmq";
import { AnalyticsCollector } from "#src/analytics/analytics-collector.ts";
import { CallBudgetExhausted, RedisCallBudget } from "#src/analytics/call-budget.ts";
import { ChannelTokens } from "#src/channels/channel-tokens.ts";
import { db, jobs, queueConnection, tokenCipher } from "#src/infrastructure/index.ts";
import { FakeProvider } from "./fake-provider.ts";

const logger = createLogger({ service: "worker-test", level: "fatal" });
const analyticsQueue = new Queue(QUEUES.analytics, {
	connection: queueConnection,
	prefix: QUEUE_PREFIX,
});

const HOUR = 3600_000;
const DAY = 24 * HOUR;

let fake: FakeProvider;
let collector: AnalyticsCollector;
/** Calls left before the fake budget reports "spent"; Infinity by default. */
let budgetLeft = Number.POSITIVE_INFINITY;

function makeCollector(provider: FakeProvider) {
	const providers = new ProviderRegistry([provider]);
	return new AnalyticsCollector({
		db,
		providers,
		tokens: new ChannelTokens(db, providers, tokenCipher, logger),
		budget: {
			take: async () => {
				if (budgetLeft <= 0) return 42_000;
				budgetLeft--;
				return 0;
			},
		},
		jobs,
		logger,
	});
}

beforeEach(async () => {
	fake = new FakeProvider().withAnalytics({ maxPostsPerCall: 2 });
	collector = makeCollector(fake);
	budgetLeft = Number.POSITIVE_INFINITY;
	await analyticsQueue.obliterate({ force: true });
});

afterAll(async () => {
	await analyticsQueue.obliterate({ force: true });
	await analyticsQueue.close();
});

async function newChannel(
	opts: { status?: "active" | "needs_reauth"; refreshable?: boolean; orgDeleted?: boolean } = {},
) {
	const email = `a-${crypto.randomUUID()}@example.test`;
	const [user] = await db
		.insert(schema.users)
		.values({ email, emailNormalized: normalizeEmail(email) })
		.returning();
	const [org] = await db
		.insert(schema.organizations)
		.values({
			name: "Org",
			slug: `org-${crypto.randomUUID()}`,
			createdBy: user?.id,
			deletedAt: opts.orgDeleted ? new Date() : null,
		})
		.returning();
	const [channel] = await db
		.insert(schema.channels)
		.values({
			organizationId: org?.id as string,
			provider: "linkedin",
			externalId: crypto.randomUUID(),
			name: "Fake channel",
			accessTokenEnc: tokenCipher.encrypt("original-token"),
			refreshTokenEnc: opts.refreshable ? tokenCipher.encrypt("original-refresh") : null,
			tokenExpiresAt: opts.refreshable ? new Date(Date.now() + HOUR) : null,
			status: opts.status ?? "active",
		})
		.returning();
	return { orgId: org?.id as string, channelId: channel?.id as string };
}

/** A published target `ageMs` old, with snapshots captured `snapshotsAgoMs` ago. */
async function target(
	ch: { orgId: string; channelId: string },
	ageMs: number,
	opts: {
		snapshotsAgoMs?: number[];
		status?: "published" | "failed";
		externalId?: string | null;
	} = {},
) {
	const [post] = await db
		.insert(schema.posts)
		.values({ organizationId: ch.orgId, content: "hi", status: "published" })
		.returning();
	const externalId = opts.externalId === undefined ? `ext-${crypto.randomUUID()}` : opts.externalId;
	const [row] = await db
		.insert(schema.postTargets)
		.values({
			organizationId: ch.orgId,
			postId: post?.id as string,
			channelId: ch.channelId,
			status: opts.status ?? "published",
			externalId,
			publishedAt: new Date(Date.now() - ageMs),
		})
		.returning();
	const targetId = row?.id as string;
	for (const ago of opts.snapshotsAgoMs ?? []) {
		await db.insert(schema.postTargetMetrics).values({
			organizationId: ch.orgId,
			targetId,
			capturedAt: new Date(Date.now() - ago),
			likes: 1,
		});
	}
	return { targetId, externalId: externalId as string };
}

const snapshotsOf = (targetId: string) =>
	db
		.select()
		.from(schema.postTargetMetrics)
		.where(eq(schema.postTargetMetrics.targetId, targetId))
		.orderBy(asc(schema.postTargetMetrics.capturedAt));

describe("due selection", () => {
	test("collects by age bucket: hourly < 48 h, 6-hourly < 7 d, daily < 30 d, never after", async () => {
		const ch = await newChannel();
		const due = [
			await target(ch, 2 * HOUR), // never collected
			await target(ch, 10 * HOUR, { snapshotsAgoMs: [3 * HOUR, 70 * 60_000] }),
			await target(ch, 3 * DAY, { snapshotsAgoMs: [7 * HOUR] }),
			await target(ch, 10 * DAY, { snapshotsAgoMs: [25 * HOUR] }),
		];
		const notDue = [
			await target(ch, 10 * HOUR, { snapshotsAgoMs: [2 * HOUR, 30 * 60_000] }), // latest wins
			await target(ch, 3 * DAY, { snapshotsAgoMs: [3 * HOUR] }),
			await target(ch, 10 * DAY, { snapshotsAgoMs: [12 * HOUR] }),
			await target(ch, 40 * DAY), // final numbers are kept
			await target(ch, HOUR, { status: "failed" }),
			await target(ch, HOUR, { externalId: null }),
		];

		const ids = (await collector.dueTargets(ch.channelId)).map((t) => t.id).sort();
		expect(ids).toEqual(due.map((t) => t.targetId).sort());

		// A forced refresh takes everything inside the window not captured minutes ago.
		const forced = (await collector.dueTargets(ch.channelId, true)).map((t) => t.id).sort();
		expect(forced).toEqual(
			[...due, notDue[0], notDue[1], notDue[2]].map((t) => t?.targetId as string).sort(),
		);
		const justCaptured = await target(ch, HOUR, { snapshotsAgoMs: [2 * 60_000] });
		expect((await collector.dueTargets(ch.channelId, true)).map((t) => t.id)).not.toContain(
			justCaptured.targetId,
		);
	});
});

describe("collect-posts", () => {
	test("batches by maxPostsPerCall and writes one snapshot per returned post", async () => {
		const ch = await newChannel();
		const targets = [];
		for (let i = 0; i < 5; i++) targets.push(await target(ch, (i + 1) * HOUR));
		for (const t of targets) fake.platformMetrics.set(t.externalId, { impressions: 100, likes: 7 });

		const result = await collector.collectPosts(ch.channelId, { force: false });
		expect(result).toEqual({ collected: 5, missing: 0 });
		expect(fake.metricsCalls.map((c) => c.ids.length)).toEqual([2, 2, 1]);
		expect(fake.metricsCalls[0]?.token).toBe("original-token");
		const [snap] = await snapshotsOf(targets[0]?.targetId as string);
		expect(snap).toMatchObject({ organizationId: ch.orgId, impressions: 100, likes: 7 });
		// Not reported ≠ zero.
		expect(snap?.comments).toBeNull();
		expect(snap?.videoViews).toBeNull();

		// Nothing is due any more: a second run does not call the platform.
		fake.metricsCalls = [];
		expect(await collector.collectPosts(ch.channelId, { force: false })).toEqual({
			collected: 0,
			missing: 0,
		});
		expect(fake.metricsCalls).toHaveLength(0);
	});

	test("a post deleted on the platform gets no row (its last numbers stay the latest)", async () => {
		const ch = await newChannel();
		const kept = await target(ch, HOUR);
		const gone = await target(ch, 2 * HOUR, { snapshotsAgoMs: [2 * HOUR] });
		fake.platformMetrics.set(kept.externalId, { likes: 3 });

		expect(await collector.collectPosts(ch.channelId, { force: false })).toEqual({
			collected: 1,
			missing: 1,
		});
		expect(await snapshotsOf(kept.targetId)).toHaveLength(1);
		expect(await snapshotsOf(gone.targetId)).toHaveLength(1); // only the old one
	});

	test("auth error → one token refresh → resend with the new token", async () => {
		const ch = await newChannel({ refreshable: true });
		const t = await target(ch, HOUR);
		fake.platformMetrics.set(t.externalId, { likes: 1 });
		fake.analyticsErrors.push(new ProviderError("auth", "linkedin", "401"));

		expect(await collector.collectPosts(ch.channelId, { force: false })).toMatchObject({
			collected: 1,
		});
		expect(fake.refreshCalls).toBe(1);
		expect(fake.metricsCalls.map((c) => c.token)).toEqual(["original-token", "refreshed-1"]);
	});

	test("auth error again after the refresh → give up this run, channel NOT flagged", async () => {
		const ch = await newChannel({ refreshable: true });
		const t = await target(ch, HOUR);
		fake.platformMetrics.set(t.externalId, { likes: 1 });
		fake.analyticsErrors.push(
			new ProviderError("auth", "linkedin", "403 missing scope"),
			new ProviderError("auth", "linkedin", "403 missing scope"),
		);

		expect(await collector.collectPosts(ch.channelId, { force: false })).toEqual({
			collected: 0,
			missing: 0,
			skipped: "auth",
		});
		expect(fake.metricsCalls).toHaveLength(2);
		expect(await snapshotsOf(t.targetId)).toHaveLength(0);
		const [channel] = await db
			.select()
			.from(schema.channels)
			.where(eq(schema.channels.id, ch.channelId));
		// A missing analytics scope must not stop publishing.
		expect(channel?.status).toBe("active");
	});

	test("rate_limited throws for a BullMQ retry; stored batches are not collected again", async () => {
		const ch = await newChannel();
		const targets = [];
		for (let i = 0; i < 3; i++) targets.push(await target(ch, (i + 1) * HOUR));
		for (const t of targets) fake.platformMetrics.set(t.externalId, { likes: 2 });
		// First batch answers, the second is throttled.
		fake.analyticsErrors.push(
			null,
			new ProviderError("rate_limited", "linkedin", "429", { retryAfterMs: 60_000 }),
		);

		const error = await collector.collectPosts(ch.channelId, { force: false }).catch((e) => e);
		expect(error).toBeInstanceOf(ProviderError);
		expect(error.kind).toBe("rate_limited");
		expect(fake.metricsCalls.map((c) => c.ids.length)).toEqual([2, 1]);

		fake.metricsCalls = [];
		expect(await collector.collectPosts(ch.channelId, { force: false })).toEqual({
			collected: 1,
			missing: 0,
		});
		expect(fake.metricsCalls.map((c) => c.ids)).toEqual([[targets[2]?.externalId as string]]);
	});

	test("transient errors throw too", async () => {
		const ch = await newChannel();
		await target(ch, HOUR);
		fake.analyticsErrors.push(new ProviderError("transient", "linkedin", "503"));
		const error = await collector.collectPosts(ch.channelId, { force: false }).catch((e) => e);
		expect(error).toBeInstanceOf(ProviderError);
	});

	test("invalid_request skips that batch and carries on", async () => {
		const ch = await newChannel();
		const targets = [];
		for (let i = 0; i < 3; i++) targets.push(await target(ch, (i + 1) * HOUR));
		for (const t of targets) fake.platformMetrics.set(t.externalId, { likes: 2 });
		fake.analyticsErrors.push(new ProviderError("invalid_request", "linkedin", "bad urn"));

		expect(await collector.collectPosts(ch.channelId, { force: false })).toEqual({
			collected: 1,
			missing: 0,
		});
	});

	test("a spent call budget delays the job before any platform call", async () => {
		const ch = await newChannel();
		await target(ch, HOUR);
		budgetLeft = 0;
		const error = await collector.collectPosts(ch.channelId, { force: false }).catch((e) => e);
		expect(error).toBeInstanceOf(CallBudgetExhausted);
		expect(error.retryInMs).toBe(42_000);
		expect(fake.metricsCalls).toHaveLength(0);
	});

	test("channels needing reauth, in deleted orgs, or without analytics are skipped", async () => {
		const reauth = await newChannel({ status: "needs_reauth" });
		await target(reauth, HOUR);
		expect(await collector.collectPosts(reauth.channelId, { force: false })).toEqual({
			skipped: "channel_needs_reauth",
		});

		const deleted = await newChannel({ orgDeleted: true });
		await target(deleted, HOUR);
		expect(await collector.collectPosts(deleted.channelId, { force: false })).toEqual({
			skipped: "channel_missing",
		});

		const plain = makeCollector(new FakeProvider());
		const ch = await newChannel();
		await target(ch, HOUR);
		expect(await plain.collectPosts(ch.channelId, { force: false })).toEqual({
			skipped: "unsupported",
		});
		expect(fake.metricsCalls).toHaveLength(0);
	});

	test("an expired token that cannot be refreshed marks the channel and stops", async () => {
		const ch = await newChannel();
		await db
			.update(schema.channels)
			.set({ tokenExpiresAt: new Date(Date.now() - 1000) })
			.where(eq(schema.channels.id, ch.channelId));
		await target(ch, HOUR);
		expect(await collector.collectPosts(ch.channelId, { force: false })).toEqual({
			collected: 0,
			missing: 0,
			skipped: "needs_reauth",
		});
		expect(fake.metricsCalls).toHaveLength(0);
	});
});

describe("collect-account", () => {
	const day = (offset: number) => new Date(Date.now() - offset * DAY).toISOString().slice(0, 10);

	test("reads the last 3 UTC days and upserts idempotently, keeping known numbers", async () => {
		const ch = await newChannel();
		fake.accountDays = [
			{ date: day(2), followers: 100, impressions: 1000 },
			{ date: day(1), followers: 110, impressions: 1200 },
			{ date: day(0), followers: 115 },
			{ date: day(10), followers: 1 }, // outside the requested range: ignored
		];
		expect(await collector.collectAccount(ch.channelId)).toEqual({ days: 3 });
		expect(fake.accountCalls[0]).toMatchObject({ since: day(2), until: day(0) });

		// Re-collect: a revised number overwrites, a missing one keeps what we had.
		fake.accountDays = [
			{ date: day(1), followers: 111 },
			{ date: day(0), followers: 116, impressions: 50 },
		];
		expect(await collector.collectAccount(ch.channelId)).toEqual({ days: 2 });

		const rows = await db
			.select()
			.from(schema.channelMetricsDaily)
			.where(eq(schema.channelMetricsDaily.channelId, ch.channelId))
			.orderBy(asc(schema.channelMetricsDaily.day));
		expect(rows.map((r) => [r.day, r.followers, r.impressions])).toEqual([
			[day(2), 100, 1000],
			[day(1), 111, 1200],
			[day(0), 116, 50],
		]);
	});

	test("a provider without account metrics is skipped", async () => {
		const plain = makeCollector(new FakeProvider().withAnalytics({ account: false }));
		const ch = await newChannel();
		expect(await plain.collectAccount(ch.channelId)).toEqual({ skipped: "no_account_metrics" });
	});
});

describe("plan", () => {
	test("enqueues one collect job per channel with work due, deduplicated per bucket", async () => {
		const due = await newChannel();
		await target(due, HOUR);
		const idle = await newChannel();
		await target(idle, HOUR, { snapshotsAgoMs: [60_000] });
		await db.insert(schema.channelMetricsDaily).values({
			channelId: idle.channelId,
			organizationId: idle.orgId,
			day: new Date().toISOString().slice(0, 10),
			followers: 1,
		});
		const reauth = await newChannel({ status: "needs_reauth" });
		await target(reauth, HOUR);
		const deleted = await newChannel({ orgDeleted: true });
		await target(deleted, HOUR);

		const now = Date.now();
		await collector.plan();
		await collector.plan(); // same bucket: no duplicate
		const hour = Math.floor(now / HOUR);
		const today = new Date(now).toISOString().slice(0, 10);
		const has = async (id: string) => (await analyticsQueue.getJob(id)) !== undefined;

		expect(await has(jobIds.analyticsPosts(due.channelId, hour))).toBe(true);
		expect(await has(jobIds.analyticsAccount(due.channelId, today))).toBe(true);
		expect(await has(jobIds.analyticsPosts(idle.channelId, hour))).toBe(false);
		expect(await has(jobIds.analyticsAccount(idle.channelId, today))).toBe(false);
		for (const skipped of [reauth, deleted]) {
			expect(await has(jobIds.analyticsPosts(skipped.channelId, hour))).toBe(false);
			expect(await has(jobIds.analyticsAccount(skipped.channelId, today))).toBe(false);
		}
		const mine = (await analyticsQueue.getJobs(["waiting"])).filter(
			(j) => j.data.channelId === due.channelId,
		);
		expect(mine.map((j) => j.data.task).sort()).toEqual(["collect-account", "collect-posts"]);
	});

	test("does nothing when no configured provider reports analytics", async () => {
		const ch = await newChannel();
		await target(ch, HOUR);
		expect(await makeCollector(new FakeProvider()).plan()).toEqual({ posts: 0, accounts: 0 });
	});
});

describe("call budget", () => {
	test("allows max calls per window per provider, then reports the wait", async () => {
		const budget = new RedisCallBudget(queueConnection, { max: 2, windowMs: 60_000 });
		const provider = `test-${crypto.randomUUID()}`;
		expect(await budget.take(provider)).toBe(0);
		expect(await budget.take(provider)).toBe(0);
		const wait = await budget.take(provider);
		expect(wait).toBeGreaterThan(0);
		expect(wait).toBeLessThanOrEqual(60_000);
		expect(await budget.take(`other-${provider}`)).toBe(0);
	});
});
