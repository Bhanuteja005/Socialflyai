import { AiError, type BrandContext, type TextResult } from "@socialfly/ai";
import { and, eq, inArray, ne, schema, sql } from "@socialfly/db";
import type { BrandInsights, CrawledPage } from "@socialfly/research";
import type { ResearchDeps } from "./deps.ts";

const { researchRuns, researchPages, brandProfiles, competitors, aiGenerations } = schema;

type Run = typeof researchRuns.$inferSelect;
type Attempt = { attemptsMade: number; maxAttempts: number };

/** Stored page text cap: the analysis reads a summary of the site, not an archive. */
const MAX_PAGE_TEXT = 20_000;
/** A whole crawl never runs longer than this, however slow the site is. */
const CRAWL_TIMEOUT_MS = 8 * 60_000;

/** A failure written for the user, never retried (robots, empty site). */
class RunRejected extends Error {
	constructor(
		readonly code: string,
		message: string,
	) {
		super(message);
	}
}

/**
 * One research run: crawl the site into research_pages, then have the text model turn
 * the pages into a brand brief (research_runs.insights).
 *
 * This is the ONLY writer of research_runs.status after the API inserts `pending`
 * (plus the maintenance timeout sweep) — the same ownership rule as ai-media.ts.
 * Failure semantics mirror it too: a non-retryable AiError fails the run without a
 * throw, anything else is thrown for BullMQ to retry until the last attempt. A retry
 * whose crawl already finished (status `analyzing`) re-uses the stored pages instead
 * of fetching the site again.
 */
export class ResearchCrawl {
	constructor(private readonly deps: ResearchDeps) {}

	async run(runId: string, attempt: Attempt) {
		const { db, logger } = this.deps;
		const [run] = await db.select().from(researchRuns).where(eq(researchRuns.id, runId)).limit(1);
		if (!run) {
			logger.warn({ runId }, "research job for a missing run");
			return;
		}
		if (run.status === "succeeded" || run.status === "failed") return;

		// Active states are claimable: a worker that died mid-run leaves one behind and
		// the BullMQ retry must pick it up. The job id is the run id, so two live workers
		// on one run cannot happen; the guarded final UPDATEs settle it if it ever did.
		const resume = run.status === "analyzing";
		const [claimed] = await db
			.update(researchRuns)
			.set({
				status: resume ? "analyzing" : "crawling",
				startedAt: sql`coalesce(${researchRuns.startedAt}, now())`,
			})
			.where(
				and(
					eq(researchRuns.id, run.id),
					inArray(researchRuns.status, ["pending", "crawling", "analyzing"]),
				),
			)
			.returning({ id: researchRuns.id });
		if (!claimed) return;

		let analysed: TextResult<BrandInsights> | undefined;
		let modelCalled = false;
		try {
			const pages = resume ? await this.storedPages(run.id) : await this.crawl(run);
			if (pages.length === 0) {
				throw new RunRejected(
					"no_pages",
					"We could not read any pages at that address. Check the URL and that the site is online.",
				);
			}
			const moved = await db
				.update(researchRuns)
				.set({ status: "analyzing" })
				.where(
					and(eq(researchRuns.id, run.id), inArray(researchRuns.status, ["crawling", "analyzing"])),
				)
				.returning({ id: researchRuns.id });
			// Timed out by maintenance while crawling: the user was already told it failed.
			if (moved.length === 0) return;

			const model = this.deps.ai.text;
			if (!model) throw new AiError("not_configured", "AI text generation is not configured");
			const brand = await this.brandContext(run.organizationId);
			const known = await db
				.select({ name: competitors.name })
				.from(competitors)
				.where(eq(competitors.organizationId, run.organizationId));
			modelCalled = true;
			analysed = await this.deps.fns.analyzeBrand(model, {
				pages,
				brand,
				knownCompetitors: known.map((c) => c.name),
			});
			await this.succeed(run, analysed, pages.length);
		} catch (error) {
			// The model already charged us: keep it on the run before deciding what to do,
			// so a retry that succeeds reports everything the org actually spent.
			if (analysed && analysed.costMicros > 0) {
				await db
					.update(researchRuns)
					.set({
						model: analysed.model,
						costMicros: sql`${researchRuns.costMicros} + ${analysed.costMicros}`,
					})
					.where(eq(researchRuns.id, run.id));
			}
			await this.handleFailure(run, error, attempt, modelCalled);
		}
	}

