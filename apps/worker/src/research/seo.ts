import { and, eq, isNull, lt, or, schema, sql } from "@socialfly/db";
import type { KeywordMetric } from "@socialfly/research";
import { budgetExceeded } from "./budget.ts";
import { domainOf, forEachLimit, type ResearchDeps } from "./deps.ts";

const { keywords, keywordRankings, aiGenerations } = schema;

/** Search volumes move slowly and each lookup is paid: refresh a keyword's metrics monthly. */
const METRICS_MAX_AGE = sql.raw(`interval '30 days'`);
/** Keywords per metrics call (DataForSEO bills per task, not per keyword, up to far more). */
const METRICS_BATCH = 100;
/** Guards per organization per run, so one tenant cannot run up an unbounded bill. */
const MAX_METRIC_KEYWORDS = 500;
const MAX_TRACKED_KEYWORDS = 100;
const SERP_CONCURRENCY = 2;

const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);
const normal = (k: string) => k.trim().toLowerCase();

/**
 * SEO data from DataForSEO (optional): keyword metrics (volume, difficulty, CPC) and the
 * brand domain's Google position for tracked keywords, one row per keyword per UTC day.
 *
 * Progress is written as it goes (metricsUpdatedAt per batch, a ranking row per
 * keyword), so a retry skips what is done and pays only for the rest.
 */
export class SeoRefresh {
	constructor(private readonly deps: ResearchDeps) {}

	/** Weekly: one seo-refresh job per organization that has keywords. */
	async plan() {
		if (!this.deps.seo) return { queued: 0 };
		const rows = (await this.deps.db.execute(sql`
			select distinct k.organization_id as id
			from keywords k
			join organizations o on o.id = k.organization_id
			where o.deleted_at is null
		`)) as unknown as { id: string }[];
		const now = Date.now();
		for (const row of rows) await this.deps.jobs.enqueueSeoRefresh(row.id, { now });
		return { queued: rows.length };
	}

	async runForOrg(orgId: string) {
		const { db, logger } = this.deps;
		const seo = this.deps.seo;
		const log = logger.child({ organizationId: orgId, task: "seo" });
		if (!seo) return { skipped: "not_configured" };

		const [org] = (await db.execute(sql`
			select b.website from organizations o
			left join brand_profiles b on b.organization_id = o.id
			where o.id = ${orgId} and o.deleted_at is null
		`)) as unknown as { website: string | null }[];
		if (!org) return { skipped: "organization_gone" };
		if (await budgetExceeded(db, orgId, this.deps.config.monthlyBudgetUsd)) {
			log.warn("monthly AI budget reached; SEO refresh skipped");
			return { skipped: "budget_exceeded" };
		}

		const spent = { costMicros: 0, calls: 0, metrics: 0, rankings: 0 };
		const started = Date.now();
		try {
			await this.refreshMetrics(orgId, spent);
			const domain = domainOf(org.website);
			if (domain) await this.refreshRankings(orgId, domain, spent);
		} finally {
			if (spent.calls > 0) {
				await db.insert(aiGenerations).values({
					organizationId: orgId,
					userId: null,
					kind: "seo",
					status: "succeeded",
					model: "dataforseo",
					input: { task: "refresh", metrics: spent.metrics, rankings: spent.rankings },
					costMicros: spent.costMicros,
					durationMs: Date.now() - started,
					completedAt: new Date(),
				});
			}
		}
		log.info(spent, "seo refresh done");
		return spent;
	}

	/** Keywords never measured, or measured more than 30 days ago, per location/language. */
	private async refreshMetrics(
		orgId: string,
		spent: { costMicros: number; calls: number; metrics: number },
	) {
		const { db } = this.deps;
		const seo = this.deps.seo;
		if (!seo) return;
		const stale = await db
			.select({
				id: keywords.id,
				keyword: keywords.keyword,
				locationCode: keywords.locationCode,
				languageCode: keywords.languageCode,
			})
			.from(keywords)
			.where(
				and(
					eq(keywords.organizationId, orgId),
					or(
						isNull(keywords.metricsUpdatedAt),
						lt(keywords.metricsUpdatedAt, sql`now() - ${METRICS_MAX_AGE}`),
					),
				),
			)
			.orderBy(keywords.createdAt)
			.limit(MAX_METRIC_KEYWORDS);

		const groups = new Map<string, typeof stale>();
		for (const k of stale) {
			const key = `${k.locationCode}:${k.languageCode}`;
			groups.set(key, [...(groups.get(key) ?? []), k]);
		}
		for (const group of groups.values()) {
			const first = group[0];
			if (!first) continue;
			for (let i = 0; i < group.length; i += METRICS_BATCH) {
				const batch = group.slice(i, i + METRICS_BATCH);
				spent.calls++;
				const result = await seo.keywordMetrics(
					batch.map((k) => k.keyword),
					{ locationCode: first.locationCode, languageCode: first.languageCode },
				);
				spent.costMicros += result.costMicros;
				const byKeyword = new Map<string, KeywordMetric>(
					result.items.map((m) => [normal(m.keyword), m]),
				);
				const now = new Date();
				await db.transaction(async (tx) => {
					for (const k of batch) {
						const m = byKeyword.get(normal(k.keyword));
						// Marked updated even when the provider has no data for it: unknown stays
						// null, and asking again tomorrow would pay for the same empty answer.
						await tx
							.update(keywords)
							.set({
								searchVolume: m?.searchVolume ?? null,
								difficulty:
									m?.difficulty === null || m?.difficulty === undefined
										? null
										: Math.round(m.difficulty),
								cpcUsd: m?.cpcUsd ?? null,
								metricsUpdatedAt: now,
							})
							.where(eq(keywords.id, k.id));
					}
				});
				spent.metrics += batch.length;
			}
		}
	}

	/** Google position of the brand's domain for each tracked keyword not yet checked today. */
	private async refreshRankings(
		orgId: string,
		domain: string,
		spent: { costMicros: number; calls: number; rankings: number },
	) {
		const { db } = this.deps;
		const seo = this.deps.seo;
		if (!seo) return;
		const day = utcDay();
		// Raw SQL with aliases: a correlated NOT EXISTS through drizzle would leave the
		// columns unqualified and compare keyword_rankings with itself.
		const due = (await db.execute(sql`
			select k.id, k.keyword, k.location_code as "locationCode", k.language_code as "languageCode"
			from keywords k
			where k.organization_id = ${orgId} and k.tracked
				and not exists (select 1 from keyword_rankings r where r.keyword_id = k.id and r.day = ${day})
			order by k.created_at
			limit ${MAX_TRACKED_KEYWORDS}
		`)) as unknown as { id: string; keyword: string; locationCode: number; languageCode: string }[];

		await forEachLimit(due, SERP_CONCURRENCY, async (k) => {
			spent.calls++;
			const r = await seo.serpPosition(k.keyword, domain, {
				locationCode: k.locationCode,
				languageCode: k.languageCode,
			});
			spent.costMicros += r.costMicros;
			await db
				.insert(keywordRankings)
				.values({ keywordId: k.id, day, position: r.position, url: r.url })
				.onConflictDoUpdate({
					target: [keywordRankings.keywordId, keywordRankings.day],
					// created_at doubles as "checked at" for the day's row.
					set: { position: r.position, url: r.url, createdAt: new Date() },
				});
			spent.rankings++;
		});
	}
}
