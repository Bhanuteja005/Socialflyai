"use client";

import { Button } from "@socialfly/ui/components/button";
import { Skeleton } from "@socialfly/ui/components/feedback";
import { Clock } from "lucide-react";
import { useMemo, useState } from "react";
import type { BestTimes } from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { formatNumber, zoneLabel } from "@/lib/format";
import { slotLabel, WEEKDAYS_LONG, WEEKDAYS_SHORT } from "./analytics-utils";
import { ChartFigure, DataTable } from "./chart-parts";

const STEPS = 5;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

/** 0 = nothing posted there; 1..5 = quintiles of the best average. */
function bucket(value: number, max: number) {
	if (max <= 0 || value <= 0) return 0;
	return Math.min(STEPS, Math.max(1, Math.ceil((value / max) * STEPS)));
}

type Shade = { level: number; text: string };

/**
 * One shade + description per weekday×hour. From data: intensity is the average
 * engagement of posts sent then. From defaults: only the recommended slots are shaded,
 * by rank — the org's handful of real posts would be noise.
 */
function shades(data: BestTimes): Map<string, Shade> {
	const out = new Map<string, Shade>();
	if (data.source === "data") {
		const max = Math.max(0, ...data.cells.map((c) => c.avgEngagements ?? 0));
		for (const c of data.cells) {
			const slot = slotLabel(c.weekday, c.hour);
			out.set(`${c.weekday}:${c.hour}`, {
				level: bucket(c.avgEngagements ?? 0, max),
				text:
					c.posts === 0 || c.avgEngagements === null
						? `${slot}: no posts measured yet`
						: `${slot}: ${formatNumber(c.avgEngagements)} avg. engagements from ${c.posts} ${c.posts === 1 ? "post" : "posts"}`,
			});
		}
		return out;
	}
	data.recommendations.forEach((r, i) => {
		out.set(`${r.weekday}:${r.hour}`, {
			// Default scores are all close to 1; rank reads more honestly than their ratio.
			level: Math.max(2, STEPS - i),
			text: `${slotLabel(r.weekday, r.hour)}: suggested time #${i + 1} for these platforms`,
		});
	});
	return out;
}

export function BestTimesPanel({
	query,
}: {
	query: {
		data: BestTimes | undefined;
		isPending: boolean;
		isError: boolean;
		error: unknown;
		refetch: () => unknown;
	};
}) {
	const [hover, setHover] = useState<string | null>(null);
	const data = query.data;
	const grid = useMemo(() => (data ? shades(data) : new Map<string, Shade>()), [data]);

	if (query.isPending) return <Skeleton className="h-64" />;
	if (query.isError || !data) {
		return (
			<div className="grid justify-items-start gap-2 text-sm">
				<p className="text-muted-foreground">
					Couldn't load posting times. {errorMessage(query.error)}
				</p>
				<Button variant="outline" size="sm" onClick={() => query.refetch()}>
					Retry
				</Button>
			</div>
		);
	}

	const fromData = data.source === "data";
	const top = data.recommendations.slice(0, 3);
	const zone = zoneLabel(data.timezone);
	const summary = top.length
		? `Best times to post: ${top.map((r) => slotLabel(r.weekday, r.hour)).join(", ")}.`
		: "Not enough data to recommend posting times yet.";

	return (
		<div className="grid gap-4">
			{top.length ? (
				<div className="grid gap-2">
					<p className="font-medium text-sm">Try posting on</p>
					<ol className="flex flex-wrap gap-2">
						{top.map((r, i) => (
							<li
								key={`${r.weekday}:${r.hour}`}
								className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
							>
								<span className="font-medium text-subtle-foreground text-xs tabular-nums">
									{i + 1}
								</span>
								<Clock className="size-3.5 text-muted-foreground" aria-hidden="true" />
								{slotLabel(r.weekday, r.hour)}
							</li>
						))}
					</ol>
				</div>
			) : null}

			<ChartFigure
				label="Average engagements by weekday and hour"
				summary={summary}
				table={
					fromData ? (
						<DataTable
							caption="Average engagements by weekday and hour"
							columns={["Time", "Posts", "Avg. engagements"]}
							rows={data.cells
								.filter((c) => c.posts > 0)
								.sort((a, b) => (b.avgEngagements ?? 0) - (a.avgEngagements ?? 0))
								.map((c) => ({
									key: `${c.weekday}:${c.hour}`,
									cells: [
										slotLabel(c.weekday, c.hour),
										formatNumber(c.posts),
										formatNumber(c.avgEngagements),
									],
								}))}
						/>
					) : (
						<DataTable
							caption="Recommended posting times"
							columns={["Time", "Rank"]}
							rows={data.recommendations.map((r, i) => ({
								key: `${r.weekday}:${r.hour}`,
								cells: [slotLabel(r.weekday, r.hour), String(i + 1)],
							}))}
						/>
					)
				}
			>
				<div className="scrollbar-thin overflow-x-auto pb-1">
					<div className="grid min-w-[560px] grid-cols-[2.5rem_repeat(24,minmax(0,1fr))] gap-[2px]">
						<span />
						{HOURS.map((h) => (
							<span
								key={h}
								className="pb-1 text-center text-[10px] text-subtle-foreground tabular-nums"
							>
								{h % 3 === 0 ? String(h).padStart(2, "0") : ""}
							</span>
						))}
						{WEEKDAYS_SHORT.map((day, weekday) => (
							<Row key={day} day={day} weekday={weekday} grid={grid} onHover={setHover} />
						))}
					</div>
				</div>
			</ChartFigure>

			<div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs">
				<p className="min-h-4 text-foreground" aria-live="polite">
					{hover ?? (
						<span className="text-muted-foreground">Point at a cell to see its numbers.</span>
					)}
				</p>
				<div className="flex items-center gap-1.5 text-muted-foreground" aria-hidden="true">
					Lower
					{Array.from({ length: STEPS }, (_, i) => i + 1).map((s) => (
						<span
							key={s}
							className="size-3 rounded-[3px]"
							style={{ background: `var(--chart-seq-${s})` }}
						/>
					))}
					Higher engagement
				</div>
			</div>

			<p className="text-muted-foreground text-xs">
				{fromData
					? `Based on your published posts over the last 12 weeks. Times are in ${zone}.`
					: `You don't have enough published posts yet, so these are general best times for these platforms. Times are in ${zone}; they'll adapt once your own results come in.`}
			</p>
		</div>
	);
}

function Row({
	day,
	weekday,
	grid,
	onHover,
}: {
	day: string;
	weekday: number;
	grid: Map<string, Shade>;
	onHover: (text: string) => void;
}) {
	return (
		<>
			<span
				className="flex items-center text-[11px] text-muted-foreground"
				title={WEEKDAYS_LONG[weekday]}
			>
				{day}
			</span>
			{HOURS.map((hour) => {
				const shade = grid.get(`${weekday}:${hour}`);
				const level = shade?.level ?? 0;
				const text = shade?.text ?? `${slotLabel(weekday, hour)}: no data`;
				return (
					// Out of the tab order (the table view is the keyboard path); a button so a
					// tap on touch screens shows the numbers too.
					<button
						key={hour}
						type="button"
						tabIndex={-1}
						title={text}
						onMouseEnter={() => onHover(text)}
						onFocus={() => onHover(text)}
						onClick={() => onHover(text)}
						className="aspect-square min-h-3 cursor-default rounded-[3px] hover:outline-2 hover:outline-foreground/40"
						style={{ background: `var(--chart-seq-${level})` }}
					/>
				);
			})}
		</>
	);
}
