import type { Logger } from "@socialfly/core/logger";
import { and, type Database, eq, isNotNull, schema, sql } from "@socialfly/db";
import {
	type AdsContext,
	type AdsProvider,
	type CampaignInsightsDay,
	isProviderError,
} from "@socialfly/integrations";
import type { AdsJob, JobProducer } from "@socialfly/queue";
import { type CallBudget, CallBudgetExhausted } from "#src/analytics/call-budget.ts";
import {
	AdAccountNeedsReauthError,
	AdAccountUnavailableError,
	type AdTokens,
} from "./ad-tokens.ts";
import type { AdCampaignState, CampaignRow } from "./campaign-state.ts";
import { type AdsProviders, configuredAdsProvider } from "./providers.ts";
import { reconcileStatus } from "./reconcile.ts";

const { adAccounts, adCampaigns, adCampaignMetricsDaily, organizations } = schema;

export type AdsSyncDeps = {
	db: Database;
	providers: AdsProviders;
	tokens: AdTokens;
	state: AdCampaignState;
	budget: CallBudget;
	jobs: JobProducer;
	logger: Logger;
};

/** Platforms revise the last days' spend late (attribution windows), so every run re-reads them. */
const INSIGHTS_LOOKBACK_DAYS = 3;
const LOOKBACK = sql.raw(`interval '${INSIGHTS_LOOKBACK_DAYS} days'`);
/** Campaign ids per insights call; every adapter accepts at least this many. */
const INSIGHTS_BATCH = 50;

type Skipped = { skipped: string };

/** Numbers → integer columns; anything that is not a finite number is "not reported". */
const toInt = (value: unknown) =>
	typeof value === "number" && Number.isFinite(value) && value >= 0
		? Math.min(Math.round(value), 2_147_483_647)
		: null;
const toMoney = (value: unknown) =>
	typeof value === "number" && Number.isFinite(value) && value >= 0
		? Math.round(value * 100) / 100
		: 0;

/** YYYY-MM-DD in the account's timezone (platforms report days there); UTC when unknown. */
export function dayIn(timeZone: string | null, ms: number) {
	try {
		return new Intl.DateTimeFormat("en-CA", {
			timeZone: timeZone ?? "UTC",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		}).format(new Date(ms));
	} catch {
		return new Date(ms).toISOString().slice(0, 10);
	}
}

const chunk = <T>(items: T[], size: number) => {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
};

/**
 * Keeps created campaigns in step with the platforms: their status (a user can pause or
 * delete a campaign in the ads manager, and platforms reject campaigns in review) and
 * their daily delivery and spend. Reads only — so like analytics a retry is always safe
 * and the rules that matter are the call budget (never starve the writes that start and
 * stop spend) and never inventing numbers.
 */
export class AdsSync {
	constructor(private readonly deps: AdsSyncDeps) {}

	async run(job: AdsJob) {
		switch (job.task) {
			case "sync-plan":
				return this.plan();
			case "sync-account":
				return this.syncAccount(job.adAccountId);
		}
	}

	/** Every 30 minutes: one sync job per active ad account that has created campaigns. */
	async plan() {
		const configured = this.deps.providers
			.all()
			.filter((p) => p.isConfigured())
			.map((p) => p.id as string);
		if (configured.length === 0) return { accounts: 0 };
		const rows = (await this.deps.db.execute(sql`
			select a.id from ad_accounts a
			join organizations o on o.id = a.organization_id
			where a.status = 'active' and o.deleted_at is null
				and a.provider in ${configured}
				and exists (
					select 1 from ad_campaigns c
					where c.ad_account_id = a.id and c.external_id is not null
						and (c.status in ('paused', 'active')
							or (c.status in ('completed', 'archived', 'failed')
								and c.updated_at > now() - ${LOOKBACK}))
				)
		`)) as unknown as { id: string }[];
		const now = Date.now();
		for (const row of rows) await this.deps.jobs.enqueueAdsSync(row.id, now);
		return { accounts: rows.length };
	}

	async syncAccount(adAccountId: string) {
		const [row] = await this.deps.db
			.select({ account: adAccounts, orgDeletedAt: organizations.deletedAt })
			.from(adAccounts)
			.innerJoin(organizations, eq(organizations.id, adAccounts.organizationId))
			.where(eq(adAccounts.id, adAccountId))
			.limit(1);
		// The planner checked these too, but a job can wait while the account is disconnected.
		if (!row || row.orgDeletedAt) return { skipped: "account_missing" };
		const account = row.account;
		if (account.status !== "active") return { skipped: `account_${account.status}` };
		const provider = configuredAdsProvider(this.deps.providers, account.provider);
		if (!provider) return { skipped: "unsupported" };
		const log = this.deps.logger.child({ adAccountId, provider: provider.id });

		// Live campaigns get a status read; recently finished ones only their last numbers.
		const rows = await this.deps.db
			.select()
			.from(adCampaigns)
			.where(
				and(
					eq(adCampaigns.adAccountId, adAccountId),
					isNotNull(adCampaigns.externalId),
					sql`(${adCampaigns.status} in ('paused', 'active') or (${adCampaigns.status} in ('completed', 'archived', 'failed') and ${adCampaigns.updatedAt} > now() - ${LOOKBACK}))`,
				),
			)
			.orderBy(adCampaigns.createdAt);
		if (rows.length === 0) return { statuses: 0, days: 0 };

		let statuses = 0;
		for (const campaign of rows.filter((c) => c.status === "paused" || c.status === "active")) {
			let platform: Awaited<ReturnType<AdsProvider["getCampaignStatus"]>>;
			try {
				platform = await this.call(adAccountId, provider, (ctx) =>
					provider.getCampaignStatus(ctx, campaign.externalId as string),
				);
			} catch (error) {
				const handled = this.handled(error, log);
				if (handled === "skip") continue;
				if (handled) return { statuses, days: 0, ...handled };
				throw error;
			}
			if (await reconcileStatus(this.deps.state, campaign, platform)) statuses++;
		}

		const days = await this.syncInsights(account, provider, rows, log);
		if (typeof days !== "number") return { statuses, days: 0, ...days };
		log.info({ campaigns: rows.length, statuses, days }, "ads synced");
		return { statuses, days };
	}

