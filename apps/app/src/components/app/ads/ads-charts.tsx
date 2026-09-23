"use client";

import { Skeleton } from "@socialfly/ui/components/feedback";
import { useMemo } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/ads";
import type { AdMetricsDay } from "@/lib/api-types";
import { formatCompact, formatDay, formatNumber, formatPercent } from "@/lib/format";
import { axisLine, axisTick, ChartFigure, DataTable, TooltipBox } from "../analytics/chart-parts";

const Y_WIDTH = 52;

/** A KPI tile; `title` carries the exact value when the tile shows a compact one. */
export function AdKpi({
	label,
	value,
	title,
	detail,
}: {
	label: string;
	value: string;
	title?: string;
	detail?: string;
}) {
	return (
		<div className="grid content-start gap-1 rounded-lg border border-border bg-surface-raised p-4 shadow-xs">
			<p className="text-muted-foreground text-xs">{label}</p>
			<p className="font-semibold text-2xl tabular-nums tracking-tight" title={title}>
				{value}
			</p>
			{detail ? <p className="text-subtle-foreground text-xs">{detail}</p> : null}
		</div>
	);
}

export function AdKpiSkeleton({ count = 4 }: { count?: number }) {
	return (
		<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
			{Array.from({ length: count }, (_, i) => `k${i}`).map((k) => (
				<div key={k} className="grid gap-2 rounded-lg border border-border p-4">
					<Skeleton className="h-3 w-20" />
					<Skeleton className="h-7 w-16" />
				</div>
			))}
		</div>
	);
}

type Totals = {
	spend: number | null;
	impressions: number | null;
	clicks: number | null;
	conversions: number | null;
	ctr?: number | null;
	cpc?: number | null;
	cpm?: number | null;
};

/** Spend, impressions, clicks, conversions for ONE currency. */
export function AdKpiRow({ totals, currency }: { totals: Totals; currency: string }) {
	const ctr =
		totals.ctr ??
		(totals.clicks !== null && totals.impressions ? totals.clicks / totals.impressions : null);
	const cpc =
		totals.cpc ?? (totals.spend !== null && totals.clicks ? totals.spend / totals.clicks : null);
	return (
		<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
			<AdKpi
				label={`Spend (${currency})`}
				value={formatMoney(totals.spend, currency)}
				detail={cpc !== null ? `${formatMoney(cpc, currency)} per click` : undefined}
			/>
			<AdKpi
				label="Impressions"
				value={formatCompact(totals.impressions)}
				title={formatNumber(totals.impressions)}
				detail={
					totals.cpm !== null && totals.cpm !== undefined
						? `${formatMoney(totals.cpm, currency)} per 1,000`
						: undefined
				}
			/>
			<AdKpi
				label="Clicks"
				value={formatCompact(totals.clicks)}
				title={formatNumber(totals.clicks)}
				detail={ctr !== null ? `${formatPercent(ctr)} click-through rate` : undefined}
			/>
			<AdKpi
				label="Conversions"
				value={formatCompact(totals.conversions)}
				title={formatNumber(totals.conversions)}
			/>
		</div>
	);
}

function peakSpend(days: { date: string; spend: number }[]) {
	let best: { date: string; spend: number } | null = null;
	for (const d of days) if (!best || d.spend > best.spend) best = d;
	return best;
}

/** Daily spend for one currency as bars — each day is a discrete amount, not a flow. */
export function SpendChart({
	days,
	currency,
	height = 180,
}: {
	days: { date: string; spend: number }[];
	currency: string;
	height?: number;
}) {
	const summary = useMemo(() => {
		if (!days.length) return "No spend in this period.";
		const total = days.reduce((s, d) => s + d.spend, 0);
		const peak = peakSpend(days);
		return [
			`Daily spend in ${currency} from ${formatDay(days[0]?.date ?? "", true)} to ${formatDay(days[days.length - 1]?.date ?? "", true)}.`,
			`Total ${formatMoney(total, currency)}.`,
			peak && peak.spend > 0
				? `Highest on ${formatDay(peak.date)} at ${formatMoney(peak.spend, currency)}.`
				: "",
		]
			.filter(Boolean)
			.join(" ");
	}, [days, currency]);

	const interval = Math.max(0, Math.ceil(days.length / 6) - 1);

	return (
		<ChartFigure
			label={`Daily spend (${currency})`}
			summary={summary}
			table={
				<DataTable
					caption={`Daily spend in ${currency}`}
					columns={["Date", "Spend"]}
					rows={days.map((d) => ({
						key: d.date,
						cells: [formatDay(d.date, true), formatMoney(d.spend, currency)],
					}))}
				/>
			}
		>
			<BarChart
				responsive
				style={{ width: "100%", height }}
				data={days}
				margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
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
					tickFormatter={(v: number) => formatMoney(v, currency, true)}
				/>
				<Tooltip
					cursor={{ fill: "var(--muted)" }}
					isAnimationActive={false}
					content={({ active, payload }) => {
						const row = payload?.[0]?.payload as { date: string; spend: number } | undefined;
						if (!active || !row) return null;
						return (
							<TooltipBox
								title={formatDay(row.date, true)}
								rows={[
									{
										label: "Spend",
										value: formatMoney(row.spend, currency),
										color: "var(--chart-1)",
									},
								]}
							/>
						);
					}}
				/>
				<Bar
					dataKey="spend"
					fill="var(--chart-1)"
					maxBarSize={24}
					radius={[4, 4, 0, 0]}
					isAnimationActive={false}
				/>
			</BarChart>
		</ChartFigure>
	);
}

