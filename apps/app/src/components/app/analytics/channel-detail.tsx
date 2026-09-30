"use client";

import { Button } from "@socialfly/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@socialfly/ui/components/dialog";
import { Alert, EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import { LineChart as LineChartIcon } from "lucide-react";
import { useId, useMemo } from "react";
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { useChannelAnalytics } from "@/hooks/use-analytics";
import type { ChannelAnalyticsDay } from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { formatCompact, formatDay, formatNumber } from "@/lib/format";
import { providerName } from "@/lib/providers";
import { ProviderIcon } from "../provider-icon";
import { sumKnown } from "./analytics-utils";
import { axisLine, axisTick, ChartFigure, DataTable, TooltipBox } from "./chart-parts";

type Metric = "followers" | "impressions" | "reach" | "profileViews";

const SERIES: Record<Metric, { label: string; color: string }> = {
	followers: { label: "Followers", color: "var(--chart-1)" },
	impressions: { label: "Impressions", color: "var(--chart-2)" },
	reach: { label: "Reach", color: "var(--chart-2)" },
	profileViews: { label: "Profile views", color: "var(--chart-3)" },
};

const known = (days: ChannelAnalyticsDay[], key: Metric) =>
	days.map((d) => d[key]).filter((v): v is number => typeof v === "number");

/**
 * Followers is a level (last known value, change over the range); the others are daily
 * flows, so they sum.
 */
function summarize(days: ChannelAnalyticsDay[]) {
	const followers = known(days, "followers");
	const first = followers[0];
	const last = followers[followers.length - 1];
	return {
		followers: last ?? null,
		followersChange: first !== undefined && last !== undefined ? last - first : null,
		impressions: sumKnown(days.map((d) => d.impressions)),
		reach: sumKnown(days.map((d) => d.reach)),
		profileViews: sumKnown(days.map((d) => d.profileViews)),
	};
}

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatCompact(Math.abs(n))}`;

function Figure({ label, value, hint }: { label: string; value: number | null; hint?: string }) {
	return (
		<div className="grid min-w-0 gap-1 rounded-xl bg-surface px-3 py-2.5">
			<span className="text-muted-foreground text-xs">{label}</span>
			<span className="font-mono text-lg tabular-nums" title={formatNumber(value)}>
				{formatCompact(value)}
			</span>
			{hint ? (
				<span className="font-mono text-[11px] text-muted-foreground tabular-nums">{hint}</span>
			) : null}
		</div>
	);
}

function MetricChart({
	days,
	metric,
	syncId,
}: {
	days: ChannelAnalyticsDay[];
	metric: Metric;
	syncId: string;
}) {
	const gradientId = `channel-${useId().replace(/:/g, "")}`;
	const { label, color } = SERIES[metric];
	const interval = Math.max(0, Math.ceil(days.length / 5) - 1);
	return (
		<div>
			<p className="mb-1 flex items-center gap-2 font-medium text-muted-foreground text-xs">
				<span className="size-2 rounded-full" style={{ background: color }} aria-hidden="true" />
				{label}
			</p>
			<AreaChart
				responsive
				style={{ width: "100%", height: 130 }}
				data={days}
				syncId={syncId}
				margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
				accessibilityLayer={false}
			>
				<defs>
					<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor={color} stopOpacity={0.22} />
						<stop offset="100%" stopColor={color} stopOpacity={0} />
					</linearGradient>
				</defs>
				<CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 3" />
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
					width={44}
					tick={axisTick}
					tickLine={false}
					axisLine={false}
					tickFormatter={(v: number) => formatCompact(v)}
					allowDecimals={false}
					// Follower counts move by a sliver of their total; a zero baseline would flatten them.
					domain={metric === "followers" ? ["auto", "auto"] : [0, "auto"]}
				/>
				<Tooltip
					cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
					content={(p) => {
						const row = p.payload?.[0]?.payload as ChannelAnalyticsDay | undefined;
						if (!p.active || !row) return null;
						return (
							<TooltipBox
								title={formatDay(row.date, true)}
								rows={[{ label, color, value: formatNumber(row[metric]) }]}
							/>
						);
					}}
					isAnimationActive={false}
				/>
				<Area
					type="monotone"
					dataKey={metric}
					stroke={color}
					strokeWidth={2}
					fill={`url(#${gradientId})`}
					dot={false}
					// No connectNulls: days the platform didn't report stay gaps instead of reading as zero.
					activeDot={{ r: 4, stroke: "var(--surface-raised)", strokeWidth: 2 }}
					isAnimationActive={false}
				/>
			</AreaChart>
		</div>
	);
}

