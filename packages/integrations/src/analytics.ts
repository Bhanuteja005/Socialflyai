import type { AccountMetricsDay } from "./types";

/**
 * Small pure helpers shared by the providers' read-only analytics. Kept apart
 * from the adapters so the date arithmetic (the part that is easy to get
 * subtly wrong) is tested once.
 */

export type DayRange = { since: string; until: string };

const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** UTC calendar day of a Date, YYYY-MM-DD. */
export const utcDay = (d: Date): string => d.toISOString().slice(0, 10);

const parseDay = (day: string): number => {
	if (!DATE_RE.test(day)) throw new Error(`Invalid UTC day "${day}" (expected YYYY-MM-DD)`);
	return Date.parse(`${day}T00:00:00.000Z`);
};

export const addDays = (day: string, n: number): string =>
	utcDay(new Date(parseDay(day) + n * DAY_MS));

/** Unix seconds of 00:00 UTC on `day` — the form Meta's `since`/`until` accept. */
export const dayStartSeconds = (day: string): number => Math.floor(parseDay(day) / 1000);

export const dayStartMs = (day: string): number => parseDay(day);

/**
 * Splits an inclusive day range into consecutive inclusive chunks of at most
 * `maxDays` days. Platforms cap how wide one insights request may be (Instagram
 * 30 days, Facebook Pages 90), and asking for more fails the whole request.
 */
export function splitRange(range: DayRange, maxDays: number): DayRange[] {
	const end = parseDay(range.until);
	const out: DayRange[] = [];
	for (let start = parseDay(range.since); start <= end; start += maxDays * DAY_MS) {
		const chunkEnd = Math.min(start + (maxDays - 1) * DAY_MS, end);
		out.push({ since: utcDay(new Date(start)), until: utcDay(new Date(chunkEnd)) });
	}
	return out;
}

/** Today (UTC) if it falls inside the range: "current value" metrics can only be dated today. */
export function todayInRange(range: DayRange, now: Date = new Date()): string | undefined {
	const today = utcDay(now);
	return today >= range.since && today <= range.until ? today : undefined;
}

export const inRange = (day: string, range: DayRange) => day >= range.since && day <= range.until;

/**
 * Meta's daily insight values carry `end_time` = the END of the day they cover
 * (e.g. "2026-09-02T07:00:00+0000" is Sep 1 in Pacific time). Stepping back one
 * day lands inside the covered day. Meta's days are Pacific, not UTC, so the
 * mapping is off by up to 8 hours at the edges — accepted and documented.
 */
export const metaEndTimeToDay = (endTime: string): string =>
	utcDay(new Date(Date.parse(endTime) - DAY_MS));

/** Finite number from a number or numeric string (YouTube sends counts as strings). */
export function num(value: unknown): number | undefined {
	const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
	return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

/** Sum of the numbers that are known; undefined only if none are. Never turns "unknown" into 0. */
export function sumKnown(...values: (number | undefined)[]): number | undefined {
	const known = values.filter((v): v is number => v !== undefined);
	return known.length ? known.reduce((a, b) => a + b, 0) : undefined;
}

/** Drops undefined keys so results serialise (and compare) as "not reported" rather than null. */
export function compact<T extends Record<string, unknown>>(value: T): T {
	return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

export function chunk<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}

/** Collects per-day values from several requests/metrics into sorted AccountMetricsDay rows. */
export class DayAccumulator {
	private readonly days = new Map<string, AccountMetricsDay>();

	constructor(private readonly range: DayRange) {}

	set(day: string, patch: Omit<AccountMetricsDay, "date">) {
		if (!inRange(day, this.range)) return;
		const known = compact(patch);
		if (Object.keys(known).length === 0) return;
		this.days.set(day, { ...(this.days.get(day) ?? { date: day }), ...known });
	}

	result(): AccountMetricsDay[] {
		return [...this.days.values()].sort((a, b) => a.date.localeCompare(b.date));
	}
}

/** Runs `fn` over items with at most `limit` in flight — analytics reads stay modest. */
export async function mapLimit<T, R>(
	items: T[],
	limit: number,
	fn: (item: T) => Promise<R>,
): Promise<R[]> {
	const out: R[] = new Array(items.length);
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const i = next++;
			out[i] = await fn(items[i] as T);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return out;
}
