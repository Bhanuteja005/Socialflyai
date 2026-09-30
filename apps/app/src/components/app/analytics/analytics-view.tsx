"use client";

import { Button } from "@socialfly/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@socialfly/ui/components/card";
import { EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@socialfly/ui/components/tabs";
import {
	ArrowRight,
	BarChart3,
	Info,
	LayoutDashboard,
	Radio,
	RefreshCw,
	Rows3,
	Send,
} from "lucide-react";
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
import { DEFAULT_PRESET, rangeLabel, readChannels, readRange } from "./analytics-utils";
import { BestTimesPanel } from "./best-times";
import { ChannelDetailDialog } from "./channel-detail";
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

	const comparedTo = `vs prev. ${range.days}d`;
	// The open channel lives in the URL so a channel's history can be linked to directly.
	const channelParam = params.get("channel");
	const openChannel =
		overview.data?.byChannel.find((c) => c.channelId === channelParam) ??
		channels.data?.find((c) => c.id === channelParam);
	const lastCollectedAt = overview.data?.lastCollectedAt ?? null;

	const header = (
		<PageHeader
			title="Analytics"
			description="Results from your published posts."
			actions={
				hasChannels ? (
					<>
						<span
							className="font-mono text-muted-foreground text-xs"
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
			<Tabs value={view} onValueChange={(v) => update({ view: v === "posts" ? "posts" : null })}>
				{/* One toolbar: the view on the left, what it's filtered to on the right. */}
				<div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-border border-b pb-4">
					<TabsList aria-label="Analytics views">
						<TabsTrigger value="overview">
							<LayoutDashboard aria-hidden="true" />
							Overview
						</TabsTrigger>
						<TabsTrigger value="posts">
							<Rows3 aria-hidden="true" />
							All posts
						</TabsTrigger>
					</TabsList>
					<div className="flex flex-wrap items-center gap-2">
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
				</div>
				<TabsContent value="overview">
					<Overview
						overview={overview}
						comparedTo={comparedTo}
						timeZone={org.timezone}
						bestTimes={bestTimes}
						onShowPosts={() => update({ view: "posts" })}
						onSelectChannel={(id) => update({ channel: id })}
					/>
				</TabsContent>
				<TabsContent value="posts">
					<Card className="overflow-hidden">
						<CardHeader className="border-border border-b pb-4">
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
			<ChannelDetailDialog
				channel={
					openChannel
						? {
								channelId: "channelId" in openChannel ? openChannel.channelId : openChannel.id,
								name: openChannel.name,
								provider: openChannel.provider,
							}
						: null
				}
				range={range}
				rangeLabel={rangeLabel(range)}
				onClose={() => update({ channel: null })}
			/>
		</>
	);
}

function Overview({
	overview,
	comparedTo,
	timeZone,
	bestTimes,
	onShowPosts,
	onSelectChannel,
}: {
	overview: ReturnType<typeof useAnalyticsOverview>;
	comparedTo: string;
	timeZone: string;
	bestTimes: ReturnType<typeof useBestTimes>;
	onShowPosts: () => void;
	onSelectChannel: (channelId: string) => void;
}) {
	if (overview.isPending) {
		return (
			<div className="grid grid-cols-[minmax(0,1fr)] gap-6" aria-busy="true">
				<KpiSkeleton />
				<Skeleton className="h-96 rounded-2xl" />
				<div className="grid gap-6 xl:grid-cols-2">
					<Skeleton className="h-64 rounded-2xl" />
					<Skeleton className="h-64 rounded-2xl" />
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
		<div
			className="grid grid-cols-[minmax(0,1fr)] gap-6"
			aria-busy={overview.isFetching || undefined}
		>
			<KpiCards data={data} comparedTo={comparedTo} />
			<SupportNotice data={data} />

			{published ? (
				<Card>
					<CardHeader className="flex-row flex-wrap items-center justify-between gap-2 border-border border-b pb-4">
						<CardTitle>Performance over time</CardTitle>
						<ul
							className="flex flex-wrap items-center gap-3 text-muted-foreground text-xs"
							aria-hidden="true"
						>
							{LEGEND.map((l) => (
								<li key={l.label} className="inline-flex items-center gap-1.5">
									<span className="size-2 rounded-full" style={{ background: l.color }} />
									{l.label}
								</li>
							))}
						</ul>
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

			<div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[repeat(2,minmax(0,1fr))]">
				<Card className="overflow-hidden">
					<CardHeader className="border-border border-b pb-4">
						<CardTitle>Channels</CardTitle>
					</CardHeader>
					<ChannelTable rows={data.byChannel} onSelect={(c) => onSelectChannel(c.channelId)} />
				</Card>
				<Card className="overflow-hidden">
					<CardHeader className="flex-row items-center justify-between gap-2 border-border border-b pb-4">
						<CardTitle>Top posts</CardTitle>
						{data.topPosts.length ? (
							<Button variant="ghost" size="xs" onClick={onShowPosts}>
								View all
								<ArrowRight aria-hidden="true" />
							</Button>
						) : null}
					</CardHeader>
					{data.topPosts.length ? (
						<TopPosts posts={data.topPosts} timeZone={timeZone} />
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
				<CardHeader className="border-border border-b pb-4">
					<CardTitle>Best time to post</CardTitle>
					<CardDescription>Average engagements by weekday and hour</CardDescription>
				</CardHeader>
				<CardContent>
					<BestTimesPanel query={bestTimes} />
				</CardContent>
			</Card>
		</div>
	);
}

const LEGEND = [
	{ label: "Impressions", color: "var(--chart-1)" },
	{ label: "Engagements", color: "var(--chart-2)" },
	{ label: "Posts", color: "var(--chart-3)" },
];

/**
 * Says so when some or all of the shown channels can't report analytics at all. One muted
 * line, not an alert box: it explains the numbers, it isn't something to fix.
 */
function SupportNotice({ data }: { data: AnalyticsOverview }) {
	const unsupported = useMemo(
		() => data.byChannel.filter((c) => !c.analyticsSupported),
		[data.byChannel],
	);
	if (!unsupported.length) return null;
	const all = unsupported.length === data.byChannel.length;
	return (
		<p role="status" className="-mt-2 flex items-start gap-2 text-muted-foreground text-xs">
			<Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
			<span>
				{all
					? "These platforms don't share post metrics with SocialFly. Pick other channels to see their results."
					: `${unsupported.map((c) => c.name).join(", ")} ${unsupported.length === 1 ? "doesn't" : "don't"} share analytics, so ${unsupported.length === 1 ? "it isn't" : "they aren't"} counted in these totals.`}
			</span>
		</p>
	);
}
