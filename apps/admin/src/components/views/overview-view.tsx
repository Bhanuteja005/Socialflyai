"use client";

import { Badge } from "@socialfly/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@socialfly/ui/components/card";
import { Skeleton } from "@socialfly/ui/components/feedback";
import { cn } from "@socialfly/ui/utils";
import {
	Building2,
	CheckCircle2,
	CircleHelp,
	DollarSign,
	FileText,
	type LucideIcon,
	Radio,
	Users,
	XCircle,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useOverview } from "@/hooks/use-admin";
import { formatDate, formatNumber, formatRelative, formatUsd } from "@/lib/format";
import { GENERATION_STATUS, POST_STATUS, statusMeta } from "@/lib/status";
import { PageHeader, QueryError } from "../common";

function Kpi({
	label,
	value,
	detail,
	icon: Icon,
	tone,
	href,
	alert,
}: {
	label: string;
	value: string;
	detail?: ReactNode;
	icon: LucideIcon;
	tone: string;
	href: string;
	/** Highlights the card when the number needs someone's attention. */
	alert?: boolean;
}) {
	return (
		<Link
			href={href}
			className={cn(
				"group flex items-start gap-3 rounded-lg border bg-surface-raised p-4 shadow-xs transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-ring",
				alert ? "border-danger/40" : "border-border",
			)}
		>
			<span className={cn("flex size-9 shrink-0 items-center justify-center rounded-md", tone)}>
				<Icon className="size-4.5" aria-hidden="true" />
			</span>
			<span className="grid min-w-0">
				<span className="font-semibold text-xl tabular-nums leading-7">{value}</span>
				<span className="text-muted-foreground text-xs">{label}</span>
				{detail ? <span className="mt-1 text-subtle-foreground text-xs">{detail}</span> : null}
			</span>
		</Link>
	);
}

/** A labelled horizontal bar per status, with the count; readable without colour. */
function Breakdown({
	title,
	counts,
	meta,
}: {
	title: string;
	counts: Record<string, number>;
	meta: (key: string) => { label: string; tone: Parameters<typeof Badge>[0]["tone"] };
}) {
	const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
	const total = entries.reduce((sum, [, n]) => sum + n, 0);
	return (
		<Card>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
			</CardHeader>
			<CardContent>
				{total === 0 ? (
					<p className="text-muted-foreground text-sm">Nothing yet.</p>
				) : (
					<ul className="grid gap-2.5">
						{entries.map(([key, n]) => {
							const m = meta(key);
							const pct = total ? Math.round((n / total) * 100) : 0;
							return (
								<li key={key} className="grid grid-cols-[9.5rem_1fr_3.5rem] items-center gap-3">
									<Badge tone={m.tone} dot className="justify-self-start">
										{m.label}
									</Badge>
									<span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
										<span
											className="block h-full rounded-full bg-foreground/40"
											style={{ width: `${pct}%` }}
										/>
									</span>
									<span className="text-right text-sm tabular-nums">
										{formatNumber(n)}
										<span className="sr-only"> ({pct}%)</span>
									</span>
								</li>
							);
						})}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}

export function OverviewView() {
	const { data, error, isPending, refetch } = useOverview();

	return (
		<>
			<PageHeader
				title="Overview"
				description={
					data ? (
						<>
							Platform-wide numbers, refreshed every minute. Last updated{" "}
							<time dateTime={data.generatedAt}>{formatRelative(data.generatedAt)}</time>.
						</>
					) : (
						"Platform-wide numbers, refreshed every minute."
					)
				}
			/>
			{error && !data ? <QueryError error={error} onRetry={() => void refetch()} /> : null}
			{isPending ? (
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					{Array.from({ length: 8 }, (_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
						<Skeleton key={i} className="h-24" />
					))}
				</div>
			) : null}
			{data ? (
				<div className="grid gap-6">
					<section aria-labelledby="kpis" className="grid gap-3">
						<h2 id="kpis" className="sr-only">
							Key numbers
						</h2>
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
							<Kpi
								label="Users"
								value={formatNumber(data.users.total)}
								detail={`+${formatNumber(data.users.new7d)} in 7 days · ${formatNumber(data.users.disabled)} disabled`}
								icon={Users}
								tone="bg-info-soft text-info"
								href="/users"
							/>
							<Kpi
								label="Organizations"
								value={formatNumber(data.organizations.total)}
								detail={`+${formatNumber(data.organizations.new7d)} in 7 days · ${formatNumber(data.organizations.deleted)} deleted`}
								icon={Building2}
								tone="bg-violet-soft text-violet"
								href="/organizations"
							/>
							<Kpi
								label="Channels needing reconnect"
								value={formatNumber(data.channels.needsReauth)}
								detail={`${formatNumber(data.channels.active)} active of ${formatNumber(data.channels.total)}`}
								icon={Radio}
								tone="bg-warning-soft text-warning"
								href="/organizations"
								alert={data.channels.needsReauth > 0}
							/>
							<Kpi
								label={`AI spend since ${formatDate(data.ai.periodStart)}`}
								value={formatUsd(data.ai.spendUsd)}
								detail={`${formatNumber(data.ai.generations.total)} generations this month`}
								icon={DollarSign}
								tone="bg-primary-soft text-primary-text"
								href="/ai"
							/>
							<Kpi
								label="Failed targets (24h)"
								value={formatNumber(data.publishing.failed24h)}
								icon={XCircle}
								tone="bg-danger-soft text-danger"
								href="/publishing?status=failed"
								alert={data.publishing.failed24h > 0}
							/>
							<Kpi
								label="Unconfirmed targets (24h)"
								value={formatNumber(data.publishing.unconfirmed24h)}
								detail="Outcome unknown; customer must check"
								icon={CircleHelp}
								tone="bg-warning-soft text-warning"
								href="/publishing?status=unconfirmed"
								alert={data.publishing.unconfirmed24h > 0}
							/>
							<Kpi
								label="Published targets (24h)"
								value={formatNumber(data.publishing.published24h)}
								icon={CheckCircle2}
								tone="bg-success-soft text-success"
								href="/publishing"
							/>
							<Kpi
								label="Posts (all time)"
								value={formatNumber(data.posts.total)}
								detail="Excludes deleted posts"
								icon={FileText}
								tone="bg-muted text-muted-foreground"
								href="/organizations"
							/>
						</div>
					</section>
					<div className="grid gap-6 lg:grid-cols-2">
						<Breakdown
							title="Posts by status"
							counts={data.posts.byStatus}
							meta={(k) => statusMeta(POST_STATUS, k)}
						/>
						<Breakdown
							title="AI generations by status (this month)"
							counts={data.ai.generations.byStatus}
							meta={(k) => statusMeta(GENERATION_STATUS, k)}
						/>
					</div>
				</div>
			) : null}
		</>
	);
}
