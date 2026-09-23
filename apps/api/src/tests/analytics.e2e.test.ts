import { afterAll, describe, expect, test } from "bun:test";
import { eq, schema } from "@socialfly/db";
import { createQueueConnection, QUEUE_PREFIX, QUEUES } from "@socialfly/queue";
import { Queue } from "bullmq";
import { db, providers } from "#src/infrastructure/index.ts";
import { type ApiClient, createChannel, createUser } from "./helpers";

const queueRedis = createQueueConnection(process.env.REDIS_URL as string);
const analyticsQueue = new Queue(QUEUES.analytics, {
	connection: queueRedis,
	prefix: QUEUE_PREFIX,
});

afterAll(async () => {
	await analyticsQueue.obliterate({ force: true }).catch(() => {});
	await analyticsQueue.close();
	await queueRedis.quit();
});

const DAY = 24 * 3600_000;

async function newOrg(timezone = "UTC") {
	const { user, client } = await createUser("Owner");
	const res = await client.request("POST", "/organizations", { name: "Analytics Co" });
	expect(res.status).toBe(201);
	const orgId = res.json.id as string;
	client.orgId = orgId;
	await db.update(schema.organizations).set({ timezone }).where(eq(schema.organizations.id, orgId));
	return { user, client, orgId };
}

async function addMember(owner: ApiClient, orgId: string, role: "viewer" | "editor") {
	const { user, client } = await createUser(role);
	const invite = await owner.request("POST", "/organization/invitations", {
		email: user.email,
		role,
	});
	await client.request("POST", "/organizations/invitations/accept", { token: invite.json.token });
	client.orgId = orgId;
	return client;
}

type Metrics = Partial<
	Record<
		"impressions" | "reach" | "likes" | "comments" | "shares" | "saves" | "clicks" | "videoViews",
		number
	>
>;

/** A published post on one channel, with snapshots (oldest first) captured a minute apart. */
async function published(
	orgId: string,
	channelId: string,
	publishedAt: string | Date,
	snapshots: Metrics[] = [],
	opts: { content?: string; contentOverride?: string; status?: "published" | "failed" } = {},
) {
	const [post] = await db
		.insert(schema.posts)
		.values({ organizationId: orgId, content: opts.content ?? "A post", status: "published" })
		.returning();
	const at = new Date(publishedAt);
	const [target] = await db
		.insert(schema.postTargets)
		.values({
			organizationId: orgId,
			postId: post?.id as string,
			channelId,
			contentOverride: opts.contentOverride ?? null,
			status: opts.status ?? "published",
			externalId: `ext-${crypto.randomUUID()}`,
			externalUrl: `https://platform.test/${crypto.randomUUID()}`,
			publishedAt: at,
		})
		.returning();
	const base = Date.now() - snapshots.length * 60_000;
	if (snapshots.length > 0) {
		await db.insert(schema.postTargetMetrics).values(
			snapshots.map((m, i) => ({
				organizationId: orgId,
				targetId: target?.id as string,
				capturedAt: new Date(base + i * 60_000),
				...m,
			})),
		);
	}
	return { postId: post?.id as string, targetId: target?.id as string };
}

const linkedinSupported = () => {
	const p = providers.get("linkedin");
	return Boolean(p?.isConfigured() && p.analytics);
};

