"use client";

import { Button } from "@socialfly/ui/components/button";
import { EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import { cn } from "@socialfly/ui/utils";
import { ArrowDown, ImageIcon, Rows3 } from "lucide-react";
import Link from "next/link";
import { useAnalyticsPosts } from "@/hooks/use-analytics";
import type { AnalyticsPostItem, AnalyticsSort } from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { formatCompact, formatDate, formatNumber, formatPercent } from "@/lib/format";
import { ProviderIcon } from "../provider-icon";
import { LiveLink } from "./top-posts";

export const SORTS: { value: AnalyticsSort; label: string }[] = [
	{ value: "publishedAt", label: "Date" },
	{ value: "engagements", label: "Engagements" },
	{ value: "impressions", label: "Impressions" },
];

function SortHeader({
	sort,
	current,
	onSort,
	className,
}: {
	sort: AnalyticsSort;
	current: AnalyticsSort;
	onSort: (s: AnalyticsSort) => void;
	className?: string;
}) {
	const active = sort === current;
	const label = SORTS.find((s) => s.value === sort)?.label ?? sort;
	return (
		<th
			scope="col"
			aria-sort={active ? "descending" : "none"}
			className={cn("px-3 py-2 font-medium", className)}
		>
			<button
				type="button"
				onClick={() => onSort(sort)}
				className={cn(
					"inline-flex cursor-pointer items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
					active && "text-foreground",
				)}
			>
				{sort === "publishedAt" ? "Published" : label}
				<ArrowDown
					className={cn("size-3", active ? "opacity-100" : "opacity-0")}
					aria-hidden="true"
				/>
				<span className="sr-only">{active ? "(sorted, highest first)" : "(sort by this)"}</span>
			</button>
		</th>
	);
}

function Thumb({ item }: { item: AnalyticsPostItem }) {
	return (
		<span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
			{item.thumbnailUrl ? (
				// biome-ignore lint/performance/noImgElement: user media from a runtime-configured storage host
				<img
					src={item.thumbnailUrl}
					alt=""
					loading="lazy"
					decoding="async"
					className="size-full object-cover"
				/>
			) : (
				<ImageIcon className="size-4 text-subtle-foreground" aria-hidden="true" />
			)}
		</span>
	);
}

const num = "px-3 py-3 text-right tabular-nums";

export function PostsTable({
	from,
	to,
	channelIds,
	sort,
	onSort,
	timeZone,
}: {
	from: string;
	to: string;
	channelIds?: string;
	sort: AnalyticsSort;
	onSort: (s: AnalyticsSort) => void;
	timeZone: string;
}) {
	const query = useAnalyticsPosts({ from, to, channelIds, sort });
	const items = query.data?.pages.flatMap((p) => p.items) ?? [];

	if (query.isPending) {
		return (
			<div className="grid gap-2 p-5">
				{["a", "b", "c", "d", "e"].map((k) => (
					<Skeleton key={k} className="h-12" />
				))}
			</div>
		);
	}
	if (query.isError) {
		return (
			<div className="p-5">
				<EmptyState
					compact
					title="Couldn't load posts"
					description={errorMessage(query.error)}
					action={
						<Button variant="outline" size="sm" onClick={() => query.refetch()}>
							Retry
						</Button>
					}
				/>
			</div>
		);
	}
	if (!items.length) {
		return (
			<div className="p-5">
				<EmptyState
					compact
					icon={Rows3}
					title="No published posts in this period"
					description="Posts show up here once they're published. Metrics follow within a few hours."
				/>
			</div>
		);
	}

	return (
		<>
			<div className="scrollbar-thin overflow-x-auto">
				<table className="w-full min-w-[820px] text-sm">
					<caption className="sr-only">Published posts and their results</caption>
					<thead>
						<tr className="border-border border-y bg-surface text-muted-foreground text-xs">
							<th scope="col" className="px-3 py-2 pl-5 text-left font-medium">
								Post
							</th>
							<SortHeader sort="publishedAt" current={sort} onSort={onSort} className="text-left" />
							<SortHeader
								sort="impressions"
								current={sort}
								onSort={onSort}
								className="text-right"
							/>
							<SortHeader
								sort="engagements"
								current={sort}
								onSort={onSort}
								className="text-right"
							/>
							<th scope="col" className="px-3 py-2 text-right font-medium">
								Rate
							</th>
							<th scope="col" className="px-3 py-2 text-right font-medium">
								Likes
							</th>
							<th scope="col" className="px-3 py-2 text-right font-medium">
								Comments
							</th>
							<th scope="col" className="px-3 py-2 pr-5 text-right font-medium">
								Shares
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-border">
						{items.map((item) => (
							<tr key={item.targetId} className="align-top">
								<th scope="row" className="px-3 py-3 pl-5 text-left font-normal">
									<span className="flex gap-3">
										<Thumb item={item} />
										<span className="grid min-w-0 max-w-sm gap-1">
											<Link
												href={`/posts/${item.postId}`}
												className="line-clamp-2 rounded-sm leading-snug hover:underline focus-visible:outline-2 focus-visible:outline-ring"
											>
												{item.excerpt || "Media post"}
											</Link>
											<span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
												<span className="inline-flex min-w-0 items-center gap-1.5">
													<ProviderIcon provider={item.channel.provider} size="xs" />
													<span className="truncate">{item.channel.name}</span>
												</span>
												<LiveLink href={item.externalUrl} provider={item.channel.provider} />
											</span>
										</span>
									</span>
								</th>
								<td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
									{item.publishedAt ? (
										<time dateTime={item.publishedAt}>
											{formatDate(item.publishedAt, timeZone)}
										</time>
									) : null}
								</td>
								<td className={num} title={formatNumber(item.metrics.impressions)}>
									{formatCompact(item.metrics.impressions)}
								</td>
								<td className={num} title={formatNumber(item.metrics.engagements)}>
									{formatCompact(item.metrics.engagements)}
								</td>
								<td className={num}>{formatPercent(item.metrics.engagementRate)}</td>
								<td className={num}>{formatCompact(item.metrics.likes)}</td>
								<td className={num}>{formatCompact(item.metrics.comments)}</td>
								<td className={cn(num, "pr-5")}>{formatCompact(item.metrics.shares)}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{query.hasNextPage ? (
				<div className="flex justify-center border-border border-t p-3">
					<Button
						variant="outline"
						size="sm"
						loading={query.isFetchingNextPage}
						onClick={() => query.fetchNextPage()}
					>
						Load more
					</Button>
				</div>
			) : sort !== "publishedAt" && items.length >= 25 ? (
				<p className="border-border border-t px-5 py-3 text-muted-foreground text-xs">
					Showing your top {items.length} posts. Sort by date to browse all of them.
				</p>
			) : null}
		</>
	);
}