const SYNC = "ad-campaign-daily";

/**
 * A campaign's daily delivery. Spend (money) and impressions/clicks (counts) have
 * different scales, so they're small multiples sharing the x-axis, never a dual axis.
 */
export function CampaignDailyChart({ days, currency }: { days: AdMetricsDay[]; currency: string }) {
	const interval = Math.max(0, Math.ceil(days.length / 6) - 1);
	const summary = useMemo(() => {
		if (!days.length) return "No delivery yet.";
		const peak = peakSpend(days);
		const clicks = days.reduce((s, d) => s + (d.clicks ?? 0), 0);
		return [
			`Daily delivery from ${formatDay(days[0]?.date ?? "", true)} to ${formatDay(days[days.length - 1]?.date ?? "", true)}.`,
			peak && peak.spend > 0
				? `Spend was highest on ${formatDay(peak.date)} at ${formatMoney(peak.spend, currency)}.`
				: "",
			`${formatNumber(clicks)} clicks in total.`,
		]
			.filter(Boolean)
			.join(" ");
	}, [days, currency]);

	const tooltip = ({
		active,
		payload,
	}: {
		active?: boolean;
		payload?: ReadonlyArray<{ payload?: unknown }>;
	}) => {
		const row = payload?.[0]?.payload as AdMetricsDay | undefined;
		if (!active || !row) return null;
		return (
			<TooltipBox
				title={formatDay(row.date, true)}
				rows={[
					{ label: "Spend", value: formatMoney(row.spend, currency), color: "var(--chart-1)" },
					{ label: "Impressions", value: formatNumber(row.impressions), color: "var(--chart-2)" },
					{ label: "Clicks", value: formatNumber(row.clicks), color: "var(--chart-3)" },
					{ label: "Conversions", value: formatNumber(row.conversions) },
				]}
			/>
		);
	};

	const panel = (key: "impressions" | "clicks", color: string, label: string, withAxis = false) => (
		<div>
			<PanelTitle color={color} label={label} />
			<AreaChart
				responsive
				style={{ width: "100%", height: withAxis ? 132 : 110 }}
				data={days}
				syncId={SYNC}
				margin={{ top: 6, right: 8, bottom: 0, left: 0 }}
				accessibilityLayer={false}
			>
				<CartesianGrid vertical={false} stroke="var(--chart-grid)" />
				<XAxis
					dataKey="date"
					hide={!withAxis}
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
					tickFormatter={(v: number) => formatCompact(v)}
					allowDecimals={false}
					tickCount={3}
				/>
				<Tooltip
					cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
					content={() => null}
					isAnimationActive={false}
				/>
				<Area
					type="monotone"
					dataKey={key}
					stroke={color}
					strokeWidth={2}
					fill={color}
					fillOpacity={0.1}
					dot={false}
					activeDot={{ r: 4, stroke: "var(--surface-raised)", strokeWidth: 2 }}
					isAnimationActive={false}
					connectNulls
				/>
			</AreaChart>
		</div>
	);

	return (
		<ChartFigure
			label="Daily spend, impressions and clicks"
			summary={summary}
			table={
				<DataTable
					caption="Daily delivery"
					columns={["Date", "Spend", "Impressions", "Clicks", "Conversions"]}
					rows={days.map((d) => ({
						key: d.date,
						cells: [
							formatDay(d.date, true),
							formatMoney(d.spend, currency),
							formatNumber(d.impressions),
							formatNumber(d.clicks),
							formatNumber(d.conversions),
						],
					}))}
				/>
			}
		>
			<div className="grid gap-3">
				<div>
					<PanelTitle color="var(--chart-1)" label={`Spend (${currency})`} />
					<BarChart
						responsive
						style={{ width: "100%", height: 140 }}
						data={days}
						syncId={SYNC}
						margin={{ top: 6, right: 8, bottom: 0, left: 0 }}
						accessibilityLayer={false}
						barCategoryGap={2}
					>
						<CartesianGrid vertical={false} stroke="var(--chart-grid)" />
						<XAxis dataKey="date" hide />
						<YAxis
							width={Y_WIDTH}
							tick={axisTick}
							tickLine={false}
							axisLine={false}
							tickFormatter={(v: number) => formatMoney(v, currency, true)}
							tickCount={3}
						/>
						<Tooltip
							cursor={{ fill: "var(--muted)" }}
							content={(p) => tooltip({ active: p.active, payload: p.payload })}
							isAnimationActive={false}
						/>
						<Bar
							dataKey="spend"
							fill="var(--chart-1)"
							maxBarSize={24}
							radius={[4, 4, 0, 0]}
							isAnimationActive={false}
						/>
					</BarChart>
				</div>
				{panel("impressions", "var(--chart-2)", "Impressions")}
				{panel("clicks", "var(--chart-3)", "Clicks", true)}
			</div>
		</ChartFigure>
	);
}