describe("overview", () => {
	test("latest snapshot wins, nulls stay null, timezone day boundaries, zero-filled days", async () => {
		// New York is UTC-4 in September: a local day runs 04:00Z → 04:00Z next day.
		const { client, orgId } = await newOrg("America/New_York");
		const a = await createChannel(orgId, "linkedin", "Channel A");
		const b = await createChannel(orgId, "x", "Channel B");
		const gone = await createChannel(orgId, "x", "Disconnected, no posts");
		await db
			.update(schema.channels)
			.set({ status: "disconnected" })
			.where(eq(schema.channels.id, gone.id));

		// Aug 31 23:30 local: previous period, not this one.
		await published(orgId, a.id, "2026-09-01T03:30:00Z", [{ impressions: 10, likes: 1 }]);
		const t2 = await published(
			orgId,
			a.id,
			"2026-09-01T04:30:00Z",
			[
				{ impressions: 50, likes: 1 },
				{ impressions: 100, likes: 5, comments: 2 },
			],
			{ content: "base copy", contentOverride: "LinkedIn copy" },
		);
		const t3 = await published(
			orgId,
			a.id,
			"2026-09-03T15:00:00Z",
			[{ impressions: 200, likes: 10, comments: 0, shares: 3, saves: 1, clicks: 4 }],
			{ content: "x".repeat(200) },
		);
		// Impressions only: engagements unknown, not zero.
		await published(orgId, a.id, "2026-09-05T12:00:00Z", [{ impressions: 300 }]);
		// Engagements without impressions: counted, but kept out of the rate.
		const t5 = await published(orgId, b.id, "2026-09-06T12:00:00Z", [{ likes: 20 }]);
		await published(orgId, a.id, "2026-09-07T12:00:00Z"); // never collected
		await published(orgId, a.id, "2026-09-08T03:59:00Z"); // Sep 7 23:59 local
		await published(orgId, a.id, "2026-09-08T04:00:00Z"); // Sep 8 00:00 local: out
		await published(orgId, a.id, "2026-09-04T12:00:00Z", [], { status: "failed" }); // not published

		await db.insert(schema.channelMetricsDaily).values(
			[
				["2026-08-31", 1000],
				["2026-09-03", 1010],
				["2026-09-07", 1025],
				["2026-09-10", 1100],
			].map(([day, followers]) => ({
				channelId: a.id,
				organizationId: orgId,
				day: day as string,
				followers: followers as number,
			})),
		);

		const res = await client.request("GET", "/analytics/overview?from=2026-09-01&to=2026-09-07");
		expect(res.status).toBe(200);
		const o = res.json;
		expect(o.range).toEqual({ from: "2026-09-01", to: "2026-09-07", timezone: "America/New_York" });
		expect(o.totals).toEqual({
			posts: 6,
			impressions: 600,
			reach: null,
			engagements: 41,
			likes: 35,
			comments: 2,
			shares: 3,
			saves: 1,
			clicks: 4,
			videoViews: null,
			engagementRate: 0.07, // (7 + 14) / (100 + 200)
		});
		expect(o.previousTotals).toMatchObject({
			posts: 1,
			impressions: 10,
			engagements: 1,
			engagementRate: 0.1,
			reach: null,
		});
		expect(o.daily).toEqual([
			{ date: "2026-09-01", posts: 1, impressions: 100, engagements: 7 },
			{ date: "2026-09-02", posts: 0, impressions: 0, engagements: 0 },
			{ date: "2026-09-03", posts: 1, impressions: 200, engagements: 14 },
			{ date: "2026-09-04", posts: 0, impressions: 0, engagements: 0 },
			{ date: "2026-09-05", posts: 1, impressions: 300, engagements: 0 },
			{ date: "2026-09-06", posts: 1, impressions: 0, engagements: 20 },
			{ date: "2026-09-07", posts: 2, impressions: 0, engagements: 0 },
		]);
		expect(o.byChannel).toEqual([
			{
				channelId: a.id,
				provider: "linkedin",
				name: "Channel A",
				analyticsSupported: linkedinSupported(),
				posts: 5,
				impressions: 600,
				engagements: 21,
				followers: 1025,
				followersChange: 25,
			},
			{
				channelId: b.id,
				provider: "x",
				name: "Channel B",
				analyticsSupported: false, // x is not configured in the test env
				posts: 1,
				impressions: null,
				engagements: 20,
				followers: null,
				followersChange: null,
			},
		]);
		expect(o.topPosts.map((p: { targetId: string }) => p.targetId)).toEqual([
			t5.targetId,
			t3.targetId,
			t2.targetId,
		]);
		expect(o.topPosts[1]).toMatchObject({
			postId: t3.postId,
			channel: { id: a.id, provider: "linkedin", name: "Channel A" },
			excerpt: "x".repeat(140),
			publishedAt: "2026-09-03T15:00:00.000Z",
			impressions: 200,
			engagements: 14,
			engagementRate: 0.07,
		});
		expect(o.topPosts[1].externalUrl).toStartWith("https://platform.test/");
		expect(o.topPosts[2].excerpt).toBe("LinkedIn copy");
		expect(o.topPosts[0].engagementRate).toBeNull();
		expect(Date.parse(o.lastCollectedAt)).toBeGreaterThan(Date.now() - 3600_000);

		const onlyB = await client.request(
			"GET",
			`/analytics/overview?from=2026-09-01&to=2026-09-07&channelIds=${b.id}`,
		);
		expect(onlyB.json.totals).toMatchObject({ posts: 1, engagements: 20, impressions: null });
		expect(onlyB.json.byChannel.map((c: { channelId: string }) => c.channelId)).toEqual([b.id]);
	});

	test("an empty organization: nulls for metrics, zeros for counts, 28 days by default", async () => {
		const { client } = await newOrg("Asia/Tokyo");
		const res = await client.request("GET", "/analytics/overview");
		expect(res.status).toBe(200);
		const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
		expect(res.json.range.to).toBe(today);
		expect(res.json.daily).toHaveLength(28);
		expect(res.json.daily[0].date).toBe(res.json.range.from);
		expect(res.json.totals).toEqual({
			posts: 0,
			impressions: null,
			reach: null,
			engagements: null,
			likes: null,
			comments: null,
			shares: null,
			saves: null,
			clicks: null,
			videoViews: null,
			engagementRate: null,
		});
		expect(res.json).toMatchObject({ byChannel: [], topPosts: [], lastCollectedAt: null });
	});

	test("range validation", async () => {
		const { client } = await newOrg();
		const bad = async (query: string) => {
			const res = await client.request("GET", `/analytics/overview?${query}`);
			expect([query, res.status]).toEqual([query, 422]);
		};
		await bad("from=2026-09-10&to=2026-09-01");
		await bad("from=2025-01-01&to=2026-09-01");
		await bad("from=2026-02-30&to=2026-03-01");
		await bad("from=yesterday");
		await bad(`channelIds=not-a-uuid`);
		const ok = await client.request("GET", "/analytics/overview?from=2025-09-23&to=2026-09-23");
		expect(ok.status).toBe(200);
		expect(ok.json.daily).toHaveLength(366);
	});
});

