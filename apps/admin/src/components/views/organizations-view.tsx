"use client";

import { Badge } from "@socialfly/ui/components/badge";
import { EmptyState } from "@socialfly/ui/components/feedback";
import { cn } from "@socialfly/ui/utils";
import { Building2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useOrganizations } from "@/hooks/use-admin";
import { useDebounced } from "@/hooks/use-debounced";
import type { OrgSummary } from "@/lib/api-types";
import { formatDate, formatNumber, formatUsd } from "@/lib/format";
import {
	LoadMore,
	PageHeader,
	QueryError,
	SearchBox,
	TableCard,
	TableSkeleton,
	tableClass,
	tdClass,
	thClass,
} from "../common";
import { Monogram, Toolbar } from "./parts";

/** "$3.20 of $10.00", "$3.20 · unlimited", with a thin meter when there is a cap. */
export function BudgetUsage({ org }: { org: OrgSummary }) {
	const limit = org.aiEffectiveBudgetUsd;
	const over = limit !== null && limit > 0 && org.aiSpendMonthUsd >= limit;
	const pct = limit ? Math.min(100, (org.aiSpendMonthUsd / limit) * 100) : 0;
	return (
		<div className="grid min-w-40 gap-1.5">
			<span className={cn("flex items-center gap-1.5 whitespace-nowrap", over && "text-danger")}>
				<span className="font-mono tabular-nums">{formatUsd(org.aiSpendMonthUsd)}</span>
				<span className="font-mono text-muted-foreground text-xs tabular-nums">
					{limit === null ? "· unlimited" : `of ${formatUsd(limit)}`}
				</span>
				{org.aiMonthlyBudgetUsd !== null ? <Badge tone="outline">Override</Badge> : null}
			</span>
			{limit ? (
				<span
					className="h-1 w-full max-w-40 overflow-hidden rounded-full bg-muted"
					aria-hidden="true"
				>
					<span
						className={cn(
							"block h-full rounded-full",
							over ? "bg-danger" : pct >= 80 ? "bg-warning" : "bg-foreground/70",
						)}
						style={{ width: `${Math.max(pct, 2)}%` }}
					/>
				</span>
			) : null}
		</div>
	);
}

export function OrganizationsView() {
	const [search, setSearch] = useState("");
	const q = useDebounced(search.trim());
	const query = useOrganizations(q);
	const items = query.data?.pages.flatMap((p) => p.items) ?? [];

	return (
		<>
			<PageHeader title="Organizations" description="Every customer workspace, newest first." />
			<Toolbar
				aside={
					query.data
						? `${formatNumber(items.length)} ${query.hasNextPage ? "loaded" : items.length === 1 ? "organization" : "organizations"}`
						: null
				}
			>
				<SearchBox
					id="org-search"
					label="Search organizations"
					placeholder="Search by name or slug"
					value={search}
					onChange={setSearch}
				/>
			</Toolbar>
			{query.isError && !query.data ? (
				<QueryError error={query.error} onRetry={() => void query.refetch()} />
			) : query.isPending ? (
				<TableCard>
					<TableSkeleton />
				</TableCard>
			) : items.length === 0 ? (
				<EmptyState
					icon={Building2}
					title={q ? `No organizations match "${q}"` : "No organizations yet"}
					description={q ? "Try part of the name or the slug." : undefined}
				/>
			) : (
				<TableCard>
					<table className={`${tableClass} relative`}>
						<caption className="sr-only">Organizations</caption>
						<thead>
							<tr>
								<th scope="col" className={thClass}>
									Organization
								</th>
								<th scope="col" className={`${thClass} text-right`}>
									Members
								</th>
								<th scope="col" className={`${thClass} text-right`}>
									Channels
								</th>
								<th scope="col" className={`${thClass} text-right`}>
									Posts
								</th>
								<th scope="col" className={thClass}>
									AI spend this month
								</th>
								<th scope="col" className={thClass}>
									Created
								</th>
							</tr>
						</thead>
						<tbody>
							{items.map((org) => (
								<tr
									key={org.id}
									className={cn(
										"transition-colors hover:bg-surface",
										org.deletedAt && "opacity-70",
									)}
								>
									<td className={tdClass}>
										<div className="flex items-center gap-3">
											<Monogram name={org.name} />
											<div className="grid min-w-0 gap-0.5">
												<Link
													href={`/organizations/${org.id}`}
													className="truncate font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
												>
													{org.name}
												</Link>
												<div className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
													<span className="font-mono">{org.slug}</span>
													{org.deletedAt ? (
														<Badge tone="danger">Deleted {formatDate(org.deletedAt)}</Badge>
													) : null}
												</div>
											</div>
										</div>
									</td>
									<td className={`${tdClass} text-right font-mono tabular-nums`}>
										{formatNumber(org.memberCount)}
									</td>
									<td className={`${tdClass} text-right font-mono tabular-nums`}>
										{formatNumber(org.channelCount)}
									</td>
									<td className={`${tdClass} text-right font-mono tabular-nums`}>
										{formatNumber(org.postCount)}
									</td>
									<td className={tdClass}>
										<BudgetUsage org={org} />
									</td>
									<td
										className={`${tdClass} whitespace-nowrap font-mono text-muted-foreground text-xs`}
									>
										{formatDate(org.createdAt)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
					<LoadMore
						hasNextPage={query.hasNextPage}
						isFetchingNextPage={query.isFetchingNextPage}
						fetchNextPage={() => void query.fetchNextPage()}
						shown={items.length}
					/>
				</TableCard>
			)}
		</>
	);
}
