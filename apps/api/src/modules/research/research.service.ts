import { type AiModels, microsToUsd } from "@socialfly/ai";
import { AppError, notFound } from "@socialfly/core/errors";
import { and, type Database, type DbOrTx, desc, eq, inArray, lt, schema, sql } from "@socialfly/db";
import type { JobProducer } from "@socialfly/queue";
import type { BrandInsights } from "@socialfly/research";
import { assertBudget } from "#src/modules/ai/ai.budget.ts";
import {
	type ApplyInsightsInput,
	type CreateCompetitorInput,
	MAX_ACTIVE_PROMPTS,
	MAX_KEYWORDS,
	type PagesQuery,
	type StartRunInput,
	type UpdateCompetitorInput,
} from "./research.schemas.ts";
import {
	dedupeKey,
	isUniqueViolation,
	lockOrg,
	normalizeDomain,
	normalizeKeyword,
	normalizeUrl,
} from "./research.shared.ts";

const { researchRuns, researchPages, brandProfiles, competitors, keywords, visibilityPrompts } =
	schema;

type RunRow = typeof researchRuns.$inferSelect;
type CompetitorRow = typeof competitors.$inferSelect;

const ACTIVE_STATUSES = ["pending", "crawling", "analyzing"] as const;

export const toRunDto = (r: RunRow) => ({
	id: r.id,
	status: r.status,
	startUrl: r.startUrl,
	pagesFound: r.pagesFound,
	pagesCrawled: r.pagesCrawled,
	insights: (r.insights as BrandInsights | null) ?? null,
	model: r.model,
	costUsd: microsToUsd(r.costMicros),
	error: r.errorCode ? { code: r.errorCode, message: r.errorMessage ?? "" } : null,
	createdAt: r.createdAt.toISOString(),
	startedAt: r.startedAt?.toISOString() ?? null,
	completedAt: r.completedAt?.toISOString() ?? null,
});

export const toCompetitorDto = (c: CompetitorRow) => ({
	id: c.id,
	name: c.name,
	domain: c.domain,
	aliases: c.aliases,
	source: c.source,
	createdAt: c.createdAt.toISOString(),
});

const competitorExists = () =>
	new AppError(409, "competitor_exists", "A competitor with this name already exists");

/**
 * Website research runs, applying their insights, and the competitor list. The run
 * itself happens in the worker (apps/worker/src/research/crawl.ts); this side inserts
 * it, enforces one active run per organization, and reads results.
 */
export class ResearchService {
	constructor(
		private readonly db: Database,
		private readonly ai: AiModels,
		private readonly jobs: JobProducer,
		/** Read at call time: whether SEO is configured decides if new keywords get measured. */
		private readonly seoConfigured: () => boolean,
	) {}

	// ── runs ────────────────────────────────────────────────────────────────────

	async startRun(orgId: string, userId: string, input: StartRunInput) {
		// The crawl is free; the analysis is a paid text call — without a model there is no brief.
		if (!this.ai.text)
			throw new AppError(503, "ai_not_configured", "AI research is not set up on this server");
		const raw = input.url ?? (await this.website(orgId));
		if (!raw) {
			throw new AppError(
				422,
				"no_website",
				"Add your website to the brand profile, or enter the address to research",
			);
		}
		const startUrl = normalizeUrl(raw);
		await assertBudget(this.db, orgId);

		const run = await this.db.transaction(async (tx) => {
			await lockOrg(tx, orgId, "research-run");
			const [active] = await tx
				.select({ id: researchRuns.id })
				.from(researchRuns)
				.where(
					and(
						eq(researchRuns.organizationId, orgId),
						inArray(researchRuns.status, [...ACTIVE_STATUSES]),
					),
				)
				.limit(1);
			if (active) {
				throw new AppError(
					409,
					"research_in_progress",
					"A website research run is already in progress",
					{ runId: active.id },
				);
			}
			const [row] = await tx
				.insert(researchRuns)
				.values({ organizationId: orgId, requestedBy: userId, startUrl })
				.returning();
			return row as RunRow;
		});

		// The row is committed before the job exists, so the worker always finds it.
		try {
			await this.jobs.enqueueResearchCrawl(run.id);
		} catch (error) {
			// No job means nothing will ever pick the run up, and it would block the next one.
			await this.db
				.update(researchRuns)
				.set({
					status: "failed",
					errorCode: "enqueue_failed",
					errorMessage: "Could not start the research — please try again",
					completedAt: new Date(),
				})
				.where(eq(researchRuns.id, run.id));
			throw error;
		}
		return toRunDto(run);
	}

