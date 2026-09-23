import { microsToUsd, usdToMicros } from "@socialfly/ai";
import { apiEnv as env } from "@socialfly/config";
import { AppError } from "@socialfly/core/errors";
import { type Database, eq, schema, sql } from "@socialfly/db";

/** Start of the budget period: the current calendar month in UTC, the same for every org. */
export const budgetPeriodStart = (now = new Date()) =>
	new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

/**
 * The monthly AI limit that applies to an organization, in USD; null = unlimited.
 * An admin-set override (organizations.ai_monthly_budget_usd) wins over the server
 * default, and 0 means unlimited in both places. Shared by the AI module (enforcement)
 * and the admin console (display), so the two can never disagree.
 */
export const effectiveBudgetUsd = (overrideUsd: number | null) => {
	const limit = overrideUsd ?? env.AI_ORG_MONTHLY_BUDGET_USD;
	return limit > 0 ? limit : null;
};

/**
 * This month's AI spend for an organization against its effective limit. Every paid
 * feature (text, media, research, visibility, SEO) writes ai_generations rows, so one
 * sum covers them all.
 */
export async function orgBudget(db: Database, orgId: string) {
	const { organizations } = schema;
	const start = budgetPeriodStart();
	// One round trip: the override lives on the org row, the spend is summed from the ledger.
	const [row] = await db
		.select({
			override: organizations.aiMonthlyBudgetUsd,
			// Written out qualified: drizzle leaves columns unqualified in single-table queries,
			// and an unqualified "id" inside the subquery would bind to ai_generations.id.
			used: sql<string>`(select coalesce(sum(g.cost_micros), 0) from ai_generations g where g.organization_id = organizations.id and g.created_at >= ${start.toISOString()})`,
		})
		.from(organizations)
		.where(eq(organizations.id, orgId))
		.limit(1);
	const usedMicros = Number(row?.used ?? 0);
	const limitUsd = effectiveBudgetUsd(row?.override ?? null);
	const usedUsd = microsToUsd(usedMicros);
	return {
		summary: {
			limitUsd,
			usedUsd,
			remainingUsd:
				limitUsd === null ? null : microsToUsd(Math.max(0, usdToMicros(limitUsd) - usedMicros)),
			periodStart: start.toISOString(),
		},
		exceeded: limitUsd !== null && usedMicros >= usdToMicros(limitUsd),
	};
}

/**
 * Checked before every paid call. A single call can still overshoot by its own cost —
 * we cannot know that cost up front — but the org cannot keep spending past the limit.
 */
export async function assertBudget(db: Database, orgId: string) {
	const { summary, exceeded } = await orgBudget(db, orgId);
	if (exceeded) {
		throw new AppError(
			429,
			"ai_budget_exceeded",
			`This organization has used its monthly AI budget of $${summary.limitUsd}. It resets at the start of next month.`,
			{ limitUsd: summary.limitUsd, usedUsd: summary.usedUsd },
		);
	}
}
