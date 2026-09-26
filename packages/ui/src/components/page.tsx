import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/utils";
import { Skeleton } from "./feedback";

/**
 * Title block at the top of every page: a Geist Pixel h1, one short line of description and the
 * page's actions (docs/design.md §2, §6). Keep the description to one sentence or leave it out.
 */
export function PageHeader({
	title,
	description,
	actions,
	className,
	eyebrow,
}: {
	title: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
	className?: string;
	eyebrow?: ReactNode;
}) {
	return (
		<div className={cn("mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4", className)}>
			<div className="grid min-w-0 gap-2">
				{eyebrow ? <div className="font-mono text-muted-foreground text-xs">{eyebrow}</div> : null}
				<h1 className="text-balance font-normal font-pixel text-[22px] leading-7 sm:text-[26px] sm:leading-8">
					{title}
				</h1>
				{description ? (
					<p className="max-w-2xl text-pretty text-muted-foreground text-sm">{description}</p>
				) : null}
			</div>
			{actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
		</div>
	);
}

/** Heading for a group of cards inside a page ("Up next", "Channels" ...). */
export function SectionHeader({
	title,
	description,
	actions,
	className,
}: {
	title: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2", className)}>
			<div className="grid min-w-0 gap-0.5">
				<h2 className="font-medium text-[15px] leading-6">{title}</h2>
				{description ? <p className="text-muted-foreground text-xs">{description}</p> : null}
			</div>
			{actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
		</div>
	);
}

export type StatTone = "neutral" | "primary" | "info" | "success" | "warning" | "danger" | "violet";

const statDot: Record<StatTone, string> = {
	neutral: "bg-subtle-foreground",
	primary: "bg-ink",
	info: "bg-info",
	success: "bg-success",
	warning: "bg-warning",
	danger: "bg-danger",
	violet: "bg-violet",
};

/**
 * One KPI: label, a DM Mono number, an optional one-line hint. Monochrome by default; `tone`
 * only adds a small status dot. Wrap in a link (with `interactive`) to drill into a list.
 */
export function StatCard({
	label,
	value,
	icon: Icon,
	tone = "neutral",
	hint,
	loading,
	interactive,
	className,
}: {
	label: ReactNode;
	value: ReactNode;
	icon?: LucideIcon;
	tone?: StatTone;
	hint?: ReactNode;
	loading?: boolean;
	interactive?: boolean;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex h-full flex-col gap-4 rounded-2xl border border-border bg-surface-raised p-4",
				interactive &&
					"transition-[border-color,transform] duration-150 group-hover:-translate-y-px group-hover:border-border-strong",
				className,
			)}
		>
			<div className="flex items-center justify-between gap-3">
				<span className="flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
					{tone !== "neutral" ? (
						<span
							className={cn("size-1.5 shrink-0 rounded-full", statDot[tone])}
							aria-hidden="true"
						/>
					) : null}
					<span className="truncate">{label}</span>
				</span>
				{Icon ? (
					<Icon className="size-4 shrink-0 text-subtle-foreground" aria-hidden="true" />
				) : null}
			</div>
			<div className="mt-auto grid gap-1">
				{loading ? (
					<Skeleton className="h-8 w-16" />
				) : (
					<span className="font-medium font-mono text-[26px] tabular-nums leading-8 tracking-[-0.02em]">
						{value}
					</span>
				)}
				{hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
			</div>
		</div>
	);
}
