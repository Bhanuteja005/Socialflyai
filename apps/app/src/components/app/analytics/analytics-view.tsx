"use client";

import { Button } from "@socialfly/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@socialfly/ui/components/card";
import { Alert, EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@socialfly/ui/components/tabs";
import { BarChart3, Info, Radio, RefreshCw, Send } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { useChannels } from "@/hooks/queries";
import { useAnalyticsOverview, useBestTimes, useRefreshAnalytics } from "@/hooks/use-analytics";
import type { AnalyticsOverview, AnalyticsSort } from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { formatDateTime, formatRelative } from "@/lib/format";
import { useOrg } from "../org-provider";
import { PageHeader } from "../page-header";
import { ChannelFilter, RangePicker } from "./analytics-filters";
import { DEFAULT_PRESET, readChannels, readRange } from "./analytics-utils";
import { BestTimesPanel } from "./best-times";
import { ChannelTable } from "./channel-table";
import { DailyChart } from "./daily-chart";
import { KpiCards, KpiSkeleton } from "./kpi-cards";
import { PostsTable, SORTS } from "./posts-table";
import { TopPosts } from "./top-posts";

type View = "overview" | "posts";

export function AnalyticsView() {
	const { org, can } = useOrg();
	const params = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();
	const channels = useChannels();

	const range = readRange(params, org.timezone);
	const selected = readChannels(params);
	const channelIds = selected.length ? selected.join(",") : undefined;
	const view: View = params.get("view") === "posts" ? "posts" : "overview";
	const sortParam = params.get("sort");
	const sort: AnalyticsSort = SORTS.some((s) => s.value === sortParam)
		? (sortParam as AnalyticsSort)
		: "publishedAt";

	const hasChannels = channels.isSuccess && channels.data.length > 0;
	const overview = useAnalyticsOverview(
		{ from: range.from, to: range.to, channelIds },
		hasChannels,
	);
	const bestTimes = useBestTimes(channelIds ?? "");
	const refresh = useRefreshAnalytics();

	const update = (changes: Record<string, string | null>) => {
		const next = new URLSearchParams(params);
		for (const [k, v] of Object.entries(changes)) {
			if (v === null) next.delete(k);
			else next.set(k, v);
		}
		router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
	};

	const comparedTo = `vs previous ${range.days} days`;
	const lastCollectedAt = overview.data?.lastCollectedAt ?? null;

	const header = (
		<PageHeader
			title="Analytics"
			description="How your published posts are doing, across every channel."
			actions={
				hasChannels ? (
					<>
						<span
							className="text-muted-foreground text-xs"
							title={lastCollectedAt ? formatDateTime(lastCollectedAt, org.timezone) : undefined}
						>
							{overview.isPending
								? null
								: lastCollectedAt
									? `Updated ${formatRelative(lastCollectedAt)}`
									: "Not collected yet"}
						</span>
						{can("editor") ? (
							<Button
								variant="outline"
								size="sm"
								loading={refresh.isPending}
								onClick={() => refresh.mutate()}
							>
								{refresh.isPending ? null : <RefreshCw />}
								Refresh data
							</Button>
						) : null}
					</>
				) : null
			}
		/>
	);

	if (channels.isPending) {
		return (
			<>
				{header}
				<KpiSkeleton />
			</>
		);
	}
	if (channels.isError) {
		return (
			<>
				{header}
				<EmptyState
					title="Couldn't load your channels"
					description={errorMessage(channels.error)}
					action={
						<Button variant="outline" onClick={() => channels.refetch()}>
							Retry
						</Button>
					}
				/>
			</>
		);
	}
	if (!hasChannels) {
		return (
			<>
				{header}
				<EmptyState
					icon={Radio}
					title="Connect a channel to see analytics"
					description="Once you publish to a connected account, its impressions, engagements and follower growth show up here."
					action={
						can("admin") ? (
							<Button asChild>
								<Link href="/channels">Connect a channel</Link>
							</Button>
						) : (
							<span className="text-muted-foreground text-xs">
								Ask an admin to connect your accounts.
							</span>
						)
					}
				/>
			</>
		);
	}

	return (
		<>
			{header}
			<div className="mb-5 flex flex-wrap items-center justify-between gap-3">
				<RangePicker
					// Remount when the URL range changes so the custom inputs reset to it.
					key={`${range.from}:${range.to}`}
					range={range}
					onPreset={(days) =>
						update({
							range: days === DEFAULT_PRESET ? null : String(days),
							from: null,
							to: null,
						})
					}
					onCustom={(from, to) => update({ range: "custom", from, to })}
				/>
				<ChannelFilter
					channels={channels.data}
					selected={selected}
					onChange={(ids) => update({ channels: ids.length ? ids.join(",") : null })}
				/>
			</div>

			<Tabs value={view} onValueChange={(v) => update({ view: v === "posts" ? "posts" : null })}>
				<TabsList className="mb-5" aria-label="Analytics views">
					<TabsTrigger value="overview">Overview</TabsTrigger>
					<TabsTrigger value="posts">All posts</TabsTrigger>
				</TabsList>
				<TabsContent value="overview">
					<Overview
						overview={overview}
						comparedTo={comparedTo}
						timeZone={org.timezone}
						bestTimes={bestTimes}
						onShowPosts={() => update({ view: "posts" })}
					/>
				</TabsContent>
				<TabsContent value="posts">
					<Card>
						<CardHeader className="pb-4">
							<CardTitle>All published posts</CardTitle>
						</CardHeader>
						<PostsTable
							from={range.from}
							to={range.to}
							channelIds={channelIds}
							sort={sort}
							onSort={(s) => update({ sort: s === "publishedAt" ? null : s })}
							timeZone={org.timezone}
						/>
					</Card>
				</TabsContent>
			</Tabs>
		</>
	);
}

function Overview({
	overview,
	comparedTo,
	timeZone,
	bestTimes,
	onShowPosts,
}: {
	overview: ReturnType<typeof useAnalyticsOverview>;
	comparedTo: string;
	timeZone: string;
	bestTimes: ReturnType<typeof useBestTimes>;
	onShowPosts: () => void;
}) {
	if (overview.isPending) {
		return (
			<div className="grid gap-6" aria-busy="true">
				<KpiSkeleton />
				<Skeleton className="h-96" />
				<div className="grid gap-6 lg:grid-cols-2">
					<Skeleton className="h-64" />
					<Skeleton className="h-64" />
				</div>
			</div>
		);
	}
	if (overview.isError) {
		return (
			<EmptyState
				title="Couldn't load analytics"
				description={errorMessage(overview.error)}
				action={
					<Button variant="outline" onClick={() => overview.refetch()}>
						Retry
					</Button>
				}
			/>
		);
	}

	const data = overview.data;
	const published = (data.totals.posts ?? 0) > 0;

	return (
		<div className="grid gap-6" aria-busy={overview.isFetching || undefined}>
			<KpiCards data={data} comparedTo={comparedTo} />
			<SupportNotice data={data} />

			{published ? (
				<Card>
					<CardHeader>
						<CardTitle>Performance over time</CardTitle>
					</CardHeader>
					<CardContent>
						<DailyChart days={data.daily} />
					</CardContent>
				</Card>
			) : (
				<EmptyState
					icon={Send}
					title="No published posts in this period"
					description="Metrics appear after a post is published. We collect them from each platform every few hours, so new posts fill in shortly after they go live."
				/>
			)}

			<div className="grid items-start gap-6 xl:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Channels</CardTitle>
					</CardHeader>
					<div className="mt-3">
						<ChannelTable rows={data.byChannel} />
					</div>
				</Card>
				<Card>
					<CardHeader className="flex-row items-center justify-between">
						<CardTitle>Top posts</CardTitle>
						{data.topPosts.length ? (
							<Button variant="link" size="sm" onClick={onShowPosts}>
								All posts
							</Button>
						) : null}
					</CardHeader>
					{data.topPosts.length ? (
						<div className="mt-2">
							<TopPosts posts={data.topPosts} timeZone={timeZone} />
						</div>
					) : (
						<CardContent>
							<EmptyState
								compact
								icon={BarChart3}
								title="No results yet"
								description="Your best posts in this period show up here once their numbers come in."
							/>
						</CardContent>
					)}
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Best time to post</CardTitle>
				</CardHeader>
				<CardContent>
					<BestTimesPanel query={bestTimes} />
				</CardContent>
			</Card>
		</div>
	);
}

/** Says so when some or all of the shown channels can't report analytics at all. */
function SupportNotice({ data }: { data: AnalyticsOverview }) {
	const unsupported = useMemo(
		() => data.byChannel.filter((c) => !c.analyticsSupported),
		[data.byChannel],
	);
	if (!unsupported.length) return null;
	if (unsupported.length === data.byChannel.length) {
		return (
			<Alert tone="warning" icon={Info} title="Analytics aren't available for these channels">
				The platforms you picked don't share post metrics with apps like SocialFly, so there's
				nothing to show. Choose other channels to see their results.
			</Alert>
		);
	}
	return (
		<Alert tone="info" icon={Info}>
			{unsupported.map((c) => c.name).join(", ")} {unsupported.length === 1 ? "doesn't" : "don't"}{" "}
			share analytics, so {unsupported.length === 1 ? "it isn't" : "they aren't"} counted in these
			totals.
		</Alert>
	);
}
