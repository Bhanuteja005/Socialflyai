import type { Post } from "@/lib/api-types";
import {
	addDays,
	dateKey,
	type PlainDate,
	startOfDayUtc,
	weekdayOf,
	zonedParts,
	zonedToUtc,
} from "@/lib/timezone";

export type CalendarView = "month" | "week";

/** Weeks start on Monday. */
export const startOfWeek = (d: PlainDate) => addDays(d, -((weekdayOf(d) + 6) % 7));

export function visibleDays(view: CalendarView, anchor: PlainDate): PlainDate[] {
	if (view === "week") {
		const start = startOfWeek(anchor);
		return Array.from({ length: 7 }, (_, i) => addDays(start, i));
	}
	const first = { year: anchor.year, month: anchor.month, day: 1 };
	const start = startOfWeek(first);
	const nextMonth =
		anchor.month === 12
			? { year: anchor.year + 1, month: 1, day: 1 }
			: { year: anchor.year, month: anchor.month + 1, day: 1 };
	const days: PlainDate[] = [];
	for (let d = start; days.length < 42; d = addDays(d, 1)) {
		// Stop after the week containing the last day of the month.
		if (days.length % 7 === 0 && dateKey(d) >= dateKey(nextMonth)) break;
		days.push(d);
	}
	return days;
}

/** UTC instants bounding the visible days in `timeZone`, for the posts query. */
export function rangeFor(days: PlainDate[], timeZone: string) {
	const first = days[0] ?? { year: 1970, month: 1, day: 1 };
	const last = days.at(-1) ?? first;
	return {
		from: startOfDayUtc(first, timeZone).toISOString(),
		to: new Date(startOfDayUtc(addDays(last, 1), timeZone).getTime() - 1).toISOString(),
	};
}

export function groupByDay(posts: Post[], timeZone: string) {
	const map = new Map<string, Post[]>();
	for (const post of posts) {
		if (!post.scheduledAt) continue;
		const p = zonedParts(new Date(post.scheduledAt), timeZone);
		const key = dateKey(p);
		map.set(key, [...(map.get(key) ?? []), post]);
	}
	for (const list of map.values())
		list.sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));
	return map;
}

export function shift(view: CalendarView, anchor: PlainDate, direction: 1 | -1): PlainDate {
	if (view === "week") return addDays(anchor, 7 * direction);
	const month = anchor.month + direction;
	if (month < 1) return { year: anchor.year - 1, month: 12, day: 1 };
	if (month > 12) return { year: anchor.year + 1, month: 1, day: 1 };
	return { year: anchor.year, month, day: 1 };
}

const monthFormat = new Intl.DateTimeFormat(undefined, {
	month: "long",
	year: "numeric",
	timeZone: "UTC",
});
const shortFormat = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
	timeZone: "UTC",
});

const asUtc = (d: PlainDate) => new Date(Date.UTC(d.year, d.month - 1, d.day));

export function title(view: CalendarView, anchor: PlainDate, days: PlainDate[]) {
	if (view === "month") return monthFormat.format(asUtc(anchor));
	const first = days[0] ?? anchor;
	const last = days.at(-1) ?? anchor;
	return `${shortFormat.format(asUtc(first))} – ${shortFormat.format(asUtc(last))}, ${last.year}`;
}

export const weekdayLabel = (d: PlainDate, style: "short" | "narrow" = "short") =>
	new Intl.DateTimeFormat(undefined, { weekday: style, timeZone: "UTC" }).format(asUtc(d));

/** 09:00 on `day` in the org's zone — the default time when composing from a calendar cell. */
export const composeDateFor = (day: PlainDate, timeZone: string) =>
	zonedToUtc(day.year, day.month, day.day, 9, 0, timeZone).toISOString();
