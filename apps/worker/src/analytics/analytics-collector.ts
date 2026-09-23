import type { Logger } from "@socialfly/core/logger";
import { getMeter } from "@socialfly/core/telemetry";
import { type Database, eq, type SQL, schema, sql } from "@socialfly/db";
import {
	type AccountMetricsDay,
	type AnalyticsSupport,
	type ChannelContext,
	isProviderError,
	type PostMetrics,
	type ProviderRegistry,
	type SocialProvider,
} from "@socialfly/integrations";
import type { AnalyticsJob, JobProducer } from "@socialfly/queue";
import { ChannelNeedsReauthError, type ChannelTokens } from "#src/channels/channel-tokens.ts";
import { type CallBudget, CallBudgetExhausted } from "./call-budget.ts";

const { channels, organizations, postTargetMetrics, channelMetricsDaily } = schema;

export type CollectorDeps = {
	db: Database;
	providers: ProviderRegistry;
	tokens: ChannelTokens;
	budget: CallBudget;
	jobs: JobProducer;
	logger: Logger;
};

type ChannelRow = {
	id: string;
	organizationId: string;
	provider: string;
	externalId: string;
	metadata: Record<string, unknown>;
};
type DueTarget = { id: string; externalId: string };
type Skipped = { skipped: string };

/** Posts older than this keep their last numbers; engagement has flattened by then. */
const COLLECTION_WINDOW = sql.raw(`interval '30 days'`);
/** A user refresh skips posts collected this recently: they would come back unchanged. */
const FORCE_MIN_AGE = sql.raw(`interval '10 minutes'`);
/** Max targets per collect job; a channel with more is finished by the next planner run. */
const MAX_TARGETS_PER_JOB = 500;
/** Account numbers are daily; re-collect a channel once a day at most. */
const ACCOUNT_REFRESH = sql.raw(`interval '20 hours'`);
/** Platforms revise the last days' numbers late, so every run re-reads this many days. */
const ACCOUNT_LOOKBACK_DAYS = 2;

const METRIC_KEYS = [
	"impressions",
	"reach",
	"likes",
	"comments",
	"shares",
	"saves",
	"clicks",
	"videoViews",
] as const satisfies readonly (keyof PostMetrics)[];

const meter = getMeter("analytics");
const snapshots = meter.createCounter("socialfly.analytics.snapshots", {
	description: "Metric rows written by the analytics collector, by provider and kind",
});

/**
 * Is target `t` due for a metrics snapshot? Recency by age of the post: numbers move
 * fast in the first two days and barely at all after a week, so collecting everything
 * hourly would spend platform budget on numbers that do not change.
 *
 *   published < 48 h ago → hourly;  < 7 days → every 6 h;  < 30 days → daily;  older → never
 *
 * Each interval is shortened by 5 minutes: the planner runs every 15 minutes, and a
 * collection that finished a few seconds "late" must not push the next one a whole
 * planner cycle back.
 *
 * Raw SQL with explicit aliases on purpose: drizzle leaves columns unqualified in
 * single-table queries, so a correlated `${postTargetMetrics.targetId} = ${postTargets.id}`
 * would silently compare the metrics table's columns with themselves.
 */
const dueCondition = (force: boolean): SQL => {
	const recent = force
		? FORCE_MIN_AGE
		: sql.raw(`(case
				when t.published_at > now() - interval '48 hours' then interval '1 hour'
				when t.published_at > now() - interval '7 days' then interval '6 hours'
				else interval '24 hours'
			end) - interval '5 minutes'`);
	return sql`t.status = 'published'
		and t.external_id is not null
		and t.published_at > now() - ${COLLECTION_WINDOW}
		and not exists (
			select 1 from post_target_metrics m
			where m.target_id = t.id and m.captured_at > now() - ${recent}
		)`;
};

/** Platform numbers → integer columns; anything that is not a finite number is "not reported". */
const toInt = (value: unknown) =>
	typeof value === "number" && Number.isFinite(value) && value >= 0
		? Math.min(Math.round(value), 2_147_483_647)
		: null;

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const chunk = <T>(items: T[], size: number) => {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
};

/**
 * Reads engagement numbers from the platforms into post_target_metrics and
 * channel_metrics_daily. Read-only towards the platforms, so unlike publishing a
 * retry is always safe; the rules that matter here are about BUDGET (never starve
 * publishing of the platform's rate limit) and about never inventing numbers (a
 * metric the platform did not report stays null).
 */
export class AnalyticsCollector {
	constructor(private readonly deps: CollectorDeps) {}

	async run(job: AnalyticsJob) {
		switch (job.task) {
			case "plan":
				return this.plan();
			case "collect-posts":
				return this.collectPosts(job.channelId, { force: job.force ?? false });
			case "collect-account":
				return this.collectAccount(job.channelId);
		}
	}

