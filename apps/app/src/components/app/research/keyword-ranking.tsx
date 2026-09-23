"use client";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@socialfly/ui/components/dialog";
import { EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import { LineChart as LineChartIcon } from "lucide-react";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { useKeywordRankings } from "@/hooks/use-research";
import type { Keyword, KeywordRankings } from "@/lib/api-types";
import { formatDay } from "@/lib/format";
import { axisLine, axisTick, ChartFigure, DataTable, TooltipBox } from "../analytics/chart-parts";
import { LoadError } from "./research-shared";

const DAYS = 90;

export function KeywordRankingDialog({
	keyword,
	onClose,
}: {
	keyword: Keyword | null;
	onClose: () => void;
}) {
	const rankings = useKeywordRankings(keyword?.id ?? null, DAYS);
	return (
		<Dialog open={keyword !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>Ranking for “{keyword?.keyword}”</DialogTitle>
					<DialogDescription>
						Your best Google position each day over the last {DAYS} days. Higher on the chart is
						better — #1 is the top result.
					</DialogDescription>
				</DialogHeader>
				{rankings.isPending ? (
					<Skeleton className="h-64" />
				) : rankings.isError ? (
					<LoadError
						compact
						title="Couldn't load the ranking history"
						error={rankings.error}
						onRetry={() => void rankings.refetch()}
					/>
				) : (
					<RankingChart keyword={keyword?.keyword ?? ""} days={rankings.data.days} />
				)}
			</DialogContent>
		</Dialog>
	);
}

type Day = KeywordRankings["days"][number];

function RankTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: ReadonlyArray<{ payload?: unknown }>;
}) {
	const row = payload?.[0]?.payload as Day | undefined;
	if (!active || !row) return null;
	return (
		<TooltipBox
			title={formatDay(row.date, true)}
			rows={[
				{
					label: "Position",
					value: row.position === null ? "Not in top 100" : `#${row.position}`,
					color: "var(--chart-1)",
				},
			]}
		/>
	);
}

function RankingChart({ keyword, days }: { keyword: string; days: Day[] }) {
	const ranked = days.filter((d) => d.position !== null);
	const summary = useMemo(() => {
		if (!ranked.length) return `No ranking recorded for ${keyword} in this period.`;
		const best = ranked.reduce((a, b) => ((b.position ?? 999) < (a.position ?? 999) ? b : a));
		const last = ranked[ranked.length - 1];
		return `Ranked on ${ranked.length} of ${days.length} days. Best position #${best.position} on ${formatDay(best.date, true)}. Latest #${last?.position} on ${formatDay(last?.date ?? "", true)}.`;
	}, [ranked, days.length, keyword]);

	if (!ranked.length) {
		return (
			<EmptyState
				compact
				icon={LineChartIcon}
				title="No ranking yet"
				description="We haven't found your site in the top 100 results for this keyword yet, or it hasn't been checked. Tracked keywords are checked about once a day."
			/>
		);
	}

	const worst = Math.max(...ranked.map((d) => d.position ?? 1));
	// Always include #1 so the scale reads as "distance from the top".
	const domain: [number, number] = [1, Math.max(10, Math.ceil(worst / 5) * 5)];
	const interval = Math.max(0, Math.ceil(days.length / 6) - 1);

	return (
		<ChartFigure
			label={`Google position for ${keyword}`}
			summary={summary}
			table={
				<DataTable
					caption={`Daily position for ${keyword}`}
					columns={["Date", "Position", "Page"]}
					rows={[...days].reverse().map((d) => ({
						key: d.date,
						cells: [
							formatDay(d.date, true),
							d.position === null ? "—" : `#${d.position}`,
							d.url ? d.url.replace(/^https?:\/\/(www\.)?/, "") : "—",
						],
					}))}
				/>
			}
		>
			<LineChart
				responsive
				style={{ width: "100%", height: 260 }}
				data={days}
				margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
				accessibilityLayer={false}
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
					reversed
					domain={domain}
					allowDecimals={false}
					width={40}
					tick={axisTick}
					tickLine={false}
					axisLine={false}
					tickFormatter={(v: number) => `#${v}`}
				/>
				<Tooltip
					cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
					content={(p) => <RankTooltip active={p.active} payload={p.payload} />}
					isAnimationActive={false}
				/>
				<Line
					type="monotone"
					dataKey="position"
					stroke="var(--chart-1)"
					strokeWidth={2}
					dot={ranked.length < 3 ? { r: 4, fill: "var(--chart-1)" } : false}
					activeDot={{ r: 4, stroke: "var(--surface-raised)", strokeWidth: 2 }}
					// A gap is a day we didn't rank; bridging it would invent positions.
					connectNulls={false}
					isAnimationActive={false}
				/>
			</LineChart>
		</ChartFigure>
	);
}
