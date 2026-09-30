"use client";

import type { BadgeTone } from "@socialfly/ui/components/badge";
import { cn } from "@socialfly/ui/utils";
import type { ReactNode } from "react";
import { formatNumber } from "@/lib/format";

/** Solid fill for a status tone, so bars match the badge next to them. */
export const toneFill: Record<BadgeTone, string> = {
	neutral: "bg-subtle-foreground/60",
	outline: "bg-border-strong",
	primary: "bg-primary",
	success: "bg-success",
	warning: "bg-warning",
	danger: "bg-danger",
	info: "bg-info",
	violet: "bg-violet",
};

/** The row above a table: filters on the left, a count or summary on the right. */
export function Toolbar({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
	return (
		<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
			<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
			{aside ? (
				<div className="font-mono text-muted-foreground text-xs tabular-nums" aria-live="polite">
					{aside}
				</div>
			) : null}
		</div>
	);
}

/** Two-letter monochrome tile for a workspace or person, so rows are easy to scan. */
export function Monogram({
	name,
	size = "md",
	className,
}: {
	name: string;
	size?: "sm" | "md" | "lg";
	className?: string;
}) {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	const text = ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : ""))
		.toUpperCase()
		.slice(0, 2);
	return (
		<span
			aria-hidden="true"
			className={cn(
				"flex shrink-0 select-none items-center justify-center rounded-full border border-border bg-muted font-medium font-mono text-muted-foreground",
				size === "sm" && "size-7 text-[11px]",
				size === "md" && "size-8 text-xs",
				size === "lg" && "size-12 text-base",
				className,
			)}
		>
			{text}
		</span>
	);
}

// Grayscale ramp for the ordinary statuses, largest share darkest (docs/design.md §3).
const GRAY_RAMP = ["bg-foreground/80", "bg-foreground/55", "bg-foreground/35", "bg-foreground/20"];

/** Status color only where it means "act on this"; everything else stays gray. */
function fillFor(tone: BadgeTone, rank: number) {
	if (tone === "danger" || tone === "warning") return toneFill[tone];
	return GRAY_RAMP[Math.min(rank, GRAY_RAMP.length - 1)] ?? "bg-foreground/20";
}

/**
 * One bar per status with count and share: grayscale, except failed/warning statuses which keep
 * their status color. The total sits in the caller's header; the percentages are text so the
 * chart reads without color.
 */
export function Distribution({
	counts,
	meta,
	hideEmpty = false,
}: {
	counts: Record<string, number>;
	meta: (key: string) => { label: string; tone: BadgeTone };
	hideEmpty?: boolean;
}) {
	const entries = Object.entries(counts)
		.filter(([, n]) => !hideEmpty || n > 0)
		.sort((a, b) => b[1] - a[1]);
	const total = entries.reduce((sum, [, n]) => sum + n, 0);
	// Rank only the gray entries so the ramp stays evenly spaced around colored ones.
	const fills = new Map<string, string>();
	let rank = 0;
	for (const [key] of entries) {
		const tone = meta(key).tone;
		fills.set(key, fillFor(tone, rank));
		if (tone !== "danger" && tone !== "warning") rank++;
	}
	if (total === 0) {
		return <p className="py-6 text-center text-muted-foreground text-sm">Nothing yet.</p>;
	}
	return (
		<div className="grid gap-5">
			{/* The whole mix at a glance; the list below carries the exact numbers. */}
			<div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
				{entries
					.filter(([, n]) => n > 0)
					.map(([key, n]) => (
						<span
							key={key}
							className={cn("h-full first:rounded-l-full last:rounded-r-full", fills.get(key))}
							style={{ width: `${(n / total) * 100}%` }}
						/>
					))}
			</div>
			<ul className="grid gap-3">
				{entries.map(([key, n]) => {
					const m = meta(key);
					const pct = Math.round((n / total) * 100);
					return (
						<li
							key={key}
							className={cn(
								"grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm",
								n === 0 && "text-subtle-foreground",
							)}
						>
							<span className="flex min-w-0 items-center gap-2">
								<span
									className={cn(
										"size-2 shrink-0 rounded-full",
										fills.get(key),
										n === 0 && "opacity-40",
									)}
									aria-hidden="true"
								/>
								<span className="truncate">{m.label}</span>
							</span>
							<span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
								<span
									className={cn("block h-full rounded-full", fills.get(key))}
									style={{ width: `${pct}%` }}
								/>
							</span>
							<span className="flex w-20 items-baseline justify-end gap-2 font-mono tabular-nums">
								<span>{formatNumber(n)}</span>
								<span className="w-9 text-right text-muted-foreground text-xs">{pct}%</span>
							</span>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
