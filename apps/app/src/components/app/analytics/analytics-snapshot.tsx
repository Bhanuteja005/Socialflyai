"use client";

import { Button } from "@socialfly/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@socialfly/ui/components/card";
import { Skeleton } from "@socialfly/ui/components/feedback";
import Link from "next/link";
import { useState } from "react";
import { useAnalyticsOverview } from "@/hooks/use-analytics";
import { errorMessage } from "@/lib/errors";
import { formatCompact, formatNumber } from "@/lib/format";
import { todayIn } from "@/lib/timezone";
import { useOrg } from "../org-provider";
import { ProviderIcon } from "../provider-icon";
import { presetRange, relativeChange } from "./analytics-utils";
import { Delta } from "./chart-parts";

/** Dashboard card: the last seven days at a glance, linking to the full analytics page. */
export function AnalyticsSnapshot() {
	const { org } = useOrg();
	// Fixed for this visit so the query key doesn't change at midnight mid-session.
	const [range] = useState(() => presetRange(7, todayIn(org.timezone)));
	const query = useAnalyticsOverview({ from: range.from, to: range.to });
	const top = query.data?.topPosts[0];

	return (
		<Card>
			<CardHeader className="flex-row items-center justify-between">
				<CardTitle>Last 7 days</CardTitle>
				<Button variant="link" size="sm" asChild>
					<Link href="/analytics?range=7">View analytics</Link>
				</Button>
			</CardHeader>
			<CardContent className="grid gap-4">
				{query.isPending ? (
					<>
						<div className="grid grid-cols-2 gap-3">
							<Skeleton className="h-14" />
							<Skeleton className="h-14" />
						</div>
						<Skeleton className="h-10" />
					</>
				) : query.isError ? (
					<div className="grid justify-items-start gap-2 text-sm">
						<p className="text-muted-foreground">{errorMessage(query.error)}</p>
						<Button variant="outline" size="xs" onClick={() => query.refetch()}>
							Retry
						</Button>
					</div>
				) : (
					<>
						<dl className="grid grid-cols-2 gap-3">
							{(
								[
									["Impressions", "impressions"],
									["Engagements", "engagements"],
								] as const
							).map(([label, key]) => (
								<div key={key} className="grid gap-0.5">
									<dt className="text-muted-foreground text-xs">{label}</dt>
									<dd
										className="font-semibold text-xl tracking-tight"
										title={formatNumber(query.data.totals[key])}
									>
										{formatCompact(query.data.totals[key])}
									</dd>
									<dd className="text-[11px]">
										<Delta
											value={relativeChange(query.data.totals[key], query.data.previousTotals[key])}
											comparedTo="vs prior week"
										/>
									</dd>
								</div>
							))}
						</dl>
						{top ? (
							<div className="grid gap-1 border-border border-t pt-3">
								<p className="text-muted-foreground text-xs">Top post</p>
								<Link
									href={`/posts/${top.postId}`}
									className="line-clamp-2 rounded-sm text-sm leading-snug hover:underline focus-visible:outline-2 focus-visible:outline-ring"
								>
									{top.excerpt || "Media post"}
								</Link>
								<p className="flex items-center gap-1.5 text-muted-foreground text-xs">
									<ProviderIcon provider={top.channel.provider} size="xs" />
									<span className="truncate">{top.channel.name}</span>
									<span aria-hidden="true">·</span>
									<span className="whitespace-nowrap">
										{formatCompact(top.engagements)} engagements
									</span>
								</p>
							</div>
						) : (
							<p className="border-border border-t pt-3 text-muted-foreground text-xs">
								Nothing published this week yet. Results show up a few hours after posts go live.
							</p>
						)}
					</>
				)}
			</CardContent>
		</Card>
	);
}
