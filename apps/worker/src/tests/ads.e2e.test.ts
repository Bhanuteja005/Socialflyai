import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { createLogger } from "@socialfly/core/logger";
import { normalizeEmail } from "@socialfly/core/security";
import { eq, schema, sql } from "@socialfly/db";
import { ProviderError } from "@socialfly/integrations";
import { adsWriteQueueName, jobIds, QUEUE_PREFIX, QUEUES } from "@socialfly/queue";
import { Queue } from "bullmq";
import { AdTokens } from "#src/ads/ad-tokens.ts";
import { AdsSync } from "#src/ads/ads-sync.ts";
import { AdsWriter } from "#src/ads/ads-writer.ts";
import { AdCampaignState } from "#src/ads/campaign-state.ts";
import { AdsProviderList } from "#src/ads/providers.ts";
import { CallBudgetExhausted } from "#src/analytics/call-budget.ts";
import { db, jobs, queueConnection, tokenCipher } from "#src/infrastructure/index.ts";
import { Maintenance } from "#src/maintenance/maintenance.ts";
import { TargetState } from "#src/publishing/target-state.ts";
import { FakeAdsProvider } from "./fake-ads-provider.ts";

const logger = createLogger({ service: "worker-test", level: "fatal" });
const writeQueue = new Queue(adsWriteQueueName("meta_ads"), {
	connection: queueConnection,
	prefix: QUEUE_PREFIX,
});
const adsQueue = new Queue(QUEUES.ads, { connection: queueConnection, prefix: QUEUE_PREFIX });

const HOUR = 3600_000;
const { adCampaigns, adAccounts, adCampaignMetricsDaily } = schema;

let fake: FakeAdsProvider;
let writer: AdsWriter;
let sync: AdsSync;
let state: AdCampaignState;
let budgetLeft = Number.POSITIVE_INFINITY;
const serverCeiling = 500;

beforeEach(async () => {
	fake = new FakeAdsProvider();
	budgetLeft = Number.POSITIVE_INFINITY;
	const providers = new AdsProviderList([fake]);
	const tokens = new AdTokens(db, providers, tokenCipher, logger);
	state = new AdCampaignState(db);
	writer = new AdsWriter({
		db,
		providers,
		tokens,
		state,
		jobs,
		logger,
		publicMediaUrl: "https://cdn.example/media/",
		serverDailyCeiling: serverCeiling,
	});
	sync = new AdsSync({
		db,
		providers,
		tokens,
		state,
		budget: {
			take: async () => {
				if (budgetLeft <= 0) return 30_000;
				budgetLeft--;
				return 0;
			},
		},
		jobs,
		logger,
	});
	await Promise.all([writeQueue.obliterate({ force: true }), adsQueue.obliterate({ force: true })]);
});

afterAll(async () => {
	await Promise.all([writeQueue.obliterate({ force: true }), adsQueue.obliterate({ force: true })]);
	await Promise.all([writeQueue.close(), adsQueue.close()]);
});

async function newAccount(opts: { expiring?: boolean; orgCeiling?: number } = {}) {
	const email = `a-${crypto.randomUUID()}@example.test`;
	const [user] = await db
		.insert(schema.users)
		.values({ email, emailNormalized: normalizeEmail(email) })
		.returning();
	const [org] = await db
		.insert(schema.organizations)
		.values({
			name: "Acme",
			slug: `org-${crypto.randomUUID()}`,
			createdBy: user?.id,
			adsMaxDailyBudget: opts.orgCeiling ?? null,
		})
		.returning();
	const [account] = await db
		.insert(adAccounts)
		.values({
			organizationId: org?.id as string,
			provider: "meta_ads",
			externalId: `act_${crypto.randomUUID()}`,
			name: "Acme Ads",
			currency: "EUR",
			timezone: "Europe/Dublin",
			accessTokenEnc: tokenCipher.encrypt("original-token"),
			refreshTokenEnc: opts.expiring ? tokenCipher.encrypt("original-refresh") : null,
			tokenExpiresAt: opts.expiring ? new Date(Date.now() + 60_000) : null,
			metadata: { pageId: "123" },
		})
		.returning();
	const [media] = await db
		.insert(schema.mediaAssets)
		.values({
			organizationId: org?.id as string,
			storageKey: `org/${crypto.randomUUID()}.png`,
			fileName: "ad.png",
			mimeType: "image/png",
			kind: "image",
			sizeBytes: 1000,
			width: 1080,
			height: 1080,
			status: "ready",
		})
		.returning();
	return {
		orgId: org?.id as string,
		userId: user?.id as string,
		accountId: account?.id as string,
		mediaId: media?.id as string,
	};
}