describe("posts", () => {
	test("sort by publishedAt pages with a keyset cursor; metric sorts return the top N", async () => {
		const { client, orgId } = await newOrg();
		const ch = await createChannel(orgId);
		const [asset] = await db
			.insert(schema.mediaAssets)
			.values({
				organizationId: orgId,
				storageKey: `org/${orgId}/cover.png`,
				fileName: "cover.png",
				mimeType: "image/png",
				kind: "image",
				sizeBytes: 10,
				status: "ready",
			})
			.returning();

		const p1 = await published(orgId, ch.id, "2026-09-01T10:00:00Z", [
			{ impressions: 10, likes: 1 },
		]);
		// p2 and p3 share a publish time: the id breaks the tie, so a page boundary between them is exact.
		const p2 = await published(orgId, ch.id, "2026-09-02T10:00:00Z", [{ impressions: 500 }]);
		const p3 = await published(orgId, ch.id, "2026-09-02T10:00:00Z", [
			{ impressions: 5, likes: 9 },
			{ impressions: 30, likes: 40, comments: 2 },
		]);
		const p4 = await published(orgId, ch.id, "2026-09-03T10:00:00Z");
		const p5 = await published(orgId, ch.id, "2026-09-04T10:00:00Z", [
			{ impressions: 100, likes: 5 },
		]);
		await db
			.insert(schema.postMedia)
			.values({ postId: p5.postId, mediaId: asset?.id as string, position: 0 });

		const range = "from=2026-09-01&to=2026-09-30";
		const seen: string[] = [];
		let cursor: string | null = null;
		let pages = 0;
		do {
			const res = await client.request(
				"GET",
				`/analytics/posts?${range}&limit=2${cursor ? `&before=${cursor}` : ""}`,
			);
			expect(res.status).toBe(200);
			seen.push(...res.json.items.map((i: { targetId: string }) => i.targetId));
			cursor = res.json.nextCursor;
			pages++;
		} while (cursor && pages < 10);
		expect(pages).toBe(3);
		const tied = [p2.targetId, p3.targetId].sort().reverse();
		expect(seen).toEqual([p5.targetId, p4.targetId, ...tied, p1.targetId]);

		const first = await client.request("GET", `/analytics/posts?${range}&limit=1`);
		expect(first.json.items[0]).toEqual({
			targetId: p5.targetId,
			postId: p5.postId,
			channel: { id: ch.id, provider: "linkedin", name: ch.name },
			excerpt: "A post",
			thumbnailUrl: expect.stringContaining(`org/${orgId}/cover.png`),
			publishedAt: "2026-09-04T10:00:00.000Z",
			externalUrl: expect.any(String),
			metrics: {
				impressions: 100,
				reach: null,
				likes: 5,
				comments: null,
				shares: null,
				saves: null,
				clicks: null,
				videoViews: null,
				engagements: 5,
				engagementRate: 0.05,
			},
			collectedAt: expect.any(String),
		});

		const byEngagement = await client.request(
			"GET",
			`/analytics/posts?${range}&sort=engagements&limit=3`,
		);
		expect(byEngagement.json.items.map((i: { targetId: string }) => i.targetId)).toEqual([
			p3.targetId, // latest snapshot (42), not the first (9)
			p5.targetId,
			p1.targetId,
		]);
		expect(byEngagement.json.nextCursor).toBeNull();

		const byImpressions = await client.request("GET", `/analytics/posts?${range}&sort=impressions`);
		const ids = byImpressions.json.items.map((i: { targetId: string }) => i.targetId);
		expect(ids).toEqual([p2.targetId, p5.targetId, p3.targetId, p1.targetId, p4.targetId]);
		expect(byImpressions.json.items.at(-1)).toMatchObject({
			collectedAt: null,
			thumbnailUrl: null,
		});
		expect(byImpressions.json.items.at(-1).metrics.impressions).toBeNull();

		const garbage = await client.request("GET", `/analytics/posts?${range}&before=nonsense`);
		expect(garbage.status).toBe(400);
		expect((await client.request("GET", `/analytics/posts?limit=101`)).status).toBe(422);
	});
});

