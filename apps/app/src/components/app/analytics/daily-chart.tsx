"use client";

import { useMemo } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import type { AnalyticsDay } from "@/lib/api-types";
import { formatCompact, formatDay, formatNumber } from "@/lib/format";
import { axisLine, axisTick, ChartFigure, DataTable, TooltipBox } from "./chart-parts";

const SYNC = "analytics-daily";
const Y_WIDTH = 44;

const SERIES = {
	impressions: { label: "Impressions", color: "var(--chart-1)" },
	engagements: { label: "Engagements", color: "var(--chart-2)" },
	posts: { label: "Posts published", color: "var(--chart-3)" },
} as const;

function DayTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: ReadonlyArray<{ payload?: unknown }>;
}) {
	const row = payload?.[0]?.payload as AnalyticsDay | undefined;
	if (!active || !row) return null;
	return (
		<TooltipBox
			title={formatDay(row.date, true)}
			rows={[
				{ ...SERIES.impressions, value: formatNumber(row.impressions) },
				{ ...SERIES.engagements, value: formatNumber(row.engagements) },
				{ ...SERIES.posts, value: formatNumber(row.posts) },
			].map(({ label, color, value }) => ({ label, color, value }))}
		/>
	);
}

function peak(days: AnalyticsDay[], key: "impressions" | "engagements") {
	let best: AnalyticsDay | null = null;
	for (const d of days) {
		const v = d[key];
		if (typeof v === "number" && (best === null || v > (best[key] ?? -1))) best = d;
	}
	return best;
}

function PanelTitle({ series }: { series: keyof typeof SERIES }) {
	return (
		<p className="flex items-center gap-2 font-medium text-muted-foreground text-xs">
			<span
				className="h-0.5 w-3 rounded-full"
				style={{ background: SERIES[series].color }}
				aria-hidden="true"
			/>
			{SERIES[series].label}
		</p>
	);
}

/**
 * Impressions and engagements differ by orders of magnitude, so they get their own
 * y-scales as small multiples sharing the x-axis (synced crosshair + one tooltip),
 * never a dual-axis chart.
 */
export function DailyChart({ days }: { days: AnalyticsDay[] }) {
	const summary = useMemo(() => {
		if (!days.length) return "No data for this period.";
		const first = formatDay(days[0]?.date ?? "", true);
		const last = formatDay(days[days.length - 1]?.date ?? "", true);
		const pi = peak(days, "impressions");
		const pe = peak(days, "engagements");
		const posts = days.reduce((s, d) => s + (d.posts ?? 0), 0);
		return [
			`Daily results from ${first} to ${last}.`,
			pi ? `Impressions peaked at ${formatNumber(pi.impressions)} on ${formatDay(pi.date)}.` : "",
			pe ? `Engagements peaked at ${formatNumber(pe.engagements)} on ${formatDay(pe.date)}.` : "",
			`${posts} posts published.`,
		]
			.filter(Boolean)
			.join(" ");
	}, [days]);

	// Sparse ticks: about six labels whatever the range length.
	const interval = Math.max(0, Math.ceil(days.length / 6) - 1);

	const area = (key: "impressions" | "engagements") => (
		<AreaChart
			responsive
			style={{ width: "100%", height: 150 }}
			data={days}
			syncId={SYNC}
			margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
			accessibilityLayer={false}
		>
			<CartesianGrid vertical={false} stroke="var(--chart-grid)" />
			<XAxis dataKey="date" hide />
			<YAxis
				width={Y_WIDTH}
				tick={axisTick}
				tickLine={false}
				axisLine={false}
				tickFormatter={(v: number) => formatCompact(v)}
				allowDecimals={false}
			/>
			<Tooltip
				cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
				content={(p) =>
					key === "impressions" ? <DayTooltip active={p.active} payload={p.payload} /> : null
				}
				isAnimationActive={false}
			/>
			<Area
				type="monotone"
				dataKey={key}
				stroke={SERIES[key].color}
				strokeWidth={2}
				fill={SERIES[key].color}
				fillOpacity={0.1}
				dot={false}
				activeDot={{ r: 4, stroke: "var(--surface-raised)", strokeWidth: 2 }}
				isAnimationActive={false}
			/>
		</AreaChart>
	);

	return (
		<ChartFigure
			label="Daily impressions, engagements and posts"
			summary={summary}
			table={
				<DataTable
					caption="Daily results"
					columns={["Date", "Impressions", "Engagements", "Posts"]}
					rows={days.map((d) => ({
						key: d.date,
						cells: [
							formatDay(d.date, true),
							formatNumber(d.impressions),
							formatNumber(d.engagements),
							formatNumber(d.posts),
						],
					}))}
				/>
			}
		>
			<div className="grid gap-3">
				<div>
					<PanelTitle series="impressions" />
					{area("impressions")}
				</div>
				<div>
					<PanelTitle series="engagements" />
					{area("engagements")}
				</div>
				<div>
					<PanelTitle series="posts" />
					<BarChart
						responsive
						style={{ width: "100%", height: 88 }}
						data={days}
						syncId={SYNC}
						margin={{ top: 6, right: 8, bottom: 0, left: 0 }}
						accessibilityLayer={false}
						barCategoryGap={2}
					>
						<CartesianGrid vertical={false} stroke="var(--chart-grid)" />
						<XAxis
							dataKey="date"
							tick={axisTick}
							tickLine={false}
							axisLine={axisLine}
							interval={interval}
							tickFormatter={(v: string) => formatDay(v)}
							minTickGap={8}
						/>
						<YAxis
							width={Y_WIDTH}
							tick={axisTick}
							tickLine={false}
							axisLine={false}
							allowDecimals={false}
							tickCount={3}
						/>
						<Tooltip
							cursor={{ fill: "var(--muted)" }}
							content={() => null}
							isAnimationActive={false}
						/>
						<Bar
							dataKey="posts"
							fill={SERIES.posts.color}
							maxBarSize={24}
							radius={[4, 4, 0, 0]}
							isAnimationActive={false}
						/>
					</BarChart>
				</div>
			</div>
		</ChartFigure>
	);
}