async function campaign(
	a: Awaited<ReturnType<typeof newAccount>>,
	over: Partial<typeof adCampaigns.$inferInsert> = {},
) {
	const [row] = await db
		.insert(adCampaigns)
		.values({
			organizationId: a.orgId,
			adAccountId: a.accountId,
			provider: "meta_ads",
			name: "Autumn roast",
			objective: "traffic",
			status: "approved",
			version: 1,
			draft: {
				targeting: { countries: ["IE"] },
				ads: [
					{
						name: "Ad 1",
						format: "image",
						primaryText: "Fresh beans",
						destinationUrl: "https://acme.example",
						mediaIds: [a.mediaId],
					},
				],
			},
			dailyBudget: 20,
			currency: "EUR",
			startAt: new Date(Date.now() + HOUR),
			createdBy: a.userId,
			...over,
		})
		.returning();
	return row as typeof adCampaigns.$inferSelect;
}

const reload = async (id: string) => {
	const [row] = await db.select().from(adCampaigns).where(eq(adCampaigns.id, id));
	return row as typeof adCampaigns.$inferSelect;
};

const job = (
	c: { id: string; organizationId: string },
	version: number,
	action: "create" | "activate" | "pause" | "archive",
) => ({ campaignId: c.id, organizationId: c.organizationId, version, action }) as const;

