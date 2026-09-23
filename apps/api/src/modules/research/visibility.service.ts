import { AppError, notFound } from "@socialfly/core/errors";
import type { Redis } from "@socialfly/core/redis";
import { and, type Database, eq, schema, sql } from "@socialfly/db";
import type { JobProducer } from "@socialfly/queue";
import { assertBudget } from "#src/modules/ai/ai.budget.ts";
import { MAX_ACTIVE_PROMPTS, type UpdatePromptInput } from "./research.schemas.ts";
import { dedupeKey, lockOrg, rate } from "./research.shared.ts";

const { visibilityPrompts, visibilityChecks, competitors } = schema;

/** One manual run per organization per hour: each asks every engine every prompt, all paid. */
const RUN_COOLDOWN_SECONDS = 3600;
const EXCERPT_CHARS = 400;

type Engine = { id: string; model: string };
type Citation = { url: string; domain: string; own: boolean; competitorId?: string };
type CheckRow = typeof visibilityChecks.$inferSelect;

const promptLimit = () =>
	new AppError(
		409,
		"prompt_limit",
		`At most ${MAX_ACTIVE_PROMPTS} prompts can be active — pause or delete one first`,
		{ limit: MAX_ACTIVE_PROMPTS },
	);
const promptExists = () => new AppError(409, "prompt_exists", "This prompt is already on the list");

/**
 * AI visibility (AEO): the buyer questions checked across AI engines, and reports on
 * how often — and how well — the brand shows up in the answers. The checks are run by
 * the worker (apps/worker/src/research/visibility.ts).
 *
 * Report semantics: a check that errored (engine down, refused) is left out of every
 * rate — it says nothing about visibility. Rates are 0–1 fractions, or null when there
 * is no successful check to divide by. Weeks are ISO weeks (Monday) in UTC.
 */
export class VisibilityService {
	constructor(
		private readonly db: Database,
		private readonly jobs: JobProducer,
		private readonly redis: Redis,
		/** Configured engines (ids + models), read at call time so tests can swap them. */
		private readonly engines: () => Engine[],
	) {}

	// ── prompts ─────────────────────────────────────────────────────────────────

	async listPrompts(orgId: string) {
		const rows = (await this.db.execute(sql`
			select p.id, p.prompt, p.active, last.checked_at as "lastCheckedAt",
				s.checks, s.mentions
			from visibility_prompts p
			left join lateral (
				select c.checked_at from visibility_checks c
				where c.prompt_id = p.id order by c.checked_at desc limit 1
			) last on true
			left join lateral (
				select count(*)::int as checks,
					count(*) filter (where c.brand_mentioned)::int as mentions
				from visibility_checks c
				where c.prompt_id = p.id and c.error_code is null
					and c.checked_at > now() - interval '30 days'
			) s on true
			where p.organization_id = ${orgId}
			order by p.created_at, p.id
		`)) as unknown as {
			id: string;
			prompt: string;
			active: boolean;
			lastCheckedAt: Date | string | null;
			checks: number;
			mentions: number;
		}[];
		return {
			items: rows.map((r) => ({
				id: r.id,
				prompt: r.prompt,
				active: r.active,
				lastCheckedAt: r.lastCheckedAt === null ? null : new Date(r.lastCheckedAt).toISOString(),
				mentionRate: rate(r.mentions, r.checks),
			})),
		};
	}

	async createPrompt(orgId: string, prompt: string) {
		const row = await this.db.transaction(async (tx) => {
			await lockOrg(tx, orgId, "research-lists");
			const existing = await tx
				.select({ prompt: visibilityPrompts.prompt, active: visibilityPrompts.active })
				.from(visibilityPrompts)
				.where(eq(visibilityPrompts.organizationId, orgId));
			if (existing.some((p) => dedupeKey(p.prompt) === dedupeKey(prompt))) throw promptExists();
			if (existing.filter((p) => p.active).length >= MAX_ACTIVE_PROMPTS) throw promptLimit();
			const [inserted] = await tx
				.insert(visibilityPrompts)
				.values({ organizationId: orgId, prompt })
				.returning();
			return inserted as typeof visibilityPrompts.$inferSelect;
		});
		return this.promptDto(orgId, row.id);
	}

	async updatePrompt(orgId: string, id: string, input: UpdatePromptInput) {
		await this.db.transaction(async (tx) => {
			await lockOrg(tx, orgId, "research-lists");
			const existing = await tx
				.select({
					id: visibilityPrompts.id,
					prompt: visibilityPrompts.prompt,
					active: visibilityPrompts.active,
				})
				.from(visibilityPrompts)
				.where(eq(visibilityPrompts.organizationId, orgId));
			const current = existing.find((p) => p.id === id);
			if (!current) throw notFound("Prompt");
			if (
				input.prompt !== undefined &&
				existing.some((p) => p.id !== id && dedupeKey(p.prompt) === dedupeKey(input.prompt ?? ""))
			)
				throw promptExists();
			if (
				input.active === true &&
				!current.active &&
				existing.filter((p) => p.active).length >= MAX_ACTIVE_PROMPTS
			)
				throw promptLimit();
			await tx
				.update(visibilityPrompts)
				.set({
					...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
					...(input.active !== undefined ? { active: input.active } : {}),
				})
				.where(and(eq(visibilityPrompts.id, id), eq(visibilityPrompts.organizationId, orgId)));
		});
		return this.promptDto(orgId, id);
	}