	private async syncInsights(
		account: typeof adAccounts.$inferSelect,
		provider: AdsProvider,
		campaigns: CampaignRow[],
		log: Logger,
	): Promise<number | Skipped> {
		const now = Date.now();
		const until = dayIn(account.timezone, now);
		const since = dayIn(account.timezone, now - INSIGHTS_LOOKBACK_DAYS * 86_400_000);
		const byExternalId = new Map(campaigns.map((c) => [c.externalId as string, c]));
		let written = 0;
		for (const batch of chunk([...byExternalId.keys()], INSIGHTS_BATCH)) {
			let insights: CampaignInsightsDay[];
			try {
				insights = await this.call(account.id, provider, (ctx) =>
					provider.getInsights(ctx, { campaignExternalIds: batch, since, until }),
				);
			} catch (error) {
				const handled = this.handled(error, log);
				if (handled === "skip") continue;
				if (handled) return handled;
				throw error;
			}
			// One row per (campaign, day) — an upsert touching a row twice is refused — and
			// only days inside the requested range for campaigns we asked about.
			const rows = new Map<string, typeof adCampaignMetricsDaily.$inferInsert>();
			for (const d of insights) {
				const campaign = byExternalId.get(d.campaignExternalId);
				if (!campaign || !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || d.date < since || d.date > until)
					continue;
				rows.set(`${campaign.id}:${d.date}`, {
					campaignId: campaign.id,
					organizationId: campaign.organizationId,
					day: d.date,
					spend: toMoney(d.spend),
					impressions: toInt(d.impressions),
					reach: toInt(d.reach),
					clicks: toInt(d.clicks),
					conversions: toInt(d.conversions),
					videoViews: toInt(d.videoViews),
				});
			}
			if (rows.size === 0) continue;
			// Spend is always reported (it is what the platform bills); a metric missing from
			// this answer keeps the value an earlier run stored.
			await this.deps.db
				.insert(adCampaignMetricsDaily)
				.values([...rows.values()])
				.onConflictDoUpdate({
					target: [adCampaignMetricsDaily.campaignId, adCampaignMetricsDaily.day],
					set: {
						spend: sql.raw("excluded.spend"),
						impressions: sql.raw(
							"coalesce(excluded.impressions, ad_campaign_metrics_daily.impressions)",
						),
						reach: sql.raw("coalesce(excluded.reach, ad_campaign_metrics_daily.reach)"),
						clicks: sql.raw("coalesce(excluded.clicks, ad_campaign_metrics_daily.clicks)"),
						conversions: sql.raw(
							"coalesce(excluded.conversions, ad_campaign_metrics_daily.conversions)",
						),
						videoViews: sql.raw(
							"coalesce(excluded.video_views, ad_campaign_metrics_daily.video_views)",
						),
						updatedAt: sql`now()`,
					},
				});
			written += rows.size;
		}
		return written;
	}

	/**
	 * One platform read: spends from the provider's ads budget first, and a 401/403 gets
	 * one token refresh (through AdTokens, the locked path the writes use) and one resend.
	 */
	private async call<T>(
		adAccountId: string,
		provider: AdsProvider,
		fn: (ctx: AdsContext) => Promise<T>,
	): Promise<T> {
		let refreshed = false;
		for (;;) {
			const waitMs = await this.deps.budget.take(provider.id);
			if (waitMs > 0) throw new CallBudgetExhausted(provider.id, waitMs);
			try {
				return await fn(await this.deps.tokens.context(adAccountId, { forceRefresh: refreshed }));
			} catch (error) {
				if (!refreshed && isProviderError(error) && error.kind === "auth") {
					refreshed = true;
					continue;
				}
				throw error;
			}
		}
	}

	/**
	 * Failures that end this run quietly. Rate limits and outages propagate so BullMQ
	 * retries the job with backoff (safe: reads, and the upsert makes a re-read harmless).
	 */
	private handled(error: unknown, log: Logger): Skipped | "skip" | null {
		if (error instanceof AdAccountNeedsReauthError) return { skipped: "needs_reauth" };
		if (error instanceof AdAccountUnavailableError) return { skipped: "account_unavailable" };
		if (!isProviderError(error)) return null;
		if (error.kind === "auth") {
			// Still refused after a refresh: usually a missing read permission. The account
			// is not flagged (the writes may still work); the next run tries again.
			log.warn({ err: error }, "ads read refused after token refresh");
			return { skipped: "auth" };
		}
		if (error.kind === "invalid_request") {
			log.warn({ err: error }, "platform rejected the ads read");
			return "skip";
		}
		return null;
	}
}
