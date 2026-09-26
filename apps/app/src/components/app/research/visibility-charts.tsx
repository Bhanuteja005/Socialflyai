"use client";

import { useMemo } from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Line,
	LineChart,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import type { VisibilitySummary } from "@/lib/api-types";
import { formatDay, formatNumber, formatPercent, UNKNOWN } from "@/lib/format";
import { axisLine, axisTick, ChartFigure, DataTable, TooltipBox } from "../analytics/chart-parts";
import { engineName } from "./research-shared";

type Voice = VisibilitySummary["shareOfVoice"][number];
type Week = VisibilitySummary["trend"][number];
type EngineRow = VisibilitySummary["byEngine"][number];

// The brand is the one bar that matters; competitors recede into a neutral.
const BRAND = "var(--chart-1)";
const OTHER = "var(--chart-3)";

const voiceLabel = (v: Voice) => (v.isBrand ? `${v.name} (you)` : v.name);

function VoiceTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: ReadonlyArray<{ payload?: unknown }>;
}) {
	const row = payload?.[0]?.payload as Voice | undefined;
	if (!active || !row) return null;
	return (
		<TooltipBox
			title={voiceLabel(row)}
			rows={[
				{
					label: "Share of mentions",
					value: formatPercent(row.share),
					color: row.isBrand ? BRAND : OTHER,
				},
				{ label: "Mentions", value: formatNumber(row.mentions) },
			]}
		/>
	);
}

/**
 * Share of voice: of all brand mentions in AI answers, how many were you vs each
 * competitor. Ranked horizontal bars — names stay readable and the order is the story.
 */
export function ShareOfVoiceChart({ rows }: { rows: Voice[] }) {
	const data = useMemo(() => [...rows].sort((a, b) => b.share - a.share), [rows]);
	const summary = useMemo(() => {
		const brand = data.find((r) => r.isBrand);
		const rank = brand ? data.indexOf(brand) + 1 : null;
		const leader = data[0];
		return [
			brand
				? `You have ${formatPercent(brand.share)} of brand mentions, ranking ${rank} of ${data.length}.`
				: "Your brand wasn't mentioned in this period.",
			leader && !leader.isBrand ? `${leader.name} leads with ${formatPercent(leader.share)}.` : "",
		]
			.filter(Boolean)
			.join(" ");
	}, [data]);

	return (
		<ChartFigure
			label="Share of voice in AI answers"
			summary={summary}
			table={
				<DataTable
					caption="Share of voice"
					columns={["Brand", "Mentions", "Share"]}
					rows={data.map((r) => ({
						key: r.name,
						cells: [voiceLabel(r), formatNumber(r.mentions), formatPercent(r.share)],
					}))}
				/>
			}
		>
			<BarChart
				responsive
				layout="vertical"
				style={{ width: "100%", height: Math.max(120, data.length * 34 + 28) }}
				data={data}
				margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
				barCategoryGap={6}
				accessibilityLayer={false}
			>
				<CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
				<XAxis
					type="number"
					domain={[0, (max: number) => Math.min(1, Math.max(0.1, Math.ceil(max * 10) / 10))]}
					tick={axisTick}
					tickLine={false}
					axisLine={axisLine}
					tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
				/>
				<YAxis
					type="category"
					dataKey="name"
					width={128}
					tickLine={false}
					axisLine={false}
					interval={0}
					tick={({ x, y, payload }) => {
						const name = String(payload?.value ?? "");
						const row = data.find((r) => r.name === name);
						const text = row ? voiceLabel(row) : name;
						return (
							<text
								x={Number(x) - 6}
								y={y}
								dy={4}
								textAnchor="end"
								fontSize={12}
								fontWeight={row?.isBrand ? 500 : 400}
								fill={row?.isBrand ? "var(--foreground)" : "var(--muted-foreground)"}
							>
								{text.length > 20 ? `${text.slice(0, 19)}…` : text}
							</text>
						);
					}}
				/>
				<Tooltip
					cursor={{ fill: "var(--muted)" }}
					content={(p) => <VoiceTooltip active={p.active} payload={p.payload} />}
					isAnimationActive={false}
				/>
				<Bar dataKey="share" radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
					{data.map((r) => (
						<Cell key={r.name} fill={r.isBrand ? BRAND : OTHER} />
					))}
				</Bar>
			</BarChart>
		</ChartFigure>
	);
}

function WeekTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: ReadonlyArray<{ payload?: unknown }>;
}) {
	const row = payload?.[0]?.payload as Week | undefined;
	if (!active || !row) return null;
	return (
		<TooltipBox
			title={`Week of ${formatDay(row.weekStart, true)}`}
			rows={[
				{ label: "Mention rate", value: formatPercent(row.mentionRate), color: BRAND },
				{ label: "Answers checked", value: formatNumber(row.checks) },
			]}
		/>
	);
}

/** Weekly mention rate: the share of AI answers that named you. */
export function MentionTrendChart({ weeks }: { weeks: Week[] }) {
	const summary = useMemo(() => {
		const known = weeks.filter((w) => w.mentionRate !== null);
		if (!known.length) return "No answers checked in this period.";
		const first = known[0];
		const last = known[known.length - 1];
		return `Weekly mention rate from ${formatDay(first?.weekStart ?? "", true)} to ${formatDay(last?.weekStart ?? "", true)}: ${formatPercent(first?.mentionRate)} to ${formatPercent(last?.mentionRate)}.`;
	}, [weeks]);

	return (
		<ChartFigure
			label="Weekly mention rate"
			summary={summary}
			table={
				<DataTable
					caption="Weekly mention rate"
					columns={["Week of", "Answers checked", "Mention rate"]}
					rows={weeks.map((w) => ({
						key: w.weekStart,
						cells: [
							formatDay(w.weekStart, true),
							formatNumber(w.checks),
							formatPercent(w.mentionRate),
						],
					}))}
				/>
			}
		>
			<LineChart
				responsive
				style={{ width: "100%", height: 220 }}
				data={weeks}
				margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
				accessibilityLayer={false}
			>
				<CartesianGrid vertical={false} stroke="var(--chart-grid)" />
				<XAxis
					dataKey="weekStart"
					tick={axisTick}
					tickLine={false}
					axisLine={axisLine}
					tickFormatter={(v: string) => formatDay(v)}
					minTickGap={12}
				/>
				<YAxis
					domain={[0, 1]}
					width={40}
					tick={axisTick}
					tickLine={false}
					axisLine={false}
					tickCount={5}
					tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
				/>
				<Tooltip
					cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
					content={(p) => <WeekTooltip active={p.active} payload={p.payload} />}
					isAnimationActive={false}
				/>
				<Line
					type="monotone"
					dataKey="mentionRate"
					stroke={BRAND}
					strokeWidth={2}
					// Few weekly points: show them, so a single week still reads as data.
					dot={{ r: 4, fill: BRAND, stroke: "var(--surface-raised)", strokeWidth: 2 }}
					activeDot={{ r: 5, stroke: "var(--surface-raised)", strokeWidth: 2 }}
					connectNulls={false}
					isAnimationActive={false}
				/>
			</LineChart>
		</ChartFigure>
	);
}

const num = "px-4 py-3 text-right font-mono tabular-nums last:pr-5";

export function EngineTable({ rows, models }: { rows: EngineRow[]; models: Map<string, string> }) {
	return (
		<div className="scrollbar-thin relative overflow-x-auto [contain:inline-size]">
			<table className="w-full min-w-[480px] text-sm">
				<caption className="sr-only">Results by AI engine</caption>
				<thead>
					<tr className="border-border border-b bg-surface text-muted-foreground text-xs">
						<th scope="col" className="h-10 px-4 pl-5 text-left font-medium">
							Engine
						</th>
						<th scope="col" className="h-10 px-4 text-right font-medium">
							Answers checked
						</th>
						<th scope="col" className="h-10 px-4 text-right font-medium">
							Mention rate
						</th>
						<th scope="col" className="h-10 px-4 pr-5 text-right font-medium">
							Average rank
						</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-border">
					{rows.map((r) => (
						<tr key={r.engine} className="transition-colors hover:bg-surface">
							<th scope="row" className="px-4 py-3 pl-5 text-left font-normal">
								<span className="font-medium">{engineName(r.engine)}</span>
								{models.get(r.engine) ? (
									<span className="ml-2 font-mono text-[11px] text-muted-foreground">
										{models.get(r.engine)}
									</span>
								) : null}
							</th>
							<td className={num}>{formatNumber(r.checks)}</td>
							<td className={num}>{formatPercent(r.mentionRate)}</td>
							<td className={num}>{r.avgRank === null ? UNKNOWN : `#${r.avgRank.toFixed(1)}`}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
