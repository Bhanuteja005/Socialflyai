import { addDays, dateKey, type PlainDate, todayIn } from "@/lib/timezone";

export const PRESETS = [7, 28, 90] as const;
export type Preset = (typeof PRESETS)[number];
export const DEFAULT_PRESET: Preset = 28;

export type RangeSelection =
	| { kind: "preset"; days: Preset; from: string; to: string }
	| { kind: "custom"; days: number; from: string; to: string };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CUSTOM_DAYS = 366;

function parseDay(value: string | null): PlainDate | null {
	if (!value || !DAY_RE.test(value)) return null;
	const [year, month, day] = value.split("-").map(Number) as [number, number, number];
	const t = new Date(Date.UTC(year, month - 1, day));
	// Rejects 2026-02-31 and friends, which Date.UTC would silently roll over.
	if (t.getUTCMonth() !== month - 1) return null;
	return { year, month, day };
}

const dayNumber = (d: PlainDate) => Date.UTC(d.year, d.month - 1, d.day) / 86_400_000;

/** Range from the URL (`range=7|28|90|custom&from&to`), in the org's calendar. */
export function readRange(params: URLSearchParams, timeZone: string): RangeSelection {
	const today = todayIn(timeZone);
	if (params.get("range") === "custom") {
		const from = parseDay(params.get("from"));
		const to = parseDay(params.get("to"));
		if (from && to && dayNumber(from) <= dayNumber(to)) {
			const days = dayNumber(to) - dayNumber(from) + 1;
			if (days <= MAX_CUSTOM_DAYS) {
				return { kind: "custom", days, from: dateKey(from), to: dateKey(to) };
			}
		}
	}
	const raw = Number(params.get("range"));
	const days = (PRESETS as readonly number[]).includes(raw) ? (raw as Preset) : DEFAULT_PRESET;
	return presetRange(days, today);
}

export function presetRange(days: Preset, today: PlainDate): RangeSelection {
	return { kind: "preset", days, from: dateKey(addDays(today, -(days - 1))), to: dateKey(today) };
}

/** Channel ids from the URL (`channels=a,b`). Empty = all channels. */
export function readChannels(params: URLSearchParams): string[] {
	return (params.get("channels") ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean)
		.sort();
}

/**
 * Relative change vs the previous period. Null ("no comparison") when either side is
 * unknown or the previous value is 0 — "+∞%" is not information.
 */
export function relativeChange(current: number | null, previous: number | null): number | null {
	if (current === null || previous === null || previous === 0) return null;
	return (current - previous) / previous;
}

export const WEEKDAYS_LONG = [
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
	"Sunday",
] as const;
export const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

/** "Tuesday 10:00" — weekday 0 = Monday, as the API sends it. */
export const slotLabel = (weekday: number, hour: number) =>
	`${WEEKDAYS_LONG[weekday] ?? ""} ${hourLabel(hour)}`;

/** Sums a nullable metric: null only when every value is null (nothing reported). */
export function sumKnown(values: (number | null | undefined)[]): number | null {
	let total: number | null = null;
	for (const v of values) if (typeof v === "number") total = (total ?? 0) + v;
	return total;
}

export const rangeLabel = (range: RangeSelection) =>
	range.kind === "preset" ? `last ${range.days} days` : `${range.days}-day range`;