	/** Fetches the site, storing each page as it arrives so the UI can show progress. */
	private async crawl(run: Run): Promise<CrawledPage[]> {
		const { db, config } = this.deps;
		const stored = new Set<string>();
		// onPage may not be awaited by the crawler: writes are chained so they never race
		// each other (progress could otherwise go backwards) and are all done before we move on.
		let writes: Promise<void> = Promise.resolve();
		const store = (page: CrawledPage, progress: { crawled: number; found: number } | null) => {
			writes = writes.then(async () => {
				if (!stored.has(page.url)) {
					await this.upsertPage(run, page);
					stored.add(page.url);
				}
				if (progress) {
					await db
						.update(researchRuns)
						.set({ pagesCrawled: progress.crawled, pagesFound: progress.found })
						.where(eq(researchRuns.id, run.id));
				}
			});
			// Marked handled here (the real handling is the `await writes` below): a crawler
			// that ignores onPage's promise must not turn a failed write into a process crash.
			writes.catch(() => {});
			return writes;
		};

		const result = await this.deps.fns.crawlSite(run.startUrl, {
			maxPages: config.maxPages,
			userAgent: config.userAgent,
			signal: AbortSignal.timeout(CRAWL_TIMEOUT_MS),
			onPage: (page, progress) => store(page, progress),
		});
		await writes;
		if (result.blockedByRobots) {
			throw new RunRejected(
				"robots_disallowed",
				"This website's robots.txt does not allow crawlers like ours. Allow SocialFlyBot in robots.txt, or research a different URL.",
			);
		}
		for (const page of result.pages) await store(page, null);
		await db
			.update(researchRuns)
			.set({ pagesCrawled: result.pages.length, pagesFound: result.pagesFound })
			.where(eq(researchRuns.id, run.id));
		return result.pages;
	}

	private async upsertPage(run: Run, page: CrawledPage) {
		const values = {
			statusCode: page.statusCode,
			title: page.title,
			description: page.description,
			headings: page.headings.slice(0, 100),
			text: page.text.slice(0, MAX_PAGE_TEXT),
			wordCount: page.wordCount,
		};
		await this.deps.db
			.insert(researchPages)
			.values({ runId: run.id, organizationId: run.organizationId, url: page.url, ...values })
			.onConflictDoUpdate({ target: [researchPages.runId, researchPages.url], set: values });
	}

	private async storedPages(runId: string): Promise<CrawledPage[]> {
		const rows = await this.deps.db
			.select()
			.from(researchPages)
			.where(eq(researchPages.runId, runId))
			.orderBy(researchPages.id);
		return rows.map((r) => ({
			url: r.url,
			statusCode: r.statusCode ?? 200,
			title: r.title,
			description: r.description,
			headings: r.headings,
			text: r.text,
			wordCount: r.wordCount,
		}));
	}

	private async brandContext(orgId: string): Promise<BrandContext | null> {
		const [row] = await this.deps.db
			.select()
			.from(brandProfiles)
			.where(eq(brandProfiles.organizationId, orgId))
			.limit(1);
		if (!row) return null;
		return {
			brandName: row.brandName,
			description: row.description,
			audience: row.audience,
			voice: row.voice,
			website: row.website,
			keywords: row.keywords,
			avoid: row.avoid,
			examplePosts: row.examplePosts,
		};
	}