describe("create", () => {
	test("creates the campaign PAUSED from current state; nothing is ever set active", async () => {
		const a = await newAccount();
		const c = await campaign(a);
		await writer.run(job(c, 1, "create"));

		expect(fake.created).toHaveLength(1);
		const sent = fake.created[0];
		expect(sent?.token).toBe("original-token");
		expect(sent?.draft).toMatchObject({
			name: "Autumn roast",
			objective: "traffic",
			dailyBudget: 20,
			endAt: null,
			targeting: { countries: ["IE"] },
		});
		expect(sent?.draft.ads[0]?.media[0]?.url).toMatch(/^https:\/\/cdn\.example\/media\/org\//);
		expect(fake.statusCalls).toEqual([]);

		const row = await reload(c.id);
		expect(row.status).toBe("paused");
		expect(row.externalId).toBe("cmp-1");
		expect(row.manageUrl).toBe("https://ads.example/manage/cmp-1");
		expect(row.externalObjects.map((o) => o.externalId)).toEqual([
			"cmp-1",
			"cmp-1-set",
			"cmp-1-ad",
		]);
		expect(row.version).toBe(2);

		// A duplicate or stale job is a no-op.
		await writer.run(job(c, 1, "create"));
		expect(fake.created).toHaveLength(1);
	});

	test("stale version: a job older than the campaign's version never calls the platform", async () => {
		const a = await newAccount();
		const c = await campaign(a, { version: 3 });
		await writer.run(job(c, 2, "create"));
		expect(fake.created).toHaveLength(0);
		expect((await reload(c.id)).status).toBe("approved");
	});

	test("unknown_outcome → unconfirmed, never re-enqueued", async () => {
		const a = await newAccount();
		const c = await campaign(a);
		fake.createErrors.push(new ProviderError("unknown_outcome", "meta_ads", "Timed out"));
		await writer.run(job(c, 1, "create"));

		const row = await reload(c.id);
		expect(row.status).toBe("unconfirmed");
		expect(row.errorCode).toBe("outcome_unknown");
		expect(row.errorMessage).toContain("ads manager");
		expect(await writeQueue.getJobCounts()).toMatchObject({ waiting: 0, delayed: 0 });
		expect(fake.created).toHaveLength(1);
	});

	test("invalid_request → failed with the platform's message and the orphaned ids", async () => {
		const a = await newAccount();
		const c = await campaign(a);
		fake.createErrors.push(
			new ProviderError("invalid_request", "meta_ads", "Ad creative rejected", {
				platformCode: "1487",
				orphanedExternalIds: ["adset-9"],
			}),
		);
		await writer.run(job(c, 1, "create"));

		const row = await reload(c.id);
		expect(row.status).toBe("failed");
		expect(row.errorCode).toBe("1487");
		expect(row.errorMessage).toContain("Ad creative rejected");
		expect(row.errorMessage).toContain("adset-9");
		expect(row.externalObjects).toEqual([{ type: "orphan", externalId: "adset-9" }]);
		expect(row.externalId).toBeNull();
	});

	test("provider.validate problems fail it before anything is sent", async () => {
		const a = await newAccount();
		const c = await campaign(a);
		fake.problems = ["Budget below the minimum"];
		await writer.run(job(c, 1, "create"));
		expect(fake.created).toHaveLength(0);
		const row = await reload(c.id);
		expect(row.status).toBe("failed");
		expect(row.errorCode).toBe("invalid_campaign");
	});

	test("media no longer ready → failed without a call", async () => {
		const a = await newAccount();
		const c = await campaign(a);
		await db
			.update(schema.mediaAssets)
			.set({ status: "failed" })
			.where(eq(schema.mediaAssets.id, a.mediaId));
		await writer.run(job(c, 1, "create"));
		expect(fake.created).toHaveLength(0);
		expect((await reload(c.id)).errorCode).toBe("media_missing");
	});

	test("transient before creating → back to approved with a delayed job under the new version", async () => {
		const a = await newAccount();
		const c = await campaign(a);
		fake.createErrors.push(new ProviderError("transient", "meta_ads", "503 on upload"));
		await writer.run(job(c, 1, "create"));

		const row = await reload(c.id);
		expect(row.status).toBe("approved");
		expect(row.errorCode).toBe("retrying");
		expect(row.version).toBe(2);
		const next = await writeQueue.getJob(jobIds.adsWrite(c.id, 2));
		expect(next?.data).toMatchObject({ action: "create", version: 2, attempt: 2 });
		expect(await next?.getState()).toBe("delayed");

		// The requeued job creates it.
		await writer.run({ ...job(c, 2, "create"), attempt: 2 });
		expect((await reload(c.id)).status).toBe("paused");
	});

	test("expiring token is refreshed first; a 401 gets one refresh and a resend", async () => {
		const a = await newAccount({ expiring: true });
		const c = await campaign(a);
		fake.createErrors.push(new ProviderError("auth", "meta_ads", "Token expired"));
		await writer.run(job(c, 1, "create"));

		expect(fake.refreshCalls).toBe(2);
		expect(fake.created.map((x) => x.token)).toEqual(["refreshed-1", "refreshed-2"]);
		expect((await reload(c.id)).status).toBe("paused");
		const [account] = await db.select().from(adAccounts).where(eq(adAccounts.id, a.accountId));
		expect(tokenCipher.decrypt(account?.accessTokenEnc as string)).toBe("refreshed-2");
		expect(tokenCipher.decrypt(account?.refreshTokenEnc as string)).toBe("refresh-2");
	});

	test("refresh refused → account needs_reauth, campaign failed", async () => {
		const a = await newAccount({ expiring: true });
		const c = await campaign(a);
		fake.refreshTokens = async () => {
			throw new ProviderError("auth", "meta_ads", "revoked");
		};
		await writer.run(job(c, 1, "create"));
		expect(fake.created).toHaveLength(0);
		expect((await reload(c.id)).errorCode).toBe("ad_account_unavailable");
		const [account] = await db.select().from(adAccounts).where(eq(adAccounts.id, a.accountId));
		expect(account?.status).toBe("needs_reauth");
	});
});

describe("activate / pause / archive", () => {
	async function created(over: Partial<typeof adCampaigns.$inferInsert> = {}) {
		const a = await newAccount(over.dailyBudget ? { orgCeiling: 100 } : {});
		const c = await campaign(a, over);
		await writer.run(job(c, 1, "create"));
		return { a, c: await reload(c.id) };
	}

	/** What the API does for a request: bump the version, then enqueue under it. */
	async function request(id: string) {
		const [row] = await db
			.update(adCampaigns)
			.set({ version: sql`${adCampaigns.version} + 1` })
			.where(eq(adCampaigns.id, id))
			.returning();
		return row as typeof adCampaigns.$inferSelect;
	}

	test("activate → active; pause → paused; archive → archived", async () => {
		const { c } = await created();
		let row = await request(c.id);
		await writer.run(job(row, row.version, "activate"));
		expect(fake.statusCalls).toEqual([{ id: "cmp-1", status: "active" }]);
		expect((await reload(c.id)).status).toBe("active");

		row = await request(c.id);
		await writer.run(job(row, row.version, "pause"));
		expect((await reload(c.id)).status).toBe("paused");

		row = await request(c.id);
		await writer.run(job(row, row.version, "archive"));
		const archived = await reload(c.id);
		expect(archived.status).toBe("archived");
		expect(archived.platformStatus).toBe("archived");
		expect(fake.statusCalls.map((s) => s.status)).toEqual(["active", "paused", "archive"]);
	});

	test("a stale activation (the user asked for something newer) never calls the platform", async () => {
		const { c } = await created();
		const row = await request(c.id);
		await request(c.id);
		await writer.run(job(row, row.version, "activate"));
		expect(fake.statusCalls).toEqual([]);
		expect((await reload(c.id)).status).toBe("paused");
	});

	test("activation above the (lowered) daily ceiling is refused without a call", async () => {
		const { c } = await created({ dailyBudget: 150 });
		const row = await request(c.id);
		await db
			.update(adCampaigns)
			.set({ activatedBy: c.createdBy, activatedAt: new Date() })
			.where(eq(adCampaigns.id, c.id));
		await writer.run(job(row, row.version, "activate"));
		expect(fake.statusCalls).toEqual([]);
		const after = await reload(c.id);
		expect(after.status).toBe("paused");
		expect(after.errorCode).toBe("budget_over_ceiling");
		expect(after.activatedBy).toBeNull();
	});

	test("unknown outcome → status kept + status_unconfirmed, then reconciled by a status read", async () => {
		const { c } = await created();
		const row = await request(c.id);
		// The call did go through on the platform side:
		fake.setStatus = async (_ctx, id, status) => {
			fake.statusCalls.push({ id, status });
			fake.platformStatus.set(id, status);
			throw new ProviderError("unknown_outcome", "meta_ads", "Connection reset");
		};
		await writer.run(job(row, row.version, "activate"));
		const after = await reload(c.id);
		expect(fake.statusCalls).toHaveLength(1);
		expect(after.status).toBe("active");
		expect(after.errorCode).toBeNull();
		expect(await writeQueue.getJobCounts()).toMatchObject({ waiting: 0, delayed: 0 });
	});

	test("unknown outcome with a failing read keeps the flag and the old status", async () => {
		const { c } = await created();
		const row = await request(c.id);
		fake.statusErrors.push(new ProviderError("unknown_outcome", "meta_ads", "Timeout"));
		fake.readErrors.push(new ProviderError("transient", "meta_ads", "503"));
		await writer.run(job(row, row.version, "activate"));
		const after = await reload(c.id);
		expect(after.status).toBe("paused");
		expect(after.errorCode).toBe("status_unconfirmed");
	});

	test("invalid_request on pause keeps it active and explains", async () => {
		const { c } = await created();
		let row = await request(c.id);
		await writer.run(job(row, row.version, "activate"));
		row = await request(c.id);
		fake.statusErrors.push(new ProviderError("invalid_request", "meta_ads", "Campaign locked"));
		await writer.run(job(row, row.version, "pause"));
		const after = await reload(c.id);
		expect(after.status).toBe("active");
		expect(after.errorCode).toBe("pause_failed");
		expect(after.errorMessage).toBe("Campaign locked");
	});
});

describe("sync", () => {
	test("plan enqueues active accounts with created campaigns", async () => {
		const a = await newAccount();
		await campaign(a, { status: "paused", externalId: "cmp-x" });
		const idle = await newAccount();
		await campaign(idle, { status: "draft" });
		await sync.plan();
		const waiting = await adsQueue.getJobs(["waiting"]);
		const ids = waiting.map((j) => j.data.adAccountId);
		expect(ids).toContain(a.accountId);
		expect(ids).not.toContain(idle.accountId);
	});

	test("reconciles statuses and upserts daily metrics", async () => {
		const a = await newAccount();
		const paused = await campaign(a, { status: "paused", externalId: "cmp-a" });
		const active = await campaign(a, { status: "active", externalId: "cmp-b" });
		const rejected = await campaign(a, { status: "paused", externalId: "cmp-c" });
		const ended = await campaign(a, {
			status: "active",
			externalId: "cmp-d",
			startAt: new Date(Date.now() - 10 * 24 * HOUR),
			endAt: new Date(Date.now() - HOUR),
		});
		fake.platformStatus.set("cmp-a", "active"); // resumed in the ads manager
		fake.platformStatus.set("cmp-b", "in_review");
		fake.platformStatus.set("cmp-c", "rejected");
		fake.platformStatus.set("cmp-d", "active");
		const today = new Date().toISOString().slice(0, 10);
		const yesterday = new Date(Date.now() - 24 * HOUR).toISOString().slice(0, 10);
		fake.insights = [
			{
				campaignExternalId: "cmp-a",
				date: yesterday,
				spend: 12.345,
				impressions: 1000,
				clicks: 20,
			},
			{ campaignExternalId: "cmp-a", date: today, spend: 3, impressions: 100 },
			{ campaignExternalId: "cmp-b", date: today, spend: 5 },
			{ campaignExternalId: "cmp-a", date: "2001-01-01", spend: 99 }, // outside the range
			{ campaignExternalId: "someone-else", date: today, spend: 99 },
		];

		const result = await sync.syncAccount(a.accountId);
		expect(result).toMatchObject({ days: 3 });
		expect((await reload(paused.id)).status).toBe("active");
		const b = await reload(active.id);
		expect(b.status).toBe("active");
		expect(b.platformStatus).toBe("in_review");
		const c = await reload(rejected.id);
		expect(c.status).toBe("failed");
		expect(c.errorCode).toBe("rejected_by_platform");
		expect((await reload(ended.id)).status).toBe("completed");

		const metrics = await db
			.select()
			.from(adCampaignMetricsDaily)
			.where(eq(adCampaignMetricsDaily.campaignId, paused.id));
		const y = metrics.find((m) => m.day === yesterday);
		expect(y).toMatchObject({ spend: 12.35, impressions: 1000, clicks: 20 });

		// A re-read revises spend; a metric not reported this time keeps its stored value.
		fake.platformStatus.set("cmp-a", "active");
		fake.insights = [{ campaignExternalId: "cmp-a", date: yesterday, spend: 14 }];
		await sync.syncAccount(a.accountId);
		const [again] = await db
			.select()
			.from(adCampaignMetricsDaily)
			.where(
				sql`${adCampaignMetricsDaily.campaignId} = ${paused.id} and ${adCampaignMetricsDaily.day} = ${yesterday}`,
			);
		expect(again).toMatchObject({ spend: 14, impressions: 1000, clicks: 20 });
	});

	test("a status read never overwrites a request made meanwhile", async () => {
		const a = await newAccount();
		const c = await campaign(a, { status: "paused", externalId: "cmp-a", version: 4 });
		fake.platformStatus.set("cmp-a", "active");
		const stale = { ...c, version: 3 };
		const { reconcileStatus } = await import("#src/ads/reconcile.ts");
		expect(await reconcileStatus(state, stale, "active")).toBe(false);
		expect((await reload(c.id)).status).toBe("paused");
	});

	test("spent budget throws so the job is delayed; accounts needing reauth are skipped", async () => {
		const a = await newAccount();
		await campaign(a, { status: "paused", externalId: "cmp-a" });
		budgetLeft = 0;
		const error = await sync.syncAccount(a.accountId).catch((e) => e);
		expect(error).toBeInstanceOf(CallBudgetExhausted);
		await db
			.update(adAccounts)
			.set({ status: "needs_reauth" })
			.where(eq(adAccounts.id, a.accountId));
		expect(await sync.syncAccount(a.accountId)).toEqual({ skipped: "account_needs_reauth" });
	});
});

describe("maintenance", () => {
	test("creating for 15 minutes → unconfirmed; approved without a job → re-enqueued", async () => {
		const a = await newAccount();
		const stuck = await campaign(a, { status: "creating" });
		await db.execute(
			sql`update ad_campaigns set updated_at = now() - interval '16 minutes' where id = ${stuck.id}`,
		);
		const orphan = await campaign(a, { status: "approved", version: 5 });
		await db.execute(
			sql`update ad_campaigns set updated_at = now() - interval '3 minutes' where id = ${orphan.id}`,
		);
		const maintenance = new Maintenance(
			db,
			jobs,
			new TargetState(db),
			logger,
			undefined,
			new AdCampaignState(db),
		);
		const recovered = await maintenance.recoverStuckAdCampaigns();
		expect(recovered.recovered).toBeGreaterThanOrEqual(1);
		const row = await reload(stuck.id);
		expect(row.status).toBe("unconfirmed");
		expect(row.errorCode).toBe("outcome_unknown");

		const swept = await maintenance.sweepApprovedCampaigns();
		expect(swept.recovered).toBeGreaterThanOrEqual(1);
		const queued = await writeQueue.getJob(jobIds.adsWrite(orphan.id, 5));
		expect(queued?.data).toMatchObject({ action: "create", version: 5 });
		// A second sweep finds the live job and adds nothing for it.
		await maintenance.sweepApprovedCampaigns();
		expect(
			(await writeQueue.getJobs(["waiting"])).filter((j) => j.data.campaignId === orphan.id),
		).toHaveLength(1);
	});
});