	async deletePrompt(orgId: string, id: string) {
		const deleted = await this.db
			.delete(visibilityPrompts)
			.where(and(eq(visibilityPrompts.id, id), eq(visibilityPrompts.organizationId, orgId)))
			.returning({ id: visibilityPrompts.id });
		if (!deleted.length) throw notFound("Prompt");
	}

	private async promptDto(orgId: string, id: string) {
		const { items } = await this.listPrompts(orgId);
		const dto = items.find((p) => p.id === id);
		if (!dto) throw notFound("Prompt");
		return dto;
	}

	// ── run now ─────────────────────────────────────────────────────────────────

	/**
	 * Check now instead of waiting for the weekly run. One per organization per hour
	 * (SET NX with a TTL, whatever the replica count), after the cheaper refusals, so a
	 * request refused for another reason does not burn the hour.
	 */
	async runNow(orgId: string) {
		if (this.engines().length === 0) {
			throw new AppError(
				503,
				"visibility_not_configured",
				"No AI engines are set up for visibility checks on this server",
			);
		}
		const [active] = await this.db
			.select({ id: visibilityPrompts.id })
			.from(visibilityPrompts)
			.where(and(eq(visibilityPrompts.organizationId, orgId), eq(visibilityPrompts.active, true)))
			.limit(1);
		if (!active) throw new AppError(422, "no_prompts", "Add at least one active prompt first");
		await assertBudget(this.db, orgId);

		const key = `research:visibility-run:${orgId}`;
		const acquired = await this.redis.set(key, "1", "EX", RUN_COOLDOWN_SECONDS, "NX");
		if (acquired !== "OK") {
			const ttl = await this.redis.ttl(key);
			throw new AppError(
				429,
				"rate_limited",
				"Visibility checks were run recently — try again later",
				{ retryAfterSeconds: ttl > 0 ? ttl : RUN_COOLDOWN_SECONDS },
			);
		}
		try {
			await this.jobs.enqueueVisibilityCheck(orgId, { force: true });
		} catch (error) {
			// Nothing was queued: do not make the user wait out a cooldown for it.
			await this.redis.del(key);
			throw error;
		}
		return { queued: true as const };
	}

	// ── reports ─────────────────────────────────────────────────────────────────

	async summary(orgId: string, days: number) {
		const since = sql`now() - make_interval(days => ${days})`;
		const ok = sql`c.organization_id = ${orgId} and c.checked_at > ${since} and c.error_code is null`;

		const [overall] = await this.rows<{
			checks: number;
			mentions: number;
			avg_rank: string | null;
			positive: number;
			neutral: number;
			negative: number;
			own_cited: number;
		}>(sql`
			select count(*)::int as checks,
				count(*) filter (where c.brand_mentioned)::int as mentions,
				avg(c.brand_rank) filter (where c.brand_mentioned and c.brand_rank is not null) as avg_rank,
				count(*) filter (where c.brand_mentioned and c.sentiment = 'positive')::int as positive,
				count(*) filter (where c.brand_mentioned and c.sentiment = 'neutral')::int as neutral,
				count(*) filter (where c.brand_mentioned and c.sentiment = 'negative')::int as negative,
				count(*) filter (where exists (
					select 1 from jsonb_array_elements(c.citations) e where (e->>'own')::boolean
				))::int as own_cited
			from visibility_checks c where ${ok}
		`);

		const byEngineRows = await this.rows<{
			engine: string;
			checks: number;
			mentions: number;
			avg_rank: string | null;
		}>(sql`
			select c.engine, count(*)::int as checks,
				count(*) filter (where c.brand_mentioned)::int as mentions,
				avg(c.brand_rank) filter (where c.brand_mentioned and c.brand_rank is not null) as avg_rank
			from visibility_checks c where ${ok}
			group by c.engine order by c.engine
		`);

		const rivalRows = await this.rows<{ id: string; name: string; mentions: number }>(sql`
			select co.id, co.name,
				(select count(*)::int from visibility_checks c
					where ${ok} and co.id = any(c.competitors_mentioned)) as mentions
			from competitors co where co.organization_id = ${orgId}
			order by co.name
		`);

		const trendRows = await this.rows<{ week_start: string; checks: number; mentions: number }>(sql`
			select w.week::date::text as week_start,
				count(c.id)::int as checks,
				count(c.id) filter (where c.brand_mentioned)::int as mentions
			from generate_series(
				date_trunc('week', (now() at time zone 'utc') - make_interval(days => ${days})),
				date_trunc('week', now() at time zone 'utc'),
				interval '1 week'
			) w(week)
			left join visibility_checks c
				on date_trunc('week', c.checked_at at time zone 'utc') = w.week and ${ok}
			group by w.week order by w.week
		`);

		const [last] = await this.rows<{ at: Date | string | null }>(sql`
			select max(c.checked_at) as at from visibility_checks c where c.organization_id = ${orgId}
		`);
		const brandName = await this.brandName(orgId);

		const o = overall ?? {
			checks: 0,
			mentions: 0,
			avg_rank: null,
			positive: 0,
			neutral: 0,
			negative: 0,
			own_cited: 0,
		};
		const configured = this.engines();
		const engineIds = [
			...new Set([...configured.map((e) => e.id), ...byEngineRows.map((r) => r.engine)]),
		];
		const voices = [
			{ name: brandName, isBrand: true, mentions: o.mentions },
			...rivalRows.map((r) => ({ name: r.name, isBrand: false, mentions: r.mentions })),
		];
		const totalVoices = voices.reduce((sum, v) => sum + v.mentions, 0);

		return {
			engines: configured,
			overall: {
				checks: o.checks,
				mentionRate: rate(o.mentions, o.checks),
				avgRank: o.avg_rank === null ? null : Number(o.avg_rank),
				sentiment: { positive: o.positive, neutral: o.neutral, negative: o.negative },
				ownCitationRate: rate(o.own_cited, o.checks),
			},
			byEngine: engineIds.map((engine) => {
				const r = byEngineRows.find((row) => row.engine === engine);
				return {
					engine,
					checks: r?.checks ?? 0,
					mentionRate: r ? rate(r.mentions, r.checks) : null,
					avgRank: r?.avg_rank == null ? null : Number(r.avg_rank),
				};
			}),
			shareOfVoice: voices.map((v) => ({
				...v,
				share: totalVoices > 0 ? v.mentions / totalVoices : 0,
			})),
			trend: trendRows.map((t) => ({
				weekStart: t.week_start,
				checks: t.checks,
				mentionRate: rate(t.mentions, t.checks),
			})),
			lastCheckedAt: last?.at ? new Date(last.at).toISOString() : null,
		};
	}

