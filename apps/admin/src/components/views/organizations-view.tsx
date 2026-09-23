"use client";

import { Badge } from "@socialfly/ui/components/badge";
import { EmptyState } from "@socialfly/ui/components/feedback";
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

/** "$3.20 of $10.00", "$3.20 · unlimited". */
export function BudgetUsage({ org }: { org: OrgSummary }) {
	const limit = org.aiEffectiveBudgetUsd;
	const over = limit !== null && limit > 0 && org.aiSpendMonthUsd >= limit;
	return (
		<span className={over ? "text-danger" : undefined}>
			<span className="tabular-nums">{formatUsd(org.aiSpendMonthUsd)}</span>
			<span className="text-muted-foreground">
				{limit === null ? " · unlimited" : ` of ${formatUsd(limit)}`}
			</span>
			{org.aiMonthlyBudgetUsd !== null ? (
				<Badge tone="outline" className="ml-1.5">
					override
				</Badge>
			) : null}
		</span>
	);
}

export function OrganizationsView() {
	const [search, setSearch] = useState("");
	const q = useDebounced(search.trim());
	const query = useOrganizations(q);
	const items = query.data?.pages.flatMap((p) => p.items) ?? [];

	return (
		<>
			<PageHeader
				title="Organizations"
				description="Every customer workspace, newest first, including deleted ones."
			/>
			<div className="mb-4">
				<SearchBox
					id="org-search"
					label="Search organizations"
					placeholder="Search by name or slug"
					value={search}
					onChange={setSearch}
				/>
			</div>
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
					<table className={tableClass}>
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
								<tr key={org.id} className="hover:bg-muted/40">
									<td className={tdClass}>
										<Link
											href={`/organizations/${org.id}`}
											className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
										>
											{org.name}
										</Link>
										<div className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
											<span>{org.slug}</span>
											{org.deletedAt ? (
												<Badge tone="danger">Deleted {formatDate(org.deletedAt)}</Badge>
											) : null}
										</div>
									</td>
									<td className={`${tdClass} text-right tabular-nums`}>
										{formatNumber(org.memberCount)}
									</td>
									<td className={`${tdClass} text-right tabular-nums`}>
										{formatNumber(org.channelCount)}
									</td>
									<td className={`${tdClass} text-right tabular-nums`}>
										{formatNumber(org.postCount)}
									</td>
									<td className={tdClass}>
										<BudgetUsage org={org} />
									</td>
									<td className={`${tdClass} whitespace-nowrap text-muted-foreground`}>
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
