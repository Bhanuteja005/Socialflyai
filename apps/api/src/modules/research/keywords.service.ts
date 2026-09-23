import { isAiError } from "@socialfly/ai";
import { AppError, notFound } from "@socialfly/core/errors";
import { and, type Database, eq, schema, sql } from "@socialfly/db";
import type { JobProducer } from "@socialfly/queue";
import type { DataForSeo } from "@socialfly/research";
import { assertBudget } from "#src/modules/ai/ai.budget.ts";
import { toAppError } from "#src/modules/ai/ai.service.ts";
import type { AddKeywordsInput, KeywordIdeasInput } from "./research.schemas.ts";
import { insertKeywords } from "./research.service.ts";

const { keywords, aiGenerations } = schema;

type KeywordListRow = {
	id: string;
	keyword: string;
	locationCode: number;
	languageCode: string;
	tracked: boolean;
	searchVolume: number | null;
	difficulty: number | null;
	cpcUsd: string | number | null;
	metricsUpdatedAt: Date | string | null;
	position: number | null;
	previousPosition: number | null;
	rankedUrl: string | null;
	rankCheckedAt: Date | string | null;
};

const iso = (v: Date | string | null) => (v === null ? null : new Date(v).toISOString());

const toKeywordDto = (r: KeywordListRow) => ({
	id: r.id,
	keyword: r.keyword,
	locationCode: r.locationCode,
	languageCode: r.languageCode,
	tracked: r.tracked,
	searchVolume: r.searchVolume,
	difficulty: r.difficulty,
	cpcUsd: r.cpcUsd === null ? null : Number(r.cpcUsd),
	metricsUpdatedAt: iso(r.metricsUpdatedAt),
	position: r.position,
	previousPosition: r.previousPosition,
	rankedUrl: r.rankedUrl,
	rankCheckedAt: iso(r.rankCheckedAt),
});

const seoNotConfigured = () =>
	new AppError(503, "seo_not_configured", "SEO data is not set up on this server");

/**
 * The organization's keyword list, its Google rankings, and on-demand keyword ideas.
 * Metrics and rankings are refreshed by the worker (weekly, or right after keywords
 * are added); only keyword ideas call DataForSEO on the request path.
 */
export class KeywordsService {
	constructor(
		private readonly db: Database,
		private readonly jobs: JobProducer,
		/** Read at call time so tests (and a config reload) can swap it. */
		private readonly seo: () => Pick<DataForSeo, "keywordIdeas"> | null,
	) {}

	/**
	 * Latest and previous ranking per keyword via LATERAL joins on the (keyword_id, day)
	 * primary key. Raw SQL with aliases: drizzle leaves columns unqualified in
	 * single-table queries, which silently breaks correlated subqueries.
	 */
	async list(orgId: string, id?: string) {
		const rows = (await this.db.execute(sql`
			select k.id, k.keyword, k.location_code as "locationCode", k.language_code as "languageCode",
				k.tracked, k.search_volume as "searchVolume", k.difficulty, k.cpc_usd as "cpcUsd",
				k.metrics_updated_at as "metricsUpdatedAt",
				r1.position, r1.url as "rankedUrl", r1.created_at as "rankCheckedAt",
				r2.position as "previousPosition"
			from keywords k
			left join lateral (
				select r.position, r.url, r.created_at, r.day from keyword_rankings r
				where r.keyword_id = k.id order by r.day desc limit 1
			) r1 on true
			left join lateral (
				select r.position from keyword_rankings r
				where r.keyword_id = k.id and r.day < r1.day order by r.day desc limit 1
			) r2 on true
			where k.organization_id = ${orgId} ${id ? sql`and k.id = ${id}` : sql``}
			order by k.created_at desc, k.id desc
		`)) as unknown as KeywordListRow[];
		return rows.map(toKeywordDto);
	}

	async add(orgId: string, input: AddKeywordsInput) {
		const added = await this.db.transaction((tx) =>
			insertKeywords(tx, orgId, input.keywords, {
				locationCode: input.locationCode,
				languageCode: input.languageCode,
				tracked: input.tracked,
			}),
		);
		// Measure the new ones now rather than at next week's refresh.
		if (added > 0 && this.seo()) await this.jobs.enqueueSeoRefresh(orgId, { force: true });
		return { added };
	}

	async update(orgId: string, id: string, tracked: boolean) {
		const [row] = await this.db
			.update(keywords)
			.set({ tracked })
			.where(and(eq(keywords.id, id), eq(keywords.organizationId, orgId)))
			.returning({ id: keywords.id });
		if (!row) throw notFound("Keyword");
		// Newly tracked: check its position now, not in up to a week.
		if (tracked && this.seo()) await this.jobs.enqueueSeoRefresh(orgId, { force: true });
		const [dto] = await this.list(orgId, id);
		return dto as ReturnType<typeof toKeywordDto>;
	}

	async remove(orgId: string, id: string) {
		const deleted = await this.db
			.delete(keywords)
			.where(and(eq(keywords.id, id), eq(keywords.organizationId, orgId)))
			.returning({ id: keywords.id });
		if (!deleted.length) throw notFound("Keyword");
	}

	/** One point per checked day, oldest first; null position = not in the results checked. */
	async rankings(orgId: string, id: string, days: number) {
		const [kw] = await this.db
			.select({ id: keywords.id })
			.from(keywords)
			.where(and(eq(keywords.id, id), eq(keywords.organizationId, orgId)))
			.limit(1);
		if (!kw) throw notFound("Keyword");
		const rows = (await this.db.execute(sql`
			select r.day::text as date, r.position, r.url from keyword_rankings r
			where r.keyword_id = ${id} and r.day > (now() at time zone 'utc')::date - ${days}::int
			order by r.day
		`)) as unknown as { date: string; position: number | null; url: string | null }[];
		return { days: rows.map((r) => ({ date: r.date, position: r.position, url: r.url })) };
	}

	/**
	 * Related keywords with metrics, synchronously (a few seconds). Paid, so budgeted and
	 * recorded on the ledger like any AI call, succeeded or failed.
	 */
	async ideas(orgId: string, userId: string, input: KeywordIdeasInput) {
		const seo = this.seo();
		if (!seo) throw seoNotConfigured();
		await assertBudget(this.db, orgId);
		const started = performance.now();
		const base = {
			organizationId: orgId,
			userId,
			kind: "seo" as const,
			model: "dataforseo",
			input: { task: "keyword_ideas", ...input },
		};
		let result: Awaited<ReturnType<typeof seo.keywordIdeas>>;
		try {
			result = await seo.keywordIdeas(
				input.seeds.map((s) => s.trim()),
				{ locationCode: input.locationCode, languageCode: input.languageCode, limit: input.limit },
			);
		} catch (error) {
			await this.db.insert(aiGenerations).values({
				...base,
				status: "failed",
				errorCode: isAiError(error) ? error.kind : "internal",
				errorMessage: error instanceof Error ? error.message.slice(0, 1000) : String(error),
				durationMs: Math.round(performance.now() - started),
				completedAt: new Date(),
			});
			if (isAiError(error)) throw toAppError(error);
			throw new AppError(
				502,
				"seo_unavailable",
				"The SEO data provider is unavailable — please try again",
				undefined,
				{ cause: error },
			);
		}
		await this.db.insert(aiGenerations).values({
			...base,
			status: "succeeded",
			output: { count: result.items.length },
			costMicros: result.costMicros,
			durationMs: Math.round(performance.now() - started),
			completedAt: new Date(),
		});
		return { items: result.items.slice(0, input.limit) };
	}
}
