"use client";

import { StatCard } from "@socialfly/ui/components/page";
import type { AnalyticsOverview } from "@/lib/api-types";
import { formatCompact, formatNumber, formatPercent, UNKNOWN } from "@/lib/format";
import { relativeChange, sumKnown } from "./analytics-utils";
import { Delta } from "./chart-parts";

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatCompact(Math.abs(n))}`;

/** Nothing last period but something now: say "New" instead of hiding the change. */
const isNew = (current: number | null, previous: number | null) =>
	previous === 0 && current !== null && current > 0;

export function KpiCards({ data, comparedTo }: { data: AnalyticsOverview; comparedTo: string }) {
	const { totals: t, previousTotals: p } = data;
	const followersChange = sumKnown(data.byChannel.map((c) => c.followersChange));
	const rateDelta =
		t.engagementRate !== null && p.engagementRate !== null && p.engagementRate !== 0
			? t.engagementRate - p.engagementRate
			: null;

	return (
		<div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
			<StatCard
				label="Impressions"
				value={<span title={formatNumber(t.impressions)}>{formatCompact(t.impressions)}</span>}
				hint={
					<Delta
						value={relativeChange(t.impressions, p.impressions)}
						isNew={isNew(t.impressions, p.impressions)}
						comparedTo={comparedTo}
					/>
				}
			/>
			<StatCard
				label="Engagements"
				value={<span title={formatNumber(t.engagements)}>{formatCompact(t.engagements)}</span>}
				hint={
					<Delta
						value={relativeChange(t.engagements, p.engagements)}
						isNew={isNew(t.engagements, p.engagements)}
						comparedTo={comparedTo}
					/>
				}
			/>
			<StatCard
				label="Engagement rate"
				value={formatPercent(t.engagementRate)}
				hint={
					<Delta
						value={rateDelta}
						// Percentage points: "+12% of a 3% rate" would be a confusing way to say +0.4 pts.
						format={(v) => `${Math.abs(v * 100).toFixed(1)} pts`}
						comparedTo={comparedTo}
					/>
				}
			/>
			<StatCard
				label="Posts published"
				value={formatNumber(t.posts)}
				hint={
					<Delta
						value={relativeChange(t.posts, p.posts)}
						isNew={isNew(t.posts, p.posts)}
						comparedTo={comparedTo}
					/>
				}
			/>
			<StatCard
				className="col-span-2 lg:col-span-1"
				label="Follower change"
				value={
					<span
						title={followersChange === null ? "No channel reports followers" : undefined}
						className={followersChange === null ? "text-subtle-foreground" : undefined}
					>
						{followersChange === null ? UNKNOWN : signed(followersChange)}
					</span>
				}
				hint={
					<span className="flex h-5 items-center truncate">
						{followersChange === null ? "Not reported by these platforms" : "Net, where reported"}
					</span>
				}
			/>
		</div>
	);
}

export function KpiSkeleton() {
	return (
		<div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
			{["a", "b", "c", "d", "e"].map((k, i) => (
				<StatCard
					key={k}
					className={i === 4 ? "col-span-2 lg:col-span-1" : undefined}
					label={<span className="sr-only">Loading</span>}
					value={null}
					loading
					hint={<span className="block h-5" />}
				/>
			))}
		</div>
	);
}
