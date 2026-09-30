"use client";

import { cn } from "@socialfly/ui/utils";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { type ReactNode, useId } from "react";
import { Line, LineChart, YAxis } from "recharts";

/** Axis/grid styling shared by every cartesian chart: hairline, recessive, tabular ticks. */
export const axisTick = {
	fill: "var(--subtle-foreground)",
	fontSize: 11,
	fontFamily: "var(--font-dm-mono), ui-monospace, monospace",
} as const;
export const axisLine = { stroke: "var(--chart-axis)" } as const;

/** Card-styled tooltip body; text wears text tokens, the swatch carries identity. */
export function TooltipBox({ title, rows }: { title: ReactNode; rows: TooltipRow[] }) {
	return (
		<div className="min-w-40 rounded-xl border border-border bg-surface-raised px-3 py-2 text-xs shadow-md">
			<p className="mb-1.5 font-medium text-foreground">{title}</p>
			<ul className="grid gap-1">
				{rows.map((r) => (
					<li key={r.label} className="flex items-center gap-2">
						{r.color ? (
							<span
								className="size-2 shrink-0 rounded-full"
								style={{ background: r.color }}
								aria-hidden="true"
							/>
						) : null}
						<span className="flex-1 text-muted-foreground">{r.label}</span>
						<span className="font-mono text-foreground tabular-nums">{r.value}</span>
					</li>
				))}
			</ul>
		</div>
	);
}

export type TooltipRow = { label: string; value: string; color?: string };

/**
 * A chart with an accessible name, a one-sentence summary for screen readers, and a
 * data-table view — tooltips enhance, they never gate a value.
 */
export function ChartFigure({
	label,
	summary,
	table,
	children,
	className,
}: {
	label: string;
	summary: string;
	table?: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	const summaryId = useId();
	return (
		<figure aria-label={label} aria-describedby={summaryId} className={cn("grid gap-2", className)}>
			<p id={summaryId} className="sr-only">
				{summary}
			</p>
			<div aria-hidden="true">{children}</div>
			{table ? (
				<details className="group text-sm">
					<summary className="w-fit cursor-pointer select-none rounded-sm text-muted-foreground text-xs hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
						<span className="group-open:hidden">Show as table</span>
						<span className="hidden group-open:inline">Hide table</span>
					</summary>
					<div className="scrollbar-thin mt-2 max-h-72 overflow-auto rounded-xl border border-border [contain:inline-size]">
						{table}
					</div>
				</details>
			) : null}
		</figure>
	);
}

/** A plain data table for the "Show as table" view. */
export function DataTable({
	caption,
	columns,
	rows,
}: {
	caption: string;
	columns: string[];
	rows: { key: string; cells: ReactNode[] }[];
}) {
	return (
		<table className="w-full text-xs">
			<caption className="sr-only">{caption}</caption>
			<thead className="sticky top-0 bg-surface">
				<tr>
					{columns.map((c, i) => (
						<th
							key={c}
							scope="col"
							className={cn(
								"px-3 py-2 font-medium text-muted-foreground",
								i === 0 ? "text-left" : "text-right",
							)}
						>
							{c}
						</th>
					))}
				</tr>
			</thead>
			<tbody className="divide-y divide-border">
				{rows.map((r) => (
					<tr key={r.key}>
						{r.cells.map((cell, i) => (
							<td
								// biome-ignore lint/suspicious/noArrayIndexKey: fixed column order
								key={i}
								className={cn(
									"px-3 py-1.5",
									i === 0 ? "text-left" : "text-right font-mono tabular-nums",
								)}
							>
								{cell}
							</td>
						))}
					</tr>
				))}
			</tbody>
		</table>
	);
}

/**
 * Relative change as a short label. Past ~10× a percentage stops meaning anything
 * ("+2624.8%"), so big jumps read as a multiple instead.
 */
export function formatChange(value: number) {
	const abs = Math.abs(value);
	if (value >= 9) return `${Math.round(1 + value)}×`;
	if (abs >= 1) return `${Math.round(abs * 100)}%`;
	return `${(abs * 100).toFixed(1)}%`;
}

/**
 * Change vs the previous period as a small mono arrow + value plus a short "vs …" note, on
 * one line. Up is good for every metric we show, so direction tints the text; the arrow and
 * the screen-reader word carry it too, never colour alone.
 */
export function Delta({
	value,
	format,
	comparedTo,
	isNew,
	className,
}: {
	/** Relative change (0.12 = +12%) or, with a custom format, any signed number. */
	value: number | null;
	format?: (v: number) => string;
	comparedTo: string;
	/** Nothing in the previous period but something now: "New" beats "no comparison". */
	isNew?: boolean;
	className?: string;
}) {
	const known = value !== null && Number.isFinite(value);
	const flat = known && Math.abs(value) < 0.0005;
	const up = known && !flat && value > 0;
	const tone = isNew
		? "text-success"
		: !known || flat
			? "text-subtle-foreground"
			: up
				? "text-success"
				: "text-danger";
	const Icon = isNew ? ArrowUpRight : !known || flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
	const text = isNew
		? "New"
		: !known
			? null
			: flat
				? format
					? format(0)
					: "0%"
				: format
					? format(value)
					: formatChange(value);
	return (
		<span
			className={cn("inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap", className)}
			title={!known && !isNew ? "No earlier data to compare" : undefined}
		>
			<span
				className={cn(
					"inline-flex h-5 shrink-0 items-center gap-0.5 font-mono text-[11.5px] tabular-nums",
					tone,
				)}
			>
				<Icon className="size-3" aria-hidden="true" />
				<span className="sr-only">
					{isNew
						? "new"
						: !known
							? "no earlier data"
							: flat
								? "unchanged"
								: up
									? "up"
									: "down"}{" "}
				</span>
				{text}
			</span>
			<span className="truncate text-muted-foreground">{comparedTo}</span>
		</span>
	);
}

/** A tiny trend line; the numbers beside it are the real content. */
export function Sparkline({
	values,
	color = "var(--chart-1)",
	label,
	className,
}: {
	values: (number | null)[];
	color?: string;
	label: string;
	className?: string;
}) {
	const data = values.map((v, i) => ({ i, v }));
	if (values.filter((v) => v !== null).length < 2) {
		return (
			<span className={cn("text-subtle-foreground text-xs", className)}>Not enough history</span>
		);
	}
	return (
		<div className={cn("h-8 w-28", className)} role="img" aria-label={label}>
			<LineChart
				responsive
				style={{ width: "100%", height: "100%" }}
				data={data}
				margin={{ top: 3, right: 3, bottom: 3, left: 3 }}
				accessibilityLayer={false}
			>
				<YAxis hide domain={["dataMin", "dataMax"]} />
				<Line
					type="monotone"
					dataKey="v"
					stroke={color}
					strokeWidth={2}
					dot={false}
					isAnimationActive={false}
					connectNulls
				/>
			</LineChart>
		</div>
	);
}
