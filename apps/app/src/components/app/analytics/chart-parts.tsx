"use client";

import { cn } from "@socialfly/ui/utils";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { type ReactNode, useId } from "react";
import { Line, LineChart, YAxis } from "recharts";

/** Axis/grid styling shared by every cartesian chart: hairline, recessive, tabular ticks. */
export const axisTick = { fill: "var(--subtle-foreground)", fontSize: 11 } as const;
export const axisLine = { stroke: "var(--chart-axis)" } as const;

/** Card-styled tooltip body; text wears text tokens, the swatch carries identity. */
export function TooltipBox({ title, rows }: { title: ReactNode; rows: TooltipRow[] }) {
	return (
		<div className="min-w-40 rounded-md border border-border bg-surface-raised px-3 py-2 text-xs shadow-md">
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
						<span className="font-medium text-foreground tabular-nums">{r.value}</span>
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
					<div className="scrollbar-thin mt-2 max-h-72 overflow-auto rounded-md border border-border">
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
								className={cn("px-3 py-1.5 tabular-nums", i === 0 ? "text-left" : "text-right")}
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
 * Change vs the previous period. Up is good for every metric we show, so direction
 * picks the tone; the arrow and the sign carry it too, never colour alone.
 */
export function Delta({
	value,
	format,
	comparedTo,
	className,
}: {
	/** Relative change (0.12 = +12%) or, with a custom format, any signed number. */
	value: number | null;
	format?: (v: number) => string;
	comparedTo: string;
	className?: string;
}) {
	if (value === null || !Number.isFinite(value)) {
		return (
			<span className={cn("inline-flex items-center gap-1 text-subtle-foreground", className)}>
				<Minus className="size-3.5" aria-hidden="true" />
				No earlier data to compare
			</span>
		);
	}
	const text = format ? format(value) : `${Math.abs(value * 100).toFixed(1)}%`;
	const flat = Math.abs(value) < 0.0005;
	const up = value > 0;
	const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1",
				flat ? "text-muted-foreground" : up ? "text-success" : "text-danger",
				className,
			)}
		>
			<Icon className="size-3.5" aria-hidden="true" />
			<span className="font-medium tabular-nums">
				<span className="sr-only">{flat ? "unchanged" : up ? "up" : "down"} </span>
				{flat ? "0%" : text}
			</span>
			<span className="text-muted-foreground">{comparedTo}</span>
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
