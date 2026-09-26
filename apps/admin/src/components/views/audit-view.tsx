"use client";

import { Avatar } from "@socialfly/ui/components/avatar";
import { Badge } from "@socialfly/ui/components/badge";
import { EmptyState } from "@socialfly/ui/components/feedback";
import { ScrollText } from "lucide-react";
import Link from "next/link";
import { useAudit } from "@/hooks/use-admin";
import type { AuditEvent } from "@/lib/api-types";
import { formatDateTime, formatRelative } from "@/lib/format";
import {
	LoadMore,
	PageHeader,
	QueryError,
	ShortId,
	TableCard,
	TableSkeleton,
	tableClass,
	tdClass,
	thClass,
} from "../common";

const show = (value: unknown) =>
	value === undefined ? "—" : value === null ? "null" : JSON.stringify(value);

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v);

type DiffRow = { field: string; before: unknown; after: unknown };

/**
 * `data` is `{ before, after, ...extra }`. before/after are either whole values (a budget,
 * a status) or objects, in which case only the fields that changed are listed.
 */
function diffRows(data: Record<string, unknown>): DiffRow[] {
	if (!("before" in data) && !("after" in data)) return [];
	const { before, after } = data;
	if (isRecord(before) && isRecord(after)) {
		const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
		return keys
			.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
			.map((k) => ({ field: k, before: before[k], after: after[k] }));
	}
	return [{ field: "value", before, after }];
}

function AuditData({ event }: { event: AuditEvent }) {
	const data = isRecord(event.data) ? event.data : {};
	const rows = diffRows(data);
	const extra = Object.entries(data).filter(([k]) => k !== "before" && k !== "after");
	return (
		<div className="grid gap-2">
			{rows.length ? (
				<table className="w-auto border-collapse text-xs">
					<caption className="sr-only">Changes</caption>
					<thead className="sr-only">
						<tr>
							<th scope="col">Field</th>
							<th scope="col">Before</th>
							<th scope="col">After</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr key={r.field}>
								<th scope="row" className="pr-3 text-left font-normal text-muted-foreground">
									{r.field}
								</th>
								<td className="pr-2">
									<code className="rounded-md bg-muted px-1 font-mono text-muted-foreground line-through">
										{show(r.before)}
									</code>
								</td>
								<td aria-hidden="true" className="pr-2 text-subtle-foreground">
									→
								</td>
								<td>
									<code className="rounded-md bg-muted px-1 font-mono text-foreground">
										{show(r.after)}
									</code>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			) : null}
			{extra.length ? (
				<dl className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
					{extra.map(([k, v]) => (
						<div key={k} className="flex gap-1">
							<dt>{k}:</dt>
							<dd>
								<code className="font-mono text-foreground">{show(v)}</code>
							</dd>
						</div>
					))}
				</dl>
			) : null}
			<details className="text-xs">
				<summary className="cursor-pointer text-muted-foreground hover:text-foreground">
					Raw JSON
				</summary>
				<pre className="scrollbar-thin mt-1 max-w-md overflow-x-auto rounded-xl bg-surface p-2 font-mono">
					{JSON.stringify(event.data, null, 2)}
				</pre>
			</details>
		</div>
	);
}

function Target({ event }: { event: AuditEvent }) {
	const label = (
		<>
			<Badge tone="outline">{event.targetType}</Badge> <ShortId id={event.targetId} />
		</>
	);
	if (event.targetType === "organization") {
		return (
			<Link
				href={`/organizations/${event.targetId}`}
				className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
				aria-label={`Organization ${event.targetId}`}
			>
				{label}
			</Link>
		);
	}
	return <span>{label}</span>;
}

export function AuditView() {
	const query = useAudit();
	const items = query.data?.pages.flatMap((p) => p.items) ?? [];

	return (
		<>
			<PageHeader title="Audit log" description="Every staff change, newest first." />
			{query.isError && !query.data ? (
				<QueryError error={query.error} onRetry={() => void query.refetch()} />
			) : query.isPending ? (
				<TableCard>
					<TableSkeleton />
				</TableCard>
			) : items.length === 0 ? (
				<EmptyState icon={ScrollText} title="No admin changes recorded yet" />
			) : (
				<TableCard>
					<table className={`${tableClass} relative`}>
						<caption className="sr-only">Audit log</caption>
						<thead>
							<tr>
								<th scope="col" className={thClass}>
									When
								</th>
								<th scope="col" className={thClass}>
									Action
								</th>
								<th scope="col" className={thClass}>
									Actor
								</th>
								<th scope="col" className={thClass}>
									Target
								</th>
								<th scope="col" className={thClass}>
									Change
								</th>
							</tr>
						</thead>
						<tbody>
							{items.map((e) => (
								<tr key={e.id} className="transition-colors hover:bg-surface">
									<td
										className={`${tdClass} whitespace-nowrap font-mono text-muted-foreground text-xs`}
									>
										<time dateTime={e.createdAt} title={formatDateTime(e.createdAt)}>
											{formatRelative(e.createdAt)}
										</time>
									</td>
									<td className={tdClass}>
										<code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">
											{e.action}
										</code>
									</td>
									<td className={tdClass}>
										{e.actorEmail ? (
											<span className="flex items-center gap-2 text-sm">
												<Avatar name={e.actorEmail} size="xs" />
												{e.actorEmail}
											</span>
										) : e.actorUserId ? (
											<ShortId id={e.actorUserId} />
										) : (
											<Badge tone="outline">CLI</Badge>
										)}
									</td>
									<td className={`${tdClass} whitespace-nowrap`}>
										<Target event={e} />
									</td>
									<td className={tdClass}>
										<AuditData event={e} />
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
