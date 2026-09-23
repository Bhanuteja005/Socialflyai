import { apiEnv as env } from "@socialfly/config";

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