function PanelTitle({ color, label }: { color: string; label: string }) {
	return (
		<p className="flex items-center gap-2 font-medium text-muted-foreground text-xs">
			<span className="h-0.5 w-3 rounded-full" style={{ background: color }} aria-hidden="true" />
			{label}
		</p>
	);
}

type CampaignSpend = { campaignId: string; name: string; spend: number };

const TOP = 8;

/**
 * Where the money went in one currency: spend per campaign, largest first. Horizontal
 * bars so long campaign names stay readable; past the top eight the rest fold into "Other".
 */
export function SpendByCampaignChart({
	rows,
	currency,
}: {
	rows: CampaignSpend[];
	currency: string;
}) {
	const sorted = [...rows].sort((a, b) => b.spend - a.spend);
	const top = sorted.slice(0, TOP);
	const rest = sorted.slice(TOP);
	const data = rest.length
		? [
				...top,
				{
					campaignId: "other",
					name: `Other (${rest.length})`,
					spend: Math.round(rest.reduce((s, r) => s + r.spend, 0) * 100) / 100,
				},
			]
		: top;
	const total = sorted.reduce((s, r) => s + r.spend, 0);
	const leader = sorted[0];
	const summary = leader
		? `Spend by campaign in ${currency}: ${formatMoney(total, currency)} across ${sorted.length} campaigns. ${leader.name} spent the most, ${formatMoney(leader.spend, currency)}.`
		: `No spend in ${currency}.`;

	return (
		<ChartFigure
			label={`Spend by campaign (${currency})`}
			summary={summary}
			table={
				<DataTable
					caption={`Spend by campaign in ${currency}`}
					columns={["Campaign", "Spend"]}
					rows={sorted.map((r) => ({
						key: r.campaignId,
						cells: [r.name, formatMoney(r.spend, currency)],
					}))}
				/>
			}
		>
			<BarChart
				responsive
				layout="vertical"
				style={{ width: "100%", height: Math.max(80, data.length * 34 + 28) }}
				data={data}
				margin={{ top: 4, right: 16, bottom: 0, left: 0 }}
				accessibilityLayer={false}
				barCategoryGap={6}
			>
				<CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
				<XAxis
					type="number"
					tick={axisTick}
					tickLine={false}
					axisLine={axisLine}
					tickFormatter={(v: number) => formatMoney(v, currency, true)}
				/>
				<YAxis
					type="category"
					dataKey="name"
					width={140}
					tick={axisTick}
					tickLine={false}
					axisLine={false}
					tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
				/>
				<Tooltip
					cursor={{ fill: "var(--muted)" }}
					isAnimationActive={false}
					content={({ active, payload }) => {
						const row = payload?.[0]?.payload as CampaignSpend | undefined;
						if (!active || !row) return null;
						return (
							<TooltipBox
								title={row.name}
								rows={[
									{
										label: "Spend",
										value: formatMoney(row.spend, currency),
										color: "var(--chart-1)",
									},
									{ label: "Share", value: total ? formatPercent(row.spend / total) : "—" },
								]}
							/>
						);
					}}
				/>
				<Bar
					dataKey="spend"
					fill="var(--chart-1)"
					maxBarSize={22}
					radius={[0, 4, 4, 0]}
					isAnimationActive={false}
				/>
			</BarChart>
		</ChartFigure>
	);
}
