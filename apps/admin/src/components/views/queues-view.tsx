"use client";

import { Badge } from "@socialfly/ui/components/badge";
import { EmptyState } from "@socialfly/ui/components/feedback";
import { cn } from "@socialfly/ui/utils";
import { Layers } from "lucide-react";
import { useQueues } from "@/hooks/use-admin";
import type { QueueStats } from "@/lib/api-types";
import { formatNumber, formatRelative } from "@/lib/format";
import {
	PageHeader,
	QueryError,
	TableCard,
	TableSkeleton,
	tableClass,
	tdClass,
	thClass,
} from "../common";

const COLUMNS: { key: Exclude<keyof QueueStats, "name">; label: string }[] = [
	{ key: "waiting", label: "Waiting" },
	{ key: "active", label: "Active" },
	{ key: "delayed", label: "Delayed" },
	{ key: "failed", label: "Failed" },
	{ key: "completed", label: "Completed" },
];

export function QueuesView() {
	const { data, error, isPending, refetch, dataUpdatedAt } = useQueues();
	// Failed jobs first: those are what someone opened this page for.
	const queues = [...(data?.queues ?? [])].sort(
		(a, b) => b.failed - a.failed || a.name.localeCompare(b.name),
	);
	const failing = queues.filter((q) => q.failed > 0).length;

	return (
		<>
			<PageHeader
				title="Queues"
				description={
					<>
						BullMQ job counts for every queue, refreshed every 15 seconds.
						{dataUpdatedAt ? <> Updated {formatRelative(new Date(dataUpdatedAt))}.</> : null}
					</>
				}
				actions={
					failing ? (
						<Badge tone="danger" dot>
							{failing} {failing === 1 ? "queue has" : "queues have"} failed jobs
						</Badge>
					) : null
				}
			/>
			{error && !data ? (
				<QueryError error={error} onRetry={() => void refetch()} />
			) : isPending ? (
				<TableCard>
					<TableSkeleton />
				</TableCard>
			) : queues.length === 0 ? (
				<EmptyState icon={Layers} title="No queues reported" />
			) : (
				<TableCard>
					<table className={tableClass}>
						<caption className="sr-only">Queue job counts</caption>
						<thead>
							<tr>
								<th scope="col" className={thClass}>
									Queue
								</th>
								{COLUMNS.map((c) => (
									<th key={c.key} scope="col" className={`${thClass} text-right`}>
										{c.label}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{queues.map((q) => (
								<tr key={q.name} className={cn(q.failed > 0 && "bg-danger-soft/40")}>
									<th scope="row" className={`${tdClass} text-left font-mono font-normal text-xs`}>
										{q.name}
									</th>
									{COLUMNS.map((c) => {
										const n = q[c.key];
										const bad = c.key === "failed" && n > 0;
										return (
											<td
												key={c.key}
												className={cn(
													tdClass,
													"text-right tabular-nums",
													n === 0 && "text-subtle-foreground",
													bad && "font-semibold text-danger",
												)}
											>
												{formatNumber(n)}
												{bad ? <span className="sr-only"> (needs attention)</span> : null}
											</td>
										);
									})}
								</tr>
							))}
						</tbody>
					</table>
				</TableCard>
			)}
		</>
	);
}
