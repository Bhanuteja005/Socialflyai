import { type Database, sql } from "@socialfly/db";

/**
 * Has the organization spent its monthly AI budget?
 *
 * The same rule as apps/api/src/modules/ai/ai.budget.ts (calendar month in UTC; an
 * admin override on the organization wins over the server default; 0 = unlimited),
 * replicated here because the worker cannot import from the API app. Scheduled
 * visibility and SEO runs spend money without a user in the loop, so they must be
 * refused by exactly the rule the API applies to interactive requests. Keep the two
 * in step.
 */
export async function budgetExceeded(
	db: Database,
	orgId: string,
	defaultUsd: number,
	now = new Date(),
): Promise<boolean> {
	const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
	const [row] = (await db.execute(sql`
		select o.ai_monthly_budget_usd as override,
			(select coalesce(sum(g.cost_micros), 0) from ai_generations g
				where g.organization_id = o.id and g.created_at >= ${start.toISOString()}) as used
		from organizations o where o.id = ${orgId}
	`)) as unknown as { override: string | number | null; used: string | number }[];
	if (!row) return false;
	const limitUsd = row.override !== null ? Number(row.override) : defaultUsd;
	if (!(limitUsd > 0)) return false;
	return Number(row.used) >= Math.round(limitUsd * 1_000_000);
}
