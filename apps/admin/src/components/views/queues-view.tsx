"use client";

import { Badge } from "@socialfly/ui/components/badge";
import { EmptyState } from "@socialfly/ui/components/feedback";
import { StatCard } from "@socialfly/ui/components/page";
import { cn } from "@socialfly/ui/utils";
import { Activity, Clock, Hourglass, Layers, XCircle } from "lucide-react";
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
	const total = (key: (typeof COLUMNS)[number]["key"]) =>
		queues.reduce((sum, q) => sum + q[key], 0);

	return (
		<>
			<PageHeader
				title="Queues"
				description={
					<>
						BullMQ job counts, refreshed every 15 seconds.
						{dataUpdatedAt ? (
							<>
								{" "}
								Updated <span className="font-mono">{formatRelative(new Date(dataUpdatedAt))}</span>
								.
							</>
						) : null}
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
				<>
					<section aria-labelledby="queue-totals" className="mb-6">
						<h2 id="queue-totals" className="sr-only">
							Totals across all queues
						</h2>
						<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
							<StatCard
								label="Waiting"
								value={formatNumber(total("waiting"))}
								icon={Hourglass}
								hint={`Across ${queues.length} queues`}
							/>
							<StatCard
								label="Active"
								value={formatNumber(total("active"))}
								icon={Activity}
								hint="Running right now"
							/>
							<StatCard
								label="Delayed"
								value={formatNumber(total("delayed"))}
								icon={Clock}
								hint="Scheduled or backing off"
							/>
							<StatCard
								label="Failed"
								value={formatNumber(total("failed"))}
								icon={XCircle}
								tone={total("failed") > 0 ? "danger" : "neutral"}
								hint={
									failing ? `In ${failing} ${failing === 1 ? "queue" : "queues"}` : "No failed jobs"
								}
							/>
						</div>
					</section>
					<TableCard>
						<table className={`${tableClass} relative`}>
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
									<tr key={q.name} className="transition-colors hover:bg-surface">
										<th scope="row" className={`${tdClass} text-left font-normal`}>
											<span className="flex items-center gap-2.5">
												<span
													className={cn(
														"size-2 shrink-0 rounded-full",
														q.failed > 0
															? "bg-danger"
															: q.active > 0
																? "bg-success"
																: "bg-border-strong",
													)}
													aria-hidden="true"
												/>
												<code className="font-mono text-[13px]">{q.name}</code>
											</span>
										</th>
										{COLUMNS.map((c) => {
											const n = q[c.key];
											const bad = c.key === "failed" && n > 0;
											return (
												<td
													key={c.key}
													className={cn(
														tdClass,
														"text-right font-mono tabular-nums",
														n === 0 && "text-subtle-foreground",
													)}
												>
													{bad ? (
														<Badge tone="danger" className="font-mono tabular-nums">
															{formatNumber(n)}
														</Badge>
													) : (
														formatNumber(n)
													)}
													{bad ? <span className="sr-only"> (needs attention)</span> : null}
												</td>
											);
										})}
									</tr>
								))}
							</tbody>
						</table>
					</TableCard>
				</>
			)}
		</>
	);
}