	async listRuns(orgId: string, limit: number) {
		const rows = await this.db
			.select()
			.from(researchRuns)
			.where(eq(researchRuns.organizationId, orgId))
			.orderBy(desc(researchRuns.id))
			.limit(limit);
		return { items: rows.map(toRunDto) };
	}

	/** The brief to show: the latest successful run, else the latest run (to show its progress or error). */
	async latestRun(orgId: string) {
		const [row] = await this.db
			.select()
			.from(researchRuns)
			.where(eq(researchRuns.organizationId, orgId))
			.orderBy(sql`(${researchRuns.status} = 'succeeded') desc`, desc(researchRuns.id))
			.limit(1);
		return row ? toRunDto(row) : null;
	}

	async getRun(orgId: string, id: string) {
		return toRunDto(await this.runRow(orgId, id));
	}

	/** Newest first, keyset on the time-ordered id. */
	async listPages(orgId: string, runId: string, q: PagesQuery) {
		await this.runRow(orgId, runId);
		const rows = await this.db
			.select({
				id: researchPages.id,
				url: researchPages.url,
				title: researchPages.title,
				description: researchPages.description,
				wordCount: researchPages.wordCount,
				statusCode: researchPages.statusCode,
			})
			.from(researchPages)
			.where(
				and(
					eq(researchPages.runId, runId),
					eq(researchPages.organizationId, orgId),
					q.before ? lt(researchPages.id, q.before) : undefined,
				),
			)
			.orderBy(desc(researchPages.id))
			.limit(q.limit + 1);
		const items = rows.slice(0, q.limit);
		return {
			items,
			nextCursor: rows.length > q.limit ? (items.at(-1)?.id ?? null) : null,
		};
	}

	/**
	 * Turns picks from a brief into working lists. Duplicates (case-insensitive) are
	 * skipped rather than rejected — the user ticked suggestions, some of which they
	 * may already have — and prompts stop at the active-prompt cap.
	 */
	async applyInsights(orgId: string, input: ApplyInsightsInput) {
		await this.runRow(orgId, input.runId);
		const result = await this.db.transaction(async (tx) => {
			await lockOrg(tx, orgId, "research-lists");

			let promptsAdded = 0;
			if (input.buyerQuestions?.length) {
				const existing = await tx
					.select({ prompt: visibilityPrompts.prompt, active: visibilityPrompts.active })
					.from(visibilityPrompts)
					.where(eq(visibilityPrompts.organizationId, orgId));
				const seen = new Set(existing.map((p) => dedupeKey(p.prompt)));
				let slots = MAX_ACTIVE_PROMPTS - existing.filter((p) => p.active).length;
				const values: { organizationId: string; prompt: string }[] = [];
				for (const prompt of input.buyerQuestions) {
					const key = dedupeKey(prompt);
					if (slots <= 0) break;
					if (seen.has(key)) continue;
					seen.add(key);
					values.push({ organizationId: orgId, prompt });
					slots--;
				}
				if (values.length) await tx.insert(visibilityPrompts).values(values);
				promptsAdded = values.length;
			}

			let competitorsAdded = 0;
			if (input.competitors?.length) {
				const existing = await tx
					.select({ name: competitors.name })
					.from(competitors)
					.where(eq(competitors.organizationId, orgId));
				const seen = new Set(existing.map((c) => dedupeKey(c.name)));
				const values = input.competitors.flatMap((c) => {
					const key = dedupeKey(c.name);
					if (seen.has(key)) return [];
					seen.add(key);
					return [
						{
							organizationId: orgId,
							name: c.name,
							domain: normalizeDomain(c.domain),
							source: "ai" as const,
						},
					];
				});
				if (values.length) {
					const inserted = await tx
						.insert(competitors)
						.values(values)
						.onConflictDoNothing()
						.returning({ id: competitors.id });
					competitorsAdded = inserted.length;
				}
			}

			let keywordsAdded = 0;
			if (input.keywords?.length) {
				keywordsAdded = await insertKeywords(
					tx,
					orgId,
					input.keywords,
					{
						locationCode: 2840,
						languageCode: "en",
						tracked: false,
					},
					"truncate",
				);
			}
			return { promptsAdded, competitorsAdded, keywordsAdded };
		});
		if (result.keywordsAdded > 0 && this.seoConfigured())
			await this.jobs.enqueueSeoRefresh(orgId, { force: true });
		return result;
	}

	private async runRow(orgId: string, id: string) {
		const [row] = await this.db
			.select()
			.from(researchRuns)
			.where(and(eq(researchRuns.id, id), eq(researchRuns.organizationId, orgId)))
			.limit(1);
		if (!row) throw notFound("Research run");
		return row;
	}

	private async website(orgId: string) {
		const [row] = await this.db
			.select({ website: brandProfiles.website })
			.from(brandProfiles)
			.where(eq(brandProfiles.organizationId, orgId))
			.limit(1);
		return row?.website?.trim() || null;
	}

