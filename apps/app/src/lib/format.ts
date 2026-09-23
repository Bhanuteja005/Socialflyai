const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string | undefined, options: Intl.DateTimeFormatOptions) {
	const key = `${timeZone ?? ""}|${JSON.stringify(options)}`;
	let f = formatterCache.get(key);
	if (!f) {
		f = new Intl.DateTimeFormat(undefined, { ...options, timeZone });
		formatterCache.set(key, f);
	}
	return f;
}

const toDate = (value: string | Date) => (typeof value === "string" ? new Date(value) : value);

/** "Tue, Sep 22 · 14:30" */
export function formatDateTime(value: string | Date, timeZone?: string) {
	const d = toDate(value);
	return `${formatter(timeZone, { weekday: "short", month: "short", day: "numeric" }).format(d)} · ${formatTime(d, timeZone)}`;
}

/** "Sep 22, 2026" */
export function formatDate(value: string | Date, timeZone?: string) {
	return formatter(timeZone, { month: "short", day: "numeric", year: "numeric" }).format(
		toDate(value),
	);
}

/** "14:30" / "2:30 PM" depending on the locale. */
export function formatTime(value: string | Date, timeZone?: string) {
	return formatter(timeZone, { hour: "numeric", minute: "2-digit" }).format(toDate(value));
}

const rtf =
	typeof Intl !== "undefined" ? new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }) : null;

/** "in 3 hours", "2 days ago". */
export function formatRelative(value: string | Date, now = Date.now()) {
	const diff = toDate(value).getTime() - now;
	const abs = Math.abs(diff);
	const units: [Intl.RelativeTimeFormatUnit, number][] = [
		["year", 365 * 86_400_000],
		["month", 30 * 86_400_000],
		["week", 7 * 86_400_000],
		["day", 86_400_000],
		["hour", 3_600_000],
		["minute", 60_000],
	];
	for (const [unit, ms] of units) {
		if (abs >= ms) return rtf?.format(Math.round(diff / ms), unit) ?? "";
	}
	return "just now";
}

export function formatBytes(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB", "TB"];
	let value = bytes / 1024;
	let i = 0;
	while (value >= 1024 && i < units.length - 1) {
		value /= 1024;
		i++;
	}
	return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

export function formatDuration(ms: number) {
	const total = Math.round(ms / 1000);
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	const pad = (n: number) => String(n).padStart(2, "0");
	return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Short zone label, e.g. "GMT+2" or "PDT". */
export function zoneLabel(timeZone: string, at = new Date()) {
	const part = formatter(timeZone, { timeZoneName: "short" })
		.formatToParts(at)
		.find((p) => p.type === "timeZoneName");
	return part?.value ?? timeZone;
}

export const pluralize = (n: number, one: string, many = `${one}s`) =>
	`${n} ${n === 1 ? one : many}`;

/** Twitter-style weighted length is out of scope; code points are close enough for limits UI. */
export const textLength = (text: string) => [...text].length;

const usd =
	typeof Intl !== "undefined"
		? new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" })
		: null;

/** "$1.23": AI spend is small, so always two decimals. */
export const formatUsd = (value: number) => usd?.format(value) ?? `$${value.toFixed(2)}`;

/** Shown wherever a platform did not report a number — never 0, which would be a claim. */
export const UNKNOWN = "—";

const compact =
	typeof Intl !== "undefined"
		? new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 })
		: null;
const whole = typeof Intl !== "undefined" ? new Intl.NumberFormat() : null;

/** "1.2K", "3.4M"; "—" for unknown. */
export function formatCompact(value: number | null | undefined) {
	if (value === null || value === undefined || Number.isNaN(value)) return UNKNOWN;
	return compact?.format(value) ?? String(value);
}

/** "1,284" — for tooltips and tables where the exact value matters. */
export function formatNumber(value: number | null | undefined) {
	if (value === null || value === undefined || Number.isNaN(value)) return UNKNOWN;
	return whole?.format(value) ?? String(value);
}

/** A 0–1 ratio as "3.4%"; "—" for unknown. */
export function formatPercent(ratio: number | null | undefined) {
	if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return UNKNOWN;
	return `${(ratio * 100).toFixed(1)}%`;
}

/** A calendar day ("2026-09-22") as "Sep 22" — no zone shift, the day is already local. */
export function formatDay(day: string, withYear = false) {
	const [y, m, d] = day.split("-").map(Number) as [number, number, number];
	return formatter("UTC", {
		month: "short",
		day: "numeric",
		...(withYear ? { year: "numeric" } : {}),
	}).format(new Date(Date.UTC(y, m - 1, d)));
}
