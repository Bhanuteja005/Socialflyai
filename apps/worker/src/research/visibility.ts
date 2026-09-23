import { isAiError } from "@socialfly/ai";
import { and, asc, eq, isNull, schema, sql } from "@socialfly/db";
import type { VisibilityEngine } from "@socialfly/research";
import { budgetExceeded } from "./budget.ts";
import { domainOf, forEachLimit, type ResearchDeps } from "./deps.ts";

const { visibilityPrompts, visibilityChecks, competitors, aiGenerations } = schema;

/** Guard: prompts asked per organization per run (the API caps active prompts at the same number). */
export const MAX_PROMPTS_PER_RUN = 25;
/** Engine calls in flight per organization: overlaps latency without bursting a provider's limit. */
const ENGINE_CONCURRENCY = 2;
/** Stored answer cap: enough to show and re-analyse, not an archive of every answer. */
const MAX_ANSWER_CHARS = 8000;
const ENGINE_TIMEOUT_MS = 2 * 60_000;
/**
 * A prompt×engine pair answered this recently is not asked again. For the weekly run
 * that makes a replan or a retry within the week free; for a forced run it only makes a
 * retry resume (the API allows one forced run per hour).
 */
const RECENT = {
	scheduled: sql.raw(`interval '6 days'`),
	forced: sql.raw(`interval '30 minutes'`),
};

/**
 * AI visibility (AEO): ask every configured AI engine the organization's buyer
 * questions and record whether — and how — the brand shows up in the answers.
 *
 * Every engine call is paid, and none of them is essential: an engine that errors is
 * stored as a check with its errorCode (so the UI can say "Gemini failed") and the run
 * carries on. The whole run is ONE ledger row (kind `visibility`) so the org's monthly
 * budget sees the spend.
 */
export class VisibilityChecks {
	constructor(private readonly deps: ResearchDeps) {}

	/** Weekly: one visibility-org job per organization with at least one active prompt. */
	async plan() {
		if (this.deps.engines.length === 0) return { queued: 0 };
		const rows = (await this.deps.db.execute(sql`
			select distinct p.organization_id as id
			from visibility_prompts p
			join organizations o on o.id = p.organization_id
			where p.active and o.deleted_at is null
		`)) as unknown as { id: string }[];
		const now = Date.now();
		for (const row of rows) await this.deps.jobs.enqueueVisibilityCheck(row.id, { now });
		return { queued: rows.length };
	}

	async runForOrg(orgId: string, opts: { force: boolean }) {
		const { db, logger, engines } = this.deps;
		const log = logger.child({ organizationId: orgId, task: "visibility" });
		if (engines.length === 0) return { skipped: "no_engines" };

		const brand = await this.brand(orgId);
		if (!brand) return { skipped: "organization_gone" };
		if (await budgetExceeded(db, orgId, this.deps.config.monthlyBudgetUsd)) {
			log.warn("monthly AI budget reached; visibility checks skipped");
			return { skipped: "budget_exceeded" };
		}

		const prompts = await db
			.select({ id: visibilityPrompts.id, prompt: visibilityPrompts.prompt })
			.from(visibilityPrompts)
			.where(and(eq(visibilityPrompts.organizationId, orgId), eq(visibilityPrompts.active, true)))
			.orderBy(asc(visibilityPrompts.createdAt))
			.limit(MAX_PROMPTS_PER_RUN);
		if (prompts.length === 0) return { skipped: "no_prompts" };

		const rivals = await db
			.select({
				id: competitors.id,
				name: competitors.name,
				aliases: competitors.aliases,
				domain: competitors.domain,
			})
			.from(competitors)
			.where(eq(competitors.organizationId, orgId));

		const done = await this.recentlyAnswered(orgId, opts.force);
		const pairs = prompts
			.flatMap((p) => engines.map((engine) => ({ prompt: p, engine })))
			.filter(({ prompt, engine }) => !done.has(`${prompt.id}:${engine.id}`));

		const spent = { costMicros: 0, checks: 0, errors: 0, models: new Set<string>() };
		const started = Date.now();
		try {
			await forEachLimit(pairs, ENGINE_CONCURRENCY, async ({ prompt, engine }) => {
				await this.check(orgId, prompt, engine, brand, rivals, spent);
			});
		} finally {
			// Whatever was paid for is billed, even when an unexpected error ends the run early.
			if (spent.checks > 0 || spent.costMicros > 0) {
				await db.insert(aiGenerations).values({
					organizationId: orgId,
					userId: null,
					kind: "visibility",
					status: spent.checks > spent.errors ? "succeeded" : "failed",
					model: [...spent.models].join(",") || null,
					input: {
						prompts: prompts.length,
						engines: engines.map((e) => e.id),
						checks: spent.checks,
						errors: spent.errors,
						forced: opts.force,
					},
					costMicros: spent.costMicros,
					durationMs: Date.now() - started,
					completedAt: new Date(),
					...(spent.checks > 0 && spent.checks === spent.errors
						? { errorCode: "engines_failed", errorMessage: "Every AI engine call failed" }
						: {}),
				});
			}
		}
		log.info(
			{ checks: spent.checks, errors: spent.errors, costMicros: spent.costMicros },
			"visibility checks done",
		);
		return { checks: spent.checks, errors: spent.errors, costMicros: spent.costMicros };
	}

