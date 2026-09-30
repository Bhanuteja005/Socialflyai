"use client";

import { Badge } from "@socialfly/ui/components/badge";
import { EmptyState } from "@socialfly/ui/components/feedback";
import { Tabs, TabsList, TabsTrigger } from "@socialfly/ui/components/tabs";
import { CheckCircle2, CircleHelp } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFailedTargets } from "@/hooks/use-admin";
import type { AdminTargetStatus } from "@/lib/api-types";
import { formatDateTime, formatRelative, humanize } from "@/lib/format";
import {
	LoadMore,
	None,
	PageHeader,
	QueryError,
	ShortId,
	TableCard,
	TableSkeleton,
	tableClass,
	tdClass,
	thClass,
} from "../common";
import { Monogram, Toolbar } from "./parts";

type Filter = AdminTargetStatus | "all";
const FILTERS: { value: Filter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "failed", label: "Failed" },
	{ value: "unconfirmed", label: "Unconfirmed" },
];

const parseFilter = (v: string | null): Filter =>
	v === "failed" || v === "unconfirmed" ? v : "all";

export function PublishingView() {
	const params = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();
	const filter = parseFilter(params.get("status"));
	const query = useFailedTargets(filter);
	const items = query.data?.pages.flatMap((p) => p.items) ?? [];

	return (
		<>
			<PageHeader
				title="Publishing"
				description="Post targets that need a human, across every organization."
			/>
			<Toolbar
				aside={
					query.data
						? `${items.length} ${query.hasNextPage ? "loaded" : items.length === 1 ? "target" : "targets"}`
						: null
				}
			>
				<Tabs
					value={filter}
					onValueChange={(v) => {
						const next = new URLSearchParams(params.toString());
						if (v === "all") next.delete("status");
						else next.set("status", v);
						const qs = next.toString();
						router.replace(qs ? `${pathname}?${qs}` : pathname);
					}}
				>
					<TabsList aria-label="Filter by status">
						{FILTERS.map((f) => (
							<TabsTrigger key={f.value} value={f.value}>
								{f.value === "failed" ? (
									<span className="size-1.5 rounded-full bg-danger" aria-hidden="true" />
								) : f.value === "unconfirmed" ? (
									<span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />
								) : null}
								{f.label}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
			</Toolbar>
			<p className="mb-4 flex items-start gap-2 rounded-2xl border border-border bg-surface-raised px-4 py-3 text-[13px] text-muted-foreground">
				<CircleHelp className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
				<span>
					<span className="font-medium text-foreground">Unconfirmed</span>: the call was sent but
					its outcome is unknown. Never retried automatically (a retry could post twice); the
					customer checks the platform first.
				</span>
			</p>
			{query.isError && !query.data ? (
				<QueryError error={query.error} onRetry={() => void query.refetch()} />
			) : query.isPending ? (
				<TableCard>
					<TableSkeleton />
				</TableCard>
			) : items.length === 0 ? (
				<EmptyState
					icon={CheckCircle2}
					title={filter === "all" ? "Nothing needs attention" : `No ${filter} targets right now`}
					description="Failed and unconfirmed deliveries from every organization show up here."
				/>
			) : (
				<TableCard>
					<table className={`${tableClass} relative`}>
						<caption className="sr-only">Failed and unconfirmed post targets</caption>
						<thead>
							<tr>
								<th scope="col" className={thClass}>
									Organization
								</th>
								<th scope="col" className={thClass}>
									Channel
								</th>
								<th scope="col" className={thClass}>
									Status
								</th>
								<th scope="col" className={thClass}>
									Error
								</th>
								<th scope="col" className={`${thClass} text-right`}>
									Attempts
								</th>
								<th scope="col" className={thClass}>
									Updated
								</th>
							</tr>
						</thead>
						<tbody>
							{items.map((t) => (
								<tr key={t.id} className="transition-colors hover:bg-surface">
									<td className={tdClass}>
										<div className="flex items-center gap-3">
											<Monogram name={t.organization.name} />
											<div className="grid min-w-0 gap-0.5">
												<Link
													href={`/organizations/${t.organization.id}`}
													className="font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
												>
													{t.organization.name}
												</Link>
												<div className="text-muted-foreground text-xs">
													Post <ShortId id={t.postId} />
												</div>
											</div>
										</div>
									</td>
									<td className={tdClass}>
										<div className="font-medium">{t.channel.name}</div>
										<div className="text-muted-foreground text-xs">
											{humanize(t.channel.provider)}
										</div>
									</td>
									<td className={tdClass}>
										<Badge tone={t.status === "failed" ? "danger" : "warning"} dot>
											{t.status === "failed" ? "Failed" : "Unconfirmed"}
										</Badge>
									</td>
									<td className={`${tdClass} max-w-sm`}>
										{t.errorCode || t.errorMessage ? (
											<div className="grid gap-0.5 text-xs">
												{t.errorCode ? (
													<code className="w-fit rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px]">
														{t.errorCode}
													</code>
												) : null}
												{t.errorMessage ? (
													<span className="break-words text-muted-foreground">
														{t.errorMessage}
													</span>
												) : null}
											</div>
										) : (
											<None />
										)}
									</td>
									<td className={`${tdClass} text-right font-mono tabular-nums`}>{t.attempts}</td>
									<td
										className={`${tdClass} whitespace-nowrap font-mono text-muted-foreground text-xs`}
									>
										<span title={formatDateTime(t.updatedAt)}>{formatRelative(t.updatedAt)}</span>
										{t.scheduledAt ? <div>Scheduled {formatDateTime(t.scheduledAt)}</div> : null}
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
