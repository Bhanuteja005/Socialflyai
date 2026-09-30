"use client";

import { Button } from "@socialfly/ui/components/button";
import { Card, CardHeader, CardTitle } from "@socialfly/ui/components/card";
import { Skeleton } from "@socialfly/ui/components/feedback";
import { usePostAnalytics } from "@/hooks/use-analytics";
import type { PostAnalyticsTarget } from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { formatCompact, formatNumber, formatPercent, formatRelative } from "@/lib/format";
import { ProviderIcon } from "../provider-icon";
import { Sparkline } from "./chart-parts";
import { LiveLink, Metric } from "./top-posts";

function TargetPerformance({ target }: { target: PostAnalyticsTarget }) {
	const m = target.latest;
	// Engagement growth is the story ("did it take off?"); impressions when a platform
	// reports nothing else.
	const history = target.history.map((h) => h.engagements ?? null);
	const series = history.some((v) => v !== null)
		? { values: history, label: "engagements" }
		: { values: target.history.map((h) => h.impressions ?? null), label: "impressions" };
	const lastCaptured = target.history[target.history.length - 1]?.capturedAt;

	return (
		<li className="grid gap-3 px-5 py-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<span className="flex min-w-0 items-center gap-2">
					<ProviderIcon provider={target.channel.provider} />
					<span className="truncate font-medium text-sm">{target.channel.name}</span>
				</span>
				<LiveLink href={target.externalUrl} provider={target.channel.provider} />
			</div>
			{m ? (
				<div className="flex flex-wrap items-end justify-between gap-4">
					<div className="flex flex-wrap gap-x-5 gap-y-2">
						<Metric
							align="left"
							label="Impressions"
							value={formatCompact(m.impressions)}
							title={formatNumber(m.impressions)}
						/>
						<Metric
							align="left"
							label="Reach"
							value={formatCompact(m.reach)}
							title={formatNumber(m.reach)}
						/>
						<Metric
							align="left"
							label="Engagements"
							value={formatCompact(m.engagements)}
							title={formatNumber(m.engagements)}
						/>
						<Metric align="left" label="Rate" value={formatPercent(m.engagementRate)} />
						<Metric align="left" label="Likes" value={formatCompact(m.likes)} />
						<Metric align="left" label="Comments" value={formatCompact(m.comments)} />
						<Metric align="left" label="Shares" value={formatCompact(m.shares)} />
					</div>
					<div className="grid justify-items-end gap-0.5">
						<Sparkline
							values={series.values}
							color="var(--chart-1)"
							label={`${series.label} growth since publishing`}
						/>
						<span className="text-[11px] text-muted-foreground">
							{series.label === "engagements" ? "Engagements" : "Impressions"} over time
							{lastCaptured ? ` · updated ${formatRelative(lastCaptured)}` : ""}
						</span>
					</div>
				</div>
			) : (
				<p className="text-muted-foreground text-sm">
					No numbers yet. They're collected from the platform every few hours after publishing.
				</p>
			)}
		</li>
	);
}

/** Per-channel results for a published post. Rendered only once something is published. */
export function PostPerformance({ postId }: { postId: string }) {
	const query = usePostAnalytics(postId, true);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Performance</CardTitle>
			</CardHeader>
			{query.isPending ? (
				<div className="grid gap-3 p-5">
					<Skeleton className="h-16" />
				</div>
			) : query.isError ? (
				<div className="flex flex-wrap items-center gap-3 p-5 text-sm">
					<span className="text-muted-foreground">
						Couldn't load results. {errorMessage(query.error)}
					</span>
					<Button variant="outline" size="sm" onClick={() => query.refetch()}>
						Retry
					</Button>
				</div>
			) : query.data.targets.length ? (
				<ul className="mt-2 divide-y divide-border">
					{query.data.targets.map((t) => (
						<TargetPerformance key={t.targetId} target={t} />
					))}
				</ul>
			) : (
				<p className="p-5 text-muted-foreground text-sm">
					Analytics aren't available for the channels this post went to.
				</p>
			)}
		</Card>
	);
}