describe("post detail", () => {
	test("history oldest first (capped at 200), latest = newest, 404 for other orgs", async () => {
		const { client, orgId } = await newOrg();
		const ch = await createChannel(orgId);
		const snapshots = Array.from({ length: 205 }, (_, i) => ({ impressions: i, likes: i }));
		const t = await published(orgId, ch.id, "2026-09-01T10:00:00Z", snapshots);

		const res = await client.request("GET", `/analytics/posts/${t.postId}`);
		expect(res.status).toBe(200);
		expect(res.json.postId).toBe(t.postId);
		const [target] = res.json.targets;
		expect(target).toMatchObject({
			targetId: t.targetId,
			channel: { id: ch.id, provider: "linkedin", name: ch.name },
			publishedAt: "2026-09-01T10:00:00.000Z",
			latest: { impressions: 204, likes: 204, engagements: 204, engagementRate: 1, reach: null },
		});
		expect(target.history).toHaveLength(200);
		expect(target.history[0]).toMatchObject({ impressions: 5, likes: 5 });
		expect(target.history[199].impressions).toBe(204);
		expect(Date.parse(target.history[0].capturedAt)).toBeLessThan(
			Date.parse(target.history[1].capturedAt),
		);

		const noMetrics = await published(orgId, ch.id, "2026-09-02T10:00:00Z");
		const empty = await client.request("GET", `/analytics/posts/${noMetrics.postId}`);
		expect(empty.json.targets[0]).toMatchObject({ latest: null, history: [] });

		const { client: stranger } = await newOrg();
		expect((await stranger.request("GET", `/analytics/posts/${t.postId}`)).status).toBe(404);
		expect((await client.request("GET", `/analytics/posts/${crypto.randomUUID()}`)).status).toBe(
			404,
		);
	});
});

describe("channel", () => {
	test("every day of the range, nulls where nothing was collected; 404 for other orgs", async () => {
		const { client, orgId } = await newOrg();
		const ch = await createChannel(orgId);
		await db.insert(schema.channelMetricsDaily).values([
			{ channelId: ch.id, organizationId: orgId, day: "2026-09-01", followers: 10, reach: 5 },
			{
				channelId: ch.id,
				organizationId: orgId,
				day: "2026-09-03",
				followers: 12,
				impressions: 99,
				profileViews: 3,
			},
		]);
		const res = await client.request(
			"GET",
			`/analytics/channels/${ch.id}?from=2026-09-01&to=2026-09-03`,
		);
		expect(res.status).toBe(200);
		expect(res.json).toEqual({
			channel: {
				id: ch.id,
				provider: "linkedin",
				name: ch.name,
				analyticsSupported: linkedinSupported(),
			},
			days: [
				{ date: "2026-09-01", followers: 10, impressions: null, reach: 5, profileViews: null },
				{ date: "2026-09-02", followers: null, impressions: null, reach: null, profileViews: null },
				{ date: "2026-09-03", followers: 12, impressions: 99, reach: null, profileViews: 3 },
			],
		});

		const { client: stranger } = await newOrg();
		expect((await stranger.request("GET", `/analytics/channels/${ch.id}`)).status).toBe(404);
	});
});