	async promptChecks(orgId: string, promptId: string, limit: number) {
		const [prompt] = await this.db
			.select({ id: visibilityPrompts.id })
			.from(visibilityPrompts)
			.where(and(eq(visibilityPrompts.id, promptId), eq(visibilityPrompts.organizationId, orgId)))
			.limit(1);
		if (!prompt) throw notFound("Prompt");
		const rows = await this.db
			.select()
			.from(visibilityChecks)
			.where(
				and(eq(visibilityChecks.promptId, promptId), eq(visibilityChecks.organizationId, orgId)),
			)
			.orderBy(sql`${visibilityChecks.checkedAt} desc, ${visibilityChecks.id} desc`)
			.limit(limit);
		const names = await this.competitorNames(orgId);
		return {
			items: rows.map((r) => {
				const { answer, ...rest } = this.checkDto(r, names);
				return { ...rest, answerExcerpt: excerpt(answer) };
			}),
		};
	}

	async check(orgId: string, id: string) {
		const [row] = await this.db
			.select({ check: visibilityChecks, prompt: visibilityPrompts.prompt })
			.from(visibilityChecks)
			.innerJoin(visibilityPrompts, eq(visibilityPrompts.id, visibilityChecks.promptId))
			.where(and(eq(visibilityChecks.id, id), eq(visibilityChecks.organizationId, orgId)))
			.limit(1);
		if (!row) throw notFound("Check");
		return {
			...this.checkDto(row.check, await this.competitorNames(orgId)),
			promptId: row.check.promptId,
			prompt: row.prompt,
		};
	}

	private checkDto(r: CheckRow, names: Map<string, string>) {
		return {
			id: r.id,
			engine: r.engine,
			model: r.model,
			checkedAt: r.checkedAt.toISOString(),
			answer: r.answer,
			brandMentioned: r.brandMentioned,
			brandRank: r.brandRank,
			sentiment: r.sentiment,
			citations: r.citations as Citation[],
			// Competitors deleted since the check are dropped: there is nothing left to name.
			competitors: r.competitorsMentioned.flatMap((cid) => {
				const name = names.get(cid);
				return name ? [{ id: cid, name }] : [];
			}),
			errorCode: r.errorCode,
		};
	}

	private async competitorNames(orgId: string) {
		const rows = await this.db
			.select({ id: competitors.id, name: competitors.name })
			.from(competitors)
			.where(eq(competitors.organizationId, orgId));
		return new Map(rows.map((c) => [c.id, c.name]));
	}

	/** The name the worker matched answers against: brand profile name, else the org's name. */
	private async brandName(orgId: string) {
		const [row] = await this.rows<{ name: string }>(sql`
			select coalesce(nullif(trim(b.brand_name), ''), o.name) as name
			from organizations o left join brand_profiles b on b.organization_id = o.id
			where o.id = ${orgId}
		`);
		return row?.name ?? "";
	}

	private async rows<T>(query: ReturnType<typeof sql>): Promise<T[]> {
		return (await this.db.execute(query)) as unknown as T[];
	}
}

const excerpt = (answer: string) =>
	answer.length > EXCERPT_CHARS ? `${answer.slice(0, EXCERPT_CHARS - 1).trimEnd()}…` : answer;