	/** Providers configured here AND able to report analytics; the rest are skipped. */
	private supported() {
		return this.deps.providers.available().filter((p) => p.analytics);
	}

	/**
	 * Every 15 minutes: one collect job per channel that has something due. The
	 * bucketed job ids make this safe to run on every replica and at any cadence.
	 */
	async plan() {
		const supported = this.supported();
		if (supported.length === 0) return { posts: 0, accounts: 0 };
		const withAccount = new Set(
			supported.filter((p) => p.analytics?.getAccountMetrics).map((p) => p.id as string),
		);

		const rows = (await this.deps.db.execute(sql`
			select c.id, c.provider,
				exists (
					select 1 from post_targets t where t.channel_id = c.id and ${dueCondition(false)}
				) as posts_due,
				not exists (
					select 1 from channel_metrics_daily d
					where d.channel_id = c.id and d.updated_at > now() - ${ACCOUNT_REFRESH}
				) as account_due
			from channels c
			join organizations o on o.id = c.organization_id
			where c.status = 'active'
				and o.deleted_at is null
				and c.provider in ${supported.map((p) => p.id as string)}
		`)) as unknown as { id: string; provider: string; posts_due: boolean; account_due: boolean }[];

		let posts = 0;
		let accounts = 0;
		const now = Date.now();
		for (const row of rows) {
			if (row.posts_due) {
				await this.deps.jobs.enqueueAnalyticsPosts(row.id, now);
				posts++;
			}
			if (row.account_due && withAccount.has(row.provider)) {
				await this.deps.jobs.enqueueAnalyticsAccount(row.id, now);
				accounts++;
			}
		}
		return { posts, accounts };
	}

	/** Targets of one channel whose snapshot is due, newest first. */
	async dueTargets(channelId: string, force = false): Promise<DueTarget[]> {
		return (await this.deps.db.execute(sql`
			select t.id, t.external_id as "externalId"
			from post_targets t
			where t.channel_id = ${channelId} and ${dueCondition(force)}
			order by t.published_at desc
			limit ${MAX_TARGETS_PER_JOB}
		`)) as unknown as DueTarget[];
	}

	async collectPosts(channelId: string, opts: { force: boolean }) {
		const loaded = await this.loadChannel(channelId);
		if ("skipped" in loaded) return loaded;
		const { channel, provider, analytics } = loaded;
		const log = this.deps.logger.child({ channelId, provider: provider.id });

		const due = await this.dueTargets(channelId, opts.force);
		let collected = 0;
		let missing = 0;
		for (const batch of chunk(due, Math.max(1, analytics.maxPostsPerCall))) {
			let metrics: Record<string, PostMetrics>;
			try {
				metrics = await this.call(channel, provider, (ctx) =>
					analytics.getPostMetrics(
						ctx,
						batch.map((t) => t.externalId),
					),
				);
			} catch (error) {
				const handled = this.handled(error, log);
				if (handled === "skip_batch") continue;
				if (handled) return { collected, missing, ...handled };
				throw error;
			}

			// A post the platform no longer returns was deleted there: no row, so its
			// last known numbers stay the latest instead of being overwritten by zeros.
			const rows = batch.flatMap((t) => {
				const m = metrics[t.externalId];
				if (!m) return [];
				return [
					{
						organizationId: channel.organizationId,
						targetId: t.id,
						...Object.fromEntries(METRIC_KEYS.map((k) => [k, toInt(m[k])])),
					},
				];
			});
			missing += batch.length - rows.length;
			if (rows.length > 0) {
				await this.deps.db.insert(postTargetMetrics).values(rows);
				snapshots.add(rows.length, { provider: provider.id, kind: "post" });
				collected += rows.length;
			}
		}
		if (due.length > 0) log.info({ due: due.length, collected, missing }, "post metrics collected");
		return { collected, missing };
	}