describe("best times", () => {
	/** A recent instant on the given weekday (0 = Monday) and UTC hour. */
	const recent = (weekday: number, hour: number, weeksAgo = 1) => {
		const d = new Date(Date.now() - weeksAgo * 7 * DAY);
		d.setUTCHours(hour, 0, 0, 0);
		while ((d.getUTCDay() + 6) % 7 !== weekday) d.setTime(d.getTime() - DAY);
		return d;
	};

	test("too little history → platform defaults", async () => {
		const { client, orgId } = await newOrg();
		const ch = await createChannel(orgId);
		await published(orgId, ch.id, recent(1, 10), [{ likes: 3 }]);
		const res = await client.request("GET", "/analytics/best-times");
		expect(res.status).toBe(200);
		expect(res.json.source).toBe("defaults");
		expect(res.json.timezone).toBe("UTC");
		expect(res.json.cells).toHaveLength(168);
		expect(
			res.json.cells.find(
				(c: { weekday: number; hour: number }) => c.weekday === 1 && c.hour === 10,
			),
		).toEqual({
			weekday: 1,
			hour: 10,
			posts: 1,
			avgEngagements: 3,
		});
		expect(res.json.recommendations).toHaveLength(3);
		expect(res.json.recommendations[0].score).toBe(1);
		for (const r of res.json.recommendations) {
			expect(r.weekday).toBeLessThan(5); // weekdays
		}
	});

	test("enough history → averaged per weekday × hour in the org's timezone", async () => {
		const { client, orgId } = await newOrg("Asia/Kolkata"); // UTC+5:30
		const ch = await createChannel(orgId);
		// UTC Tue 04:30 = Tue 10:00 in Kolkata.
		for (let i = 0; i < 10; i++) {
			await published(orgId, ch.id, new Date(recent(1, 4, 1 + (i % 4)).getTime() + 30 * 60_000), [
				{ likes: 50 },
			]);
		}
		for (let i = 0; i < 10; i++) {
			await published(orgId, ch.id, new Date(recent(3, 9, 1 + (i % 4)).getTime() + 30 * 60_000), [
				{ likes: 10 },
			]);
		}
		// Only one post here: the best average, but not enough posts to recommend.
		await published(orgId, ch.id, new Date(recent(5, 2, 1).getTime() + 30 * 60_000), [
			{ likes: 999 },
		]);
		await published(orgId, ch.id, new Date(recent(6, 2, 1).getTime() + 30 * 60_000), [
			{ likes: 100 },
		]);
		await published(orgId, ch.id, new Date(recent(6, 2, 2).getTime() + 30 * 60_000), [
			{ likes: 200 },
		]);
		// Older than the window: ignored.
		await published(orgId, ch.id, recent(0, 0, 20), [{ likes: 100_000 }]);

		const res = await client.request("GET", "/analytics/best-times?weeks=12");
		expect(res.status).toBe(200);
		expect(res.json.source).toBe("data");
		expect(res.json.timezone).toBe("Asia/Kolkata");
		expect(res.json.recommendations).toEqual([
			{ weekday: 6, hour: 8, score: 1 },
			{ weekday: 1, hour: 10, score: 0.33 },
			{ weekday: 3, hour: 15, score: 0.07 },
		]);
		const cell = res.json.cells.find(
			(c: { weekday: number; hour: number }) => c.weekday === 1 && c.hour === 10,
		);
		expect(cell).toEqual({ weekday: 1, hour: 10, posts: 10, avgEngagements: 50 });
	});
});

describe("refresh", () => {
	test("202 with the number of jobs, then 429 with retryAfterSeconds; viewers read but cannot refresh", async () => {
		const { client, orgId } = await newOrg();
		const ch = await createChannel(orgId);
		const viewer = await addMember(client, orgId, "viewer");

		expect((await viewer.request("GET", "/analytics/overview")).status).toBe(200);
		expect((await viewer.request("GET", "/analytics/best-times")).status).toBe(200);
		expect((await viewer.request("POST", "/analytics/refresh")).status).toBe(403);

		const res = await client.request("POST", "/analytics/refresh");
		expect(res.status).toBe(202);
		const linkedin = providers.get("linkedin");
		const expected = linkedinSupported() ? (linkedin?.analytics?.getAccountMetrics ? 2 : 1) : 0;
		expect(res.json).toEqual({ queued: expected });
		if (expected > 0) {
			const jobs = await analyticsQueue.getJobs(["waiting"]);
			expect(jobs.some((j) => j.data.channelId === ch.id && j.data.force === true)).toBe(true);
		}

		const again = await client.request("POST", "/analytics/refresh");
		expect(again.status).toBe(429);
		expect(again.json.error.code).toBe("rate_limited");
		expect(again.json.error.details.retryAfterSeconds).toBeGreaterThan(0);
		expect(again.json.error.details.retryAfterSeconds).toBeLessThanOrEqual(600);

		// The limit is per organization.
		const other = await newOrg();
		expect((await other.client.request("POST", "/analytics/refresh")).status).toBe(202);
	});

	test("the OpenAPI document still builds with the analytics schemas", async () => {
		const { client } = await newOrg();
		const res = await client.request("GET", "/openapi.json");
		expect(res.status).toBe(200);
		expect(Object.keys(res.json.paths)).toContain("/analytics/overview");
	});
});
