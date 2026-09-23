import { z } from "zod";

/** Longest range a report may cover (a leap year, inclusive). */
export const MAX_RANGE_DAYS = 366;
/** Default report range: the last 28 days, today included (four whole weeks). */
export const DEFAULT_RANGE_DAYS = 28;

const DAY_MS = 24 * 3600_000;

/** Inclusive number of calendar days from `from` to `to` (YYYY-MM-DD). */
export const spanDays = (from: string, to: string) =>
	Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;

/** The one place range rules live: used by the schemas and again after defaults are applied. */
export const rangeProblem = (from: string, to: string): string | null => {
	if (from > to) return "from must be on or before to";
	if (spanDays(from, to) > MAX_RANGE_DAYS)
		return `A range can cover at most ${MAX_RANGE_DAYS} days`;
	return null;
};

/** A calendar day in the organization's timezone. */
const isoDay = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
	.refine((v) => {
		const d = new Date(`${v}T00:00:00Z`);
		return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
	}, "Not a calendar date");

/** `a,b,c` → uuid[]. Ids from another organization simply match nothing. */
const channelIds = z
	.string()
	.max(4000)
	.optional()
	.transform((v) =>
		v
			? v
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean)
			: undefined,
	)
	.pipe(z.array(z.uuid()).max(100).optional());

const rangeFields = { from: isoDay.optional(), to: isoDay.optional() };

const checkRange = (r: { from?: string; to?: string }, ctx: z.RefinementCtx) => {
	if (!r.from || !r.to) return;
	const problem = rangeProblem(r.from, r.to);
	if (problem) ctx.addIssue({ code: "custom", message: problem, path: ["from"] });
};

export const rangeQuery = z.object(rangeFields).superRefine(checkRange);

export const overviewQuery = z.object({ ...rangeFields, channelIds }).superRefine(checkRange);
export type OverviewQuery = z.infer<typeof overviewQuery>;

export const POST_SORTS = ["publishedAt", "engagements", "impressions"] as const;

export const postsQuery = z
	.object({
		...rangeFields,
		channelIds,
		sort: z.enum(POST_SORTS).default("publishedAt"),
		/** Opaque cursor from the previous page's `nextCursor` (sort=publishedAt only). */
		before: z.string().max(200).optional(),
		limit: z.coerce.number().int().min(1).max(100).default(20),
	})
	.superRefine(checkRange);
export type PostsQuery = z.infer<typeof postsQuery>;

export const bestTimesQuery = z.object({
	channelIds,
	weeks: z.coerce.number().int().min(1).max(52).default(12),
});
export type BestTimesQuery = z.infer<typeof bestTimesQuery>;

export const postIdParam = z.object({ postId: z.uuid() });
export const channelIdParam = z.object({ channelId: z.uuid() });
