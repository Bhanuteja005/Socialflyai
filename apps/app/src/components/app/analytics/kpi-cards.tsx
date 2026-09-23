"use client";

import { Skeleton } from "@socialfly/ui/components/feedback";
import type { ReactNode } from "react";
import type { AnalyticsOverview } from "@/lib/api-types";
import { formatCompact, formatNumber, formatPercent, UNKNOWN } from "@/lib/format";
import { relativeChange, sumKnown } from "./analytics-utils";
import { Delta } from "./chart-parts";

function Kpi({
	label,
	value,
	title,
	delta,
}: {
	label: string;
	value: string;
	/** Exact value on hover when the tile shows a compact one. */
	title?: string;
	delta: ReactNode;
}) {
	return (
		<div className="grid content-start gap-1 rounded-lg border border-border bg-surface-raised p-4 shadow-xs">
			<p className="text-muted-foreground text-xs">{label}</p>
			<p className="font-semibold text-2xl tracking-tight" title={title}>
				{value}
			</p>
			<div className="text-xs">{delta}</div>
		</div>
	);
}

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatCompact(Math.abs(n))}`;

export function KpiCards({ data, comparedTo }: { data: AnalyticsOverview; comparedTo: string }) {
	const { totals: t, previousTotals: p } = data;
	const followersChange = sumKnown(data.byChannel.map((c) => c.followersChange));
	const rateDelta =
		t.engagementRate !== null && p.engagementRate !== null && p.engagementRate !== 0
			? t.engagementRate - p.engagementRate
			: null;

	return (
		<div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
			<Kpi
				label="Impressions"
				value={formatCompact(t.impressions)}
				title={formatNumber(t.impressions)}
				delta={
					<Delta value={relativeChange(t.impressions, p.impressions)} comparedTo={comparedTo} />
				}
			/>
			<Kpi
				label="Engagements"
				value={formatCompact(t.engagements)}
				title={formatNumber(t.engagements)}
				delta={
					<Delta value={relativeChange(t.engagements, p.engagements)} comparedTo={comparedTo} />
				}
			/>
			<Kpi
				label="Engagement rate"
				value={formatPercent(t.engagementRate)}
				delta={
					<Delta
						value={rateDelta}
						// Percentage points: "+12% of a 3% rate" would be a confusing way to say +0.4 pts.
						format={(v) => `${Math.abs(v * 100).toFixed(1)} pts`}
						comparedTo={comparedTo}
					/>
				}
			/>
			<Kpi
				label="Posts published"
				value={formatNumber(t.posts)}
				delta={<Delta value={relativeChange(t.posts, p.posts)} comparedTo={comparedTo} />}
			/>
			<Kpi
				label="Follower change"
				value={followersChange === null ? UNKNOWN : signed(followersChange)}
				title={followersChange === null ? "No channel reports followers" : undefined}
				delta={
					<span className="text-subtle-foreground">
						{followersChange === null
							? "Not reported by these platforms"
							: "Net across channels that report it"}
					</span>
				}
			/>
		</div>
	);
}

export function KpiSkeleton() {
	return (
		<div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
			{["a", "b", "c", "d", "e"].map((k) => (
				<div key={k} className="grid gap-2 rounded-lg border border-border p-4">
					<Skeleton className="h-3 w-20" />
					<Skeleton className="h-7 w-16" />
					<Skeleton className="h-3 w-28" />
				</div>
			))}
		</div>
	);
}
