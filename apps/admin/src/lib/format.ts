const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(options: Intl.DateTimeFormatOptions) {
	const key = JSON.stringify(options);
	let f = formatterCache.get(key);
	if (!f) {
		f = new Intl.DateTimeFormat(undefined, options);
		formatterCache.set(key, f);
	}
	return f;
}

const toDate = (value: string | Date) => (typeof value === "string" ? new Date(value) : value);

/** "Sep 22, 2026, 14:30" — staff compare events across tenants, so always date + time. */
export function formatDateTime(value: string | Date) {
	return formatter({
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
	}).format(toDate(value));
}

/** "Sep 22, 2026" */
export function formatDate(value: string | Date) {
	return formatter({ month: "short", day: "numeric", year: "numeric" }).format(toDate(value));
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

export const pluralize = (n: number, one: string, many = `${one}s`) =>
	`${formatNumber(n)} ${n === 1 ? one : many}`;

const num = typeof Intl !== "undefined" ? new Intl.NumberFormat() : null;
export const formatNumber = (n: number) => num?.format(n) ?? String(n);

const usd =
	typeof Intl !== "undefined"
		? new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" })
		: null;

/** "$1.23": AI spend is small, so always two decimals. */
export const formatUsd = (value: number) => usd?.format(value) ?? `$${value.toFixed(2)}`;

/** Per-generation costs are often fractions of a cent, which two decimals would round to $0.00. */
export function formatUsdPrecise(value: number) {
	if (value === 0 || value >= 0.01) return formatUsd(value);
	return `$${value.toFixed(4)}`;
}

/** "needs_reauth" → "Needs reauth". */
export const humanize = (value: string) => {
	const text = value.replace(/[_-]+/g, " ").trim();
	return text.charAt(0).toUpperCase() + text.slice(1);
};

const moneyCache = new Map<string, Intl.NumberFormat | null>();

/** "$1,234.50" in the given ISO currency; amounts in different currencies are never summed. */
export function formatMoney(value: number, currency: string) {
	let f = moneyCache.get(currency);
	if (f === undefined) {
		try {
			f = new Intl.NumberFormat(undefined, { style: "currency", currency });
		} catch {
			f = null;
		}
		moneyCache.set(currency, f);
	}
	return f ? f.format(value) : `${value.toFixed(2)} ${currency}`;
}