	// ── competitors ─────────────────────────────────────────────────────────────

	async listCompetitors(orgId: string) {
		const rows = await this.db
			.select()
			.from(competitors)
			.where(eq(competitors.organizationId, orgId))
			.orderBy(competitors.name);
		return { items: rows.map(toCompetitorDto) };
	}

	async createCompetitor(orgId: string, input: CreateCompetitorInput) {
		await this.assertNameFree(orgId, input.name);
		try {
			const [row] = await this.db
				.insert(competitors)
				.values({
					organizationId: orgId,
					name: input.name,
					domain: normalizeDomain(input.domain),
					aliases: dedupeList(input.aliases),
					source: "user",
				})
				.returning();
			return toCompetitorDto(row as CompetitorRow);
		} catch (error) {
			if (isUniqueViolation(error)) throw competitorExists();
			throw error;
		}
	}

	async updateCompetitor(orgId: string, id: string, input: UpdateCompetitorInput) {
		if (input.name !== undefined) await this.assertNameFree(orgId, input.name, id);
		try {
			const [row] = await this.db
				.update(competitors)
				.set({
					...(input.name !== undefined ? { name: input.name } : {}),
					...(input.domain !== undefined ? { domain: normalizeDomain(input.domain) } : {}),
					...(input.aliases !== undefined ? { aliases: dedupeList(input.aliases) } : {}),
				})
				.where(and(eq(competitors.id, id), eq(competitors.organizationId, orgId)))
				.returning();
			if (!row) throw notFound("Competitor");
			return toCompetitorDto(row);
		} catch (error) {
			if (isUniqueViolation(error)) throw competitorExists();
			throw error;
		}
	}

	async deleteCompetitor(orgId: string, id: string) {
		const deleted = await this.db
			.delete(competitors)
			.where(and(eq(competitors.id, id), eq(competitors.organizationId, orgId)))
			.returning({ id: competitors.id });
		if (!deleted.length) throw notFound("Competitor");
	}

	/** Names are unique per org regardless of case: "Acme" and "acme" are one competitor. */
	private async assertNameFree(orgId: string, name: string, exceptId?: string) {
		const [clash] = await this.db
			.select({ id: competitors.id })
			.from(competitors)
			.where(
				and(
					eq(competitors.organizationId, orgId),
					sql`lower(${competitors.name}) = ${dedupeKey(name)}`,
					exceptId ? sql`${competitors.id} <> ${exceptId}` : undefined,
				),
			)
			.limit(1);
		if (clash) throw competitorExists();
	}
}

const dedupeList = (items: string[]) => {
	const seen = new Set<string>();
	return items.filter((i) => {
		const key = dedupeKey(i);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
};

/**
 * Adds keywords (normalised, de-duplicated against the org's list by the unique index)
 * and returns how many were new. Refuses to grow a list past MAX_KEYWORDS.
 */
export async function insertKeywords(
	tx: DbOrTx,
	orgId: string,
	raw: string[],
	opts: { locationCode: number; languageCode: string; tracked: boolean },
	/** Applying suggestions adds what fits instead of refusing the whole batch. */
	overflow: "reject" | "truncate" = "reject",
) {
	const unique = [...new Set(raw.map(normalizeKeyword).filter(Boolean))];
	if (!unique.length) return 0;
	await lockOrg(tx, orgId, "keywords");
	const [count] = await tx
		.select({ n: sql<number>`count(*)::int` })
		.from(keywords)
		.where(eq(keywords.organizationId, orgId));
	const existing = await tx
		.select({ keyword: keywords.keyword })
		.from(keywords)
		.where(
			and(
				eq(keywords.organizationId, orgId),
				eq(keywords.locationCode, opts.locationCode),
				eq(keywords.languageCode, opts.languageCode),
				inArray(keywords.keyword, unique),
			),
		);
	const known = new Set(existing.map((k) => k.keyword));
	let fresh = unique.filter((k) => !known.has(k));
	const room = Math.max(0, MAX_KEYWORDS - (count?.n ?? 0));
	if (overflow === "truncate") fresh = fresh.slice(0, room);
	if (fresh.length > room) {
		throw new AppError(
			409,
			"keyword_limit",
			`An organization can track at most ${MAX_KEYWORDS} keywords — remove some first`,
			{ limit: MAX_KEYWORDS },
		);
	}
	if (!fresh.length) return 0;
	const inserted = await tx
		.insert(keywords)
		.values(fresh.map((keyword) => ({ organizationId: orgId, keyword, ...opts })))
		.onConflictDoNothing()
		.returning({ id: keywords.id });
	return inserted.length;
}