	/**
	 * The brief, the success mark and the ledger row commit together, so spend can never
	 * be recorded without its run (or the reverse). Not guarded on `analyzing` only: if
	 * maintenance timed the run out while the model was still answering, the finished,
	 * paid-for brief is the truth and wins.
	 */
	private async succeed(run: Run, result: TextResult<BrandInsights>, pageCount: number) {
		const { db, logger } = this.deps;
		await db.transaction(async (tx) => {
			const [row] = await tx
				.update(researchRuns)
				.set({
					status: "succeeded",
					insights: result.output as unknown as Record<string, unknown>,
					model: result.model,
					costMicros: sql`${researchRuns.costMicros} + ${result.costMicros}`,
					completedAt: new Date(),
					errorCode: null,
					errorMessage: null,
				})
				.where(and(eq(researchRuns.id, run.id), ne(researchRuns.status, "succeeded")))
				.returning({ costMicros: researchRuns.costMicros, startedAt: researchRuns.startedAt });
			if (!row) return;
			await tx.insert(aiGenerations).values({
				organizationId: run.organizationId,
				userId: run.requestedBy,
				kind: "research",
				status: "succeeded",
				model: result.model,
				input: { runId: run.id, startUrl: run.startUrl, pages: pageCount },
				inputTokens: result.usage.inputTokens,
				outputTokens: result.usage.outputTokens,
				costMicros: row.costMicros,
				durationMs: row.startedAt ? Date.now() - row.startedAt.getTime() : null,
				completedAt: new Date(),
			});
		});
		logger.info(
			{ runId: run.id, pages: pageCount, costMicros: result.costMicros },
			"research run succeeded",
		);
	}

	private async handleFailure(run: Run, error: unknown, attempt: Attempt, modelCalled: boolean) {
		const log = { err: error, runId: run.id };
		if (error instanceof RunRejected) {
			this.deps.logger.info({ ...log, errorCode: error.code }, "research run rejected");
			return this.fail(run, error.code, error.message, modelCalled);
		}
		if (error instanceof AiError && !error.retryable) {
			this.deps.logger.info({ ...log, errorCode: error.kind }, "research analysis rejected");
			return this.fail(run, error.kind, error.message, modelCalled);
		}
		if (attempt.attemptsMade + 1 < attempt.maxAttempts) {
			// Stay in the current state: the retry re-claims it (and skips the crawl if done).
			this.deps.logger.warn(log, "research run failed; will retry");
			throw error;
		}
		this.deps.logger.error(log, "research run failed on its last attempt");
		// AiError messages are written for users; anything else may leak internals.
		return error instanceof AiError
			? this.fail(run, "transient", error.message, modelCalled)
			: this.fail(
					run,
					"internal",
					"Something went wrong researching this site. Please try again.",
					modelCalled,
				);
	}

	/**
	 * Marks the run failed. When the model was asked (or an earlier attempt's spend was
	 * kept by run()), a failed ledger row records it: the budget stays accurate and the
	 * audit trail shows the attempt, as the API does for failed text generations.
	 */
	private async fail(run: Run, errorCode: string, errorMessage: string, modelCalled: boolean) {
		await this.deps.db.transaction(async (tx) => {
			const [row] = await tx
				.update(researchRuns)
				.set({ status: "failed", errorCode, errorMessage, completedAt: new Date() })
				.where(
					and(
						eq(researchRuns.id, run.id),
						inArray(researchRuns.status, ["pending", "crawling", "analyzing"]),
					),
				)
				.returning({ costMicros: researchRuns.costMicros, model: researchRuns.model });
			if (!row || (!modelCalled && row.costMicros <= 0)) return;
			await tx.insert(aiGenerations).values({
				organizationId: run.organizationId,
				userId: run.requestedBy,
				kind: "research",
				status: "failed",
				model: row.model ?? this.deps.ai.text?.id ?? null,
				input: { runId: run.id, startUrl: run.startUrl },
				costMicros: row.costMicros,
				errorCode,
				errorMessage: errorMessage.slice(0, 1000),
				completedAt: new Date(),
			});
		});
	}
}