function ChannelBody({
	channelId,
	range,
}: {
	channelId: string;
	range: { from: string; to: string };
}) {
	const query = useChannelAnalytics(channelId, range);
	const syncId = `channel-${channelId}`;
	const days = query.data?.days ?? [];
	const totals = useMemo(() => summarize(days), [days]);
	// Only chart what the platform actually reports; an all-empty panel says nothing.
	const charted = (["followers", "impressions", "reach", "profileViews"] as const).filter(
		(m) => known(days, m).length > 0,
	);

	if (query.isPending) {
		return (
			<div className="grid gap-3" aria-busy="true">
				<Skeleton className="h-16 rounded-xl" />
				<Skeleton className="h-40 rounded-xl" />
			</div>
		);
	}
	if (query.isError) {
		return (
			<EmptyState
				compact
				title="Couldn't load this channel"
				description={errorMessage(query.error)}
				action={
					<Button variant="outline" size="sm" onClick={() => query.refetch()}>
						Retry
					</Button>
				}
			/>
		);
	}
	if (!query.data.channel.analyticsSupported) {
		return (
			<Alert>
				{providerName(query.data.channel.provider)} doesn't share account analytics with SocialFly.
			</Alert>
		);
	}
	if (!charted.length) {
		return (
			<EmptyState
				compact
				icon={LineChartIcon}
				title="No account numbers yet"
				description="We collect followers and reach every few hours, so this fills in shortly after connecting."
			/>
		);
	}

	return (
		<div className="grid grid-cols-[minmax(0,1fr)] gap-5">
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
				<Figure
					label="Followers"
					value={totals.followers}
					hint={
						totals.followersChange !== null && totals.followersChange !== 0
							? signed(totals.followersChange)
							: undefined
					}
				/>
				<Figure label="Impressions" value={totals.impressions} />
				<Figure label="Reach" value={totals.reach} />
				<Figure label="Profile views" value={totals.profileViews} />
			</div>
			<ChartFigure
				label="Daily account numbers"
				summary={`${charted.map((m) => SERIES[m].label).join(", ")} per day from ${formatDay(range.from, true)} to ${formatDay(range.to, true)}.`}
				table={
					<DataTable
						caption="Daily account numbers"
						columns={["Date", ...charted.map((m) => SERIES[m].label)]}
						rows={days.map((d) => ({
							key: d.date,
							cells: [formatDay(d.date, true), ...charted.map((m) => formatNumber(d[m]))],
						}))}
					/>
				}
			>
				<div className="grid gap-4">
					{charted.map((m) => (
						<MetricChart key={m} days={days} metric={m} syncId={syncId} />
					))}
				</div>
			</ChartFigure>
		</div>
	);
}

/** Account growth for one channel over the page's range; opened from the channels table. */
export function ChannelDetailDialog({
	channel,
	range,
	rangeLabel,
	onClose,
}: {
	channel: { channelId: string; name: string; provider: string } | null;
	range: { from: string; to: string };
	rangeLabel: string;
	onClose: () => void;
}) {
	return (
		<Dialog open={channel !== null} onOpenChange={(open) => (open ? null : onClose())}>
			<DialogContent className="max-w-2xl">
				{channel ? (
					<>
						<DialogHeader>
							<DialogTitle className="flex min-w-0 items-center gap-2.5">
								<ProviderIcon provider={channel.provider} size="md" />
								<span className="truncate">{channel.name}</span>
							</DialogTitle>
							<DialogDescription>
								{providerName(channel.provider)} · {rangeLabel}
							</DialogDescription>
						</DialogHeader>
						<ChannelBody channelId={channel.channelId} range={range} />
					</>
				) : null}
			</DialogContent>
		</Dialog>
	);
}
