"use client";

import { Badge } from "@socialfly/ui/components/badge";
import { Button } from "@socialfly/ui/components/button";
import { Alert, Skeleton } from "@socialfly/ui/components/feedback";
import { Input } from "@socialfly/ui/components/input";
import { cn } from "@socialfly/ui/utils";
import { AlertCircle, RefreshCw, Search, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { errorMessage } from "@/lib/errors";

export { PageHeader, SectionHeader } from "@socialfly/ui/components/page";

/** The "this is not the customer app" marker, shown in the sidebar, header and sign-in page. */
export function StaffBadge({ className }: { className?: string }) {
	return (
		<Badge tone="violet" className={cn("uppercase tracking-wider", className)}>
			<ShieldAlert aria-hidden="true" />
			Staff only
		</Badge>
	);
}

/** A failed query: what went wrong and a retry button. */
export function QueryError({
	error,
	onRetry,
	title = "Couldn't load this",
}: {
	error: unknown;
	onRetry?: () => void;
	title?: string;
}) {
	return (
		<Alert
			tone="danger"
			icon={AlertCircle}
			title={title}
			action={
				onRetry ? (
					<Button variant="outline" size="sm" onClick={onRetry}>
						<RefreshCw />
						Retry
					</Button>
				) : null
			}
		>
			{errorMessage(error)}
		</Alert>
	);
}

/** Placeholder rows while a table loads. */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
	return (
		<div className="grid gap-3 p-5" aria-hidden="true">
			{Array.from({ length: rows }, (_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
				<Skeleton key={i} className="h-7 w-full rounded-lg" />
			))}
		</div>
	);
}

/**
 * One white panel per table (docs/design.md §5): flat, hairline border, divided rows. Wide
 * tables scroll inside it instead of breaking the page.
 */
export function TableCard({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<div
			className={cn(
				"overflow-hidden rounded-2xl border border-border bg-surface-raised",
				className,
			)}
		>
			<div className="scrollbar-thin relative overflow-x-auto">{children}</div>
		</div>
	);
}

// Rows are divided (a rule between rows, none under the last) so the panel edge closes the table.
export const tableClass =
	"w-full min-w-[720px] border-collapse text-left text-sm [&_tbody>tr+tr]:border-border [&_tbody>tr+tr]:border-t";
export const thClass =
	"h-11 border-border border-b px-5 font-normal text-[12.5px] text-muted-foreground whitespace-nowrap";
export const tdClass = "px-5 py-3.5 align-middle";

/** "Load more" for keyset-paginated lists. */
export function LoadMore({
	hasNextPage,
	isFetchingNextPage,
	fetchNextPage,
	shown,
}: {
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	fetchNextPage: () => void;
	shown: number;
}) {
	return (
		<div className="flex items-center justify-between gap-3 border-border border-t px-5 py-3 text-muted-foreground text-xs">
			<span aria-live="polite" className="font-mono tabular-nums">
				Showing {shown} {hasNextPage ? "so far" : shown === 1 ? "row" : "rows"}
			</span>
			{hasNextPage ? (
				<Button
					variant="outline"
					size="sm"
					loading={isFetchingNextPage}
					onClick={() => fetchNextPage()}
				>
					Load more
				</Button>
			) : null}
		</div>
	);
}

/** A labelled search input (the label is visually hidden; the placeholder says what matches). */
export function SearchBox({
	id,
	label,
	placeholder,
	value,
	onChange,
}: {
	id: string;
	label: string;
	placeholder: string;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<div className="relative w-full sm:w-64">
			<label htmlFor={id} className="sr-only">
				{label}
			</label>
			<Search
				className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground"
				aria-hidden="true"
			/>
			<Input
				id={id}
				type="search"
				className="h-9 rounded-full pl-9"
				placeholder={placeholder}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				autoComplete="off"
			/>
		</div>
	);
}

/** Muted em dash for empty cells, with a screen-reader word. */
export function None({ label = "None" }: { label?: string }) {
	return (
		<span className="text-subtle-foreground">
			<span aria-hidden="true">—</span>
			<span className="sr-only">{label}</span>
		</span>
	);
}

/** A short id (first 8 chars) with the full value available on hover and to screen readers. */
export function ShortId({ id }: { id: string }) {
	return (
		<code className="font-mono text-muted-foreground text-xs" title={id}>
			{id.slice(0, 8)}
			<span className="sr-only">{id.slice(8)}</span>
		</code>
	);
}