	private async check(
		orgId: string,
		prompt: { id: string; prompt: string },
		engine: VisibilityEngine,
		brand: { name: string; aliases: string[]; domain: string | null },
		rivals: { id: string; name: string; aliases: string[]; domain: string | null }[],
		spent: { costMicros: number; checks: number; errors: number; models: Set<string> },
	) {
		const { db, fns, logger } = this.deps;
		const base = { organizationId: orgId, promptId: prompt.id, engine: engine.id };
		let answer: Awaited<ReturnType<VisibilityEngine["ask"]>>;
		try {
			answer = await engine.ask(prompt.prompt, { signal: AbortSignal.timeout(ENGINE_TIMEOUT_MS) });
		} catch (error) {
			spent.checks++;
			spent.errors++;
			logger.warn(
				{ err: error, engine: engine.id, promptId: prompt.id },
				"visibility engine failed",
			);
			await db.insert(visibilityChecks).values({
				...base,
				model: engine.model,
				answer: "",
				brandMentioned: false,
				errorCode: isAiError(error) ? error.kind : "internal",
			});
			return;
		}
		spent.checks++;
		spent.costMicros += answer.costMicros;
		spent.models.add(answer.model);

		const mention = fns.analyzeMention(answer.answer, answer.citations, brand, rivals);
		let sentiment: "positive" | "neutral" | "negative" | null = null;
		let sentimentCost = 0;
		const text = this.deps.ai.text;
		if (mention.brandMentioned && text) {
			try {
				const r = await fns.classifySentiment(text, {
					answer: answer.answer,
					brandName: brand.name,
				});
				sentiment = r.output.sentiment;
				sentimentCost = r.costMicros;
				spent.costMicros += r.costMicros;
			} catch (error) {
				// Sentiment is a nice-to-have on top of a paid answer: keep the check without it.
				logger.warn({ err: error, promptId: prompt.id }, "sentiment classification failed");
			}
		}

		await db.insert(visibilityChecks).values({
			...base,
			model: answer.model,
			answer: answer.answer.slice(0, MAX_ANSWER_CHARS),
			brandMentioned: mention.brandMentioned,
			brandRank: mention.brandRank,
			sentiment,
			citations: mention.citations,
			competitorsMentioned: mention.competitorsMentioned,
			costMicros: answer.costMicros + sentimentCost,
		});
	}

	/** Pairs answered successfully within the recent window (errored checks are asked again). */
	private async recentlyAnswered(orgId: string, force: boolean) {
		const rows = await this.deps.db
			.select({ promptId: visibilityChecks.promptId, engine: visibilityChecks.engine })
			.from(visibilityChecks)
			.where(
				and(
					eq(visibilityChecks.organizationId, orgId),
					isNull(visibilityChecks.errorCode),
					sql`${visibilityChecks.checkedAt} > now() - ${force ? RECENT.forced : RECENT.scheduled}`,
				),
			);
		return new Set(rows.map((r) => `${r.promptId}:${r.engine}`));
	}

	/** Brand as recognised in answers: profile name (else the org's name) and website domain. */
	private async brand(orgId: string) {
		const [row] = (await this.deps.db.execute(sql`
			select o.name as org_name, b.brand_name, b.website
			from organizations o
			left join brand_profiles b on b.organization_id = o.id
			where o.id = ${orgId} and o.deleted_at is null
		`)) as unknown as { org_name: string; brand_name: string | null; website: string | null }[];
		if (!row) return null;
		return {
			name: row.brand_name?.trim() || row.org_name,
			aliases: [] as string[],
			domain: domainOf(row.website),
		};
	}
}
