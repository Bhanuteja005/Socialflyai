/**
 * Minimal time-zone math on top of Intl (no tz database dependency).
 * A "local" value is a wall-clock date/time in a given IANA zone.
 */

export type ZonedParts = {
	year: number;
	month: number; // 1-12
	day: number;
	hour: number;
	minute: number;
	weekday: number; // 0 = Sunday
};

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string) {
	let f = partsFormatters.get(timeZone);
	if (!f) {
		f = new Intl.DateTimeFormat("en-US", {
			timeZone,
			hourCycle: "h23",
			year: "numeric",
			month: "numeric",
			day: "numeric",
			hour: "numeric",
			minute: "numeric",
			second: "numeric",
			weekday: "short",
		});
		partsFormatters.set(timeZone, f);
	}
	return f;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The wall-clock parts of an instant in `timeZone`. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
	const out: Record<string, string> = {};
	for (const p of partsFormatter(timeZone).formatToParts(date)) out[p.type] = p.value;
	return {
		year: Number(out.year),
		month: Number(out.month),
		day: Number(out.day),
		hour: Number(out.hour) % 24,
		minute: Number(out.minute),
		weekday: WEEKDAYS.indexOf(out.weekday ?? "Sun"),
	};
}

/** Offset (ms) of `timeZone` from UTC at `date`. */
function offsetAt(date: Date, timeZone: string) {
	const p = zonedParts(date, timeZone);
	const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, date.getUTCSeconds());
	return asUtc - (date.getTime() - date.getUTCMilliseconds());
}

/** The instant at which the wall clock in `timeZone` reads the given date/time. */
export function zonedToUtc(
	year: number,
	month: number,
	day: number,
	hour: number,
	minute: number,
	timeZone: string,
): Date {
	const guess = Date.UTC(year, month - 1, day, hour, minute);
	const first = guess - offsetAt(new Date(guess), timeZone);
	// Re-evaluate once so instants near a DST change land on the right offset.
	const second = guess - offsetAt(new Date(first), timeZone);
	return new Date(second);
}

/** A plain calendar date (no time, no zone) — the unit of calendar cells. */
export type PlainDate = { year: number; month: number; day: number };

export const dateKey = (d: PlainDate) =>
	`${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;

export function addDays(d: PlainDate, days: number): PlainDate {
	const t = new Date(Date.UTC(d.year, d.month - 1, d.day + days));
	return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

export const weekdayOf = (d: PlainDate) =>
	new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();

export function todayIn(timeZone: string): PlainDate {
	const p = zonedParts(new Date(), timeZone);
	return { year: p.year, month: p.month, day: p.day };
}

export const startOfDayUtc = (d: PlainDate, timeZone: string) =>
	zonedToUtc(d.year, d.month, d.day, 0, 0, timeZone);

/** `YYYY-MM-DDTHH:mm` for <input type="datetime-local">, in `timeZone`. */
export function toLocalInputValue(date: Date, timeZone: string) {
	const p = zonedParts(date, timeZone);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Parses a datetime-local value as wall-clock time in `timeZone`. */
export function fromLocalInputValue(value: string, timeZone: string): Date | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
	if (!m) return null;
	const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
	return zonedToUtc(y, mo, d, h, mi, timeZone);
}

export function browserTimeZone() {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
	} catch {
		return "UTC";
	}
}

export function allTimeZones(): string[] {
	try {
		const zones = Intl.supportedValuesOf("timeZone");
		return zones.includes("UTC") ? zones : ["UTC", ...zones];
	} catch {
		return ["UTC"];
	}
}
