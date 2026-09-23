/** Weekday 0 = Monday … 6 = Sunday; hour 0–23, both in the organization's timezone. */
export type Slot = { weekday: number; hour: number; score: number };
export type Cell = { weekday: number; hour: number; posts: number; avgEngagements: number | null };

/** Below this many measured posts, averages per weekday×hour are noise: use defaults. */
export const MIN_POSTS_FOR_DATA = 20;
/** A cell needs this many posts before it can be recommended from data. */
export const MIN_POSTS_PER_CELL = 2;
const RECOMMENDATIONS = 3;

/**
 * Starting points for an organization with too little history of its own.
 *
 * These are NOT our statistics. They follow the broad, repeatedly published guidance
 * from social-media scheduling vendors' annual engagement studies (Sprout Social,
 * Hootsuite, Buffer and similar): weekday late mornings for professional networks,
 * late mornings and early evenings for consumer feeds, mid-week afternoons for video.
 * They only order a few sensible slots; once an organization has enough published
 * posts with metrics, its own data replaces them. Scores are relative (1 = best).
 */
const DEFAULT_SLOTS: Record<string, Slot[]> = {
	linkedin: [
		{ weekday: 1, hour: 10, score: 1 },
		{ weekday: 2, hour: 9, score: 0.95 },
		{ weekday: 3, hour: 11, score: 0.9 },
	],
	linkedin_page: [
		{ weekday: 1, hour: 10, score: 1 },
		{ weekday: 2, hour: 9, score: 0.95 },
		{ weekday: 3, hour: 11, score: 0.9 },
	],
	facebook: [
		{ weekday: 2, hour: 11, score: 1 },
		{ weekday: 1, hour: 10, score: 0.95 },
		{ weekday: 3, hour: 18, score: 0.85 },
	],
	instagram: [
		{ weekday: 1, hour: 11, score: 1 },
		{ weekday: 2, hour: 18, score: 0.95 },
		{ weekday: 4, hour: 11, score: 0.9 },
	],
	threads: [
		{ weekday: 1, hour: 11, score: 1 },
		{ weekday: 2, hour: 12, score: 0.95 },
		{ weekday: 3, hour: 18, score: 0.9 },
	],
	x: [
		{ weekday: 1, hour: 9, score: 1 },
		{ weekday: 2, hour: 10, score: 0.95 },
		{ weekday: 3, hour: 9, score: 0.9 },
	],
	reddit: [
		{ weekday: 0, hour: 9, score: 1 },
		{ weekday: 1, hour: 8, score: 0.95 },
		{ weekday: 2, hour: 9, score: 0.9 },
	],
	youtube: [
		{ weekday: 3, hour: 17, score: 1 },
		{ weekday: 4, hour: 16, score: 0.95 },
		{ weekday: 2, hour: 17, score: 0.9 },
	],
};
/** For an organization with no channels yet (or an unknown provider). */
const GENERIC: Slot[] = [
	{ weekday: 1, hour: 10, score: 1 },
	{ weekday: 2, hour: 11, score: 0.95 },
	{ weekday: 3, hour: 18, score: 0.9 },
];

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Slots that suit most of the given platforms: scores are averaged across them. */
export function defaultRecommendations(providers: string[]): Slot[] {
	const known = [...new Set(providers)].filter((p) => DEFAULT_SLOTS[p]);
	if (known.length === 0) return GENERIC;
	const totals = new Map<string, Slot>();
	for (const provider of known) {
		for (const slot of DEFAULT_SLOTS[provider] ?? []) {
			const key = `${slot.weekday}:${slot.hour}`;
			const current = totals.get(key) ?? { weekday: slot.weekday, hour: slot.hour, score: 0 };
			current.score += slot.score / known.length;
			totals.set(key, current);
		}
	}
	return rank([...totals.values()]);
}

/** Best measured cells (with enough posts to mean something), scored relative to the best. */
export function dataRecommendations(cells: Cell[]): Slot[] {
	const eligible = cells.filter(
		(c): c is Cell & { avgEngagements: number } =>
			c.posts >= MIN_POSTS_PER_CELL && c.avgEngagements !== null,
	);
	return rank(eligible.map((c) => ({ weekday: c.weekday, hour: c.hour, score: c.avgEngagements })));
}

function rank(slots: Slot[]): Slot[] {
	const top = slots
		.sort((a, b) => b.score - a.score || a.weekday - b.weekday || a.hour - b.hour)
		.slice(0, RECOMMENDATIONS);
	const best = top[0]?.score ?? 0;
	return top.map((s) => ({ ...s, score: best > 0 ? round2(s.score / best) : 0 }));
}