	async collectAccount(channelId: string) {
		const loaded = await this.loadChannel(channelId);
		if ("skipped" in loaded) return loaded;
		const { channel, provider, analytics } = loaded;
		const getAccountMetrics = analytics.getAccountMetrics?.bind(analytics);
		if (!getAccountMetrics) return { skipped: "no_account_metrics" };
		const log = this.deps.logger.child({ channelId, provider: provider.id });

		const until = utcDay(Date.now());
		const since = utcDay(Date.now() - ACCOUNT_LOOKBACK_DAYS * 24 * 3600_000);
		let days: AccountMetricsDay[];
		try {
			days = await this.call(channel, provider, (ctx) => getAccountMetrics(ctx, { since, until }));
		} catch (error) {
			const handled = this.handled(error, log);
			if (handled === "skip_batch") return { days: 0, skipped: "invalid_request" };
			if (handled) return { days: 0, ...handled };
			throw error;
		}

		// One row per day (a platform answering a day twice would make the upsert
		// touch a row twice, which Postgres refuses), inside the requested range.
		const byDay = new Map<string, AccountMetricsDay>();
		for (const d of days) {
			if (/^\d{4}-\d{2}-\d{2}$/.test(d.date) && d.date >= since && d.date <= until)
				byDay.set(d.date, d);
		}
		const rows = [...byDay.values()].map((d) => ({
			channelId,
			organizationId: channel.organizationId,
			day: d.date,
			followers: toInt(d.followers),
			impressions: toInt(d.impressions),
			reach: toInt(d.reach),
			profileViews: toInt(d.profileViews),
		}));
		if (rows.length > 0) {
			// A metric missing from this answer keeps the value an earlier run stored:
			// "not reported" must never erase a number we know.
			await this.deps.db
				.insert(channelMetricsDaily)
				.values(rows)
				.onConflictDoUpdate({
					target: [channelMetricsDaily.channelId, channelMetricsDaily.day],
					set: {
						followers: sql.raw(`coalesce(excluded.followers, channel_metrics_daily.followers)`),
						impressions: sql.raw(
							`coalesce(excluded.impressions, channel_metrics_daily.impressions)`,
						),
						reach: sql.raw(`coalesce(excluded.reach, channel_metrics_daily.reach)`),
						profileViews: sql.raw(
							`coalesce(excluded.profile_views, channel_metrics_daily.profile_views)`,
						),
						updatedAt: sql`now()`,
					},
				});
			snapshots.add(rows.length, { provider: provider.id, kind: "account_day" });
		}
		log.info({ days: rows.length, since, until }, "account metrics collected");
		return { days: rows.length };
	}

	// ── internals ──────────────────────────────────────────────────────────────

	private async loadChannel(
		channelId: string,
	): Promise<
		Skipped | { channel: ChannelRow; provider: SocialProvider; analytics: AnalyticsSupport }
	> {
		const [row] = await this.deps.db
			.select({
				id: channels.id,
				organizationId: channels.organizationId,
				provider: channels.provider,
				externalId: channels.externalId,
				metadata: channels.metadata,
				status: channels.status,
				orgDeletedAt: organizations.deletedAt,
			})
			.from(channels)
			.innerJoin(organizations, eq(organizations.id, channels.organizationId))
			.where(eq(channels.id, channelId))
			.limit(1);
		// The planner checked these too, but a job can wait in the queue while the
		// user disconnects the channel or the token is revoked.
		if (!row || row.orgDeletedAt) return { skipped: "channel_missing" };
		if (row.status !== "active") return { skipped: `channel_${row.status}` };
		const provider = this.deps.providers.get(row.provider);
		if (!provider?.isConfigured() || !provider.analytics) return { skipped: "unsupported" };
		return { channel: row, provider, analytics: provider.analytics };
	}

	/**
	 * One platform call with the publishing engine's auth rule: a 401/403 gets one
	 * token refresh (through ChannelTokens, the same locked path publishing uses) and
	 * one resend. Every attempt spends from the provider's analytics budget first.
	 */
	private async call<T>(
		channel: ChannelRow,
		provider: SocialProvider,
		fn: (ctx: ChannelContext) => Promise<T>,
	): Promise<T> {
		let refreshed = false;
		for (;;) {
			const waitMs = await this.deps.budget.take(provider.id);
			if (waitMs > 0) throw new CallBudgetExhausted(provider.id, waitMs);
			try {
				const ctx: ChannelContext = {
					externalId: channel.externalId,
					metadata: channel.metadata,
					accessToken: await this.deps.tokens.getAccessToken(channel.id, {
						forceRefresh: refreshed,
					}),
					logger: this.deps.logger.child({ channelId: channel.id }),
				};
				return await fn(ctx);
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
	 * Failures that end this run quietly. Everything else propagates: rate limits and
	 * transient errors make BullMQ retry the job with backoff (safe — these are reads,
	 * and already-stored batches are no longer due, so a retry resumes where it stopped).
	 */
	private handled(error: unknown, log: Logger): Skipped | "skip_batch" | null {
		if (error instanceof ChannelNeedsReauthError) {
			// ChannelTokens already marked the channel; the user reconnects it.
			return { skipped: "needs_reauth" };
		}
		if (!isProviderError(error)) return null;
		if (error.kind === "auth") {
			// Still refused after a refresh. NOT marked needs_reauth: the usual cause is a
			// missing analytics scope while publishing works fine, and flagging the channel
			// would stop publishing. The next planner run tries again.
			log.warn({ err: error }, "analytics access refused after token refresh");
			return { skipped: "auth" };
		}
		if (error.kind === "invalid_request") {
			// The same request would fail the same way; retrying burns budget for nothing.
			log.warn({ err: error }, "platform rejected the analytics request");
			return "skip_batch";
		}
		return null;
	}
}
