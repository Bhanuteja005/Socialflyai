"use client";

import { Badge } from "@socialfly/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@socialfly/ui/components/card";
import { Skeleton } from "@socialfly/ui/components/feedback";
import { StatCard } from "@socialfly/ui/components/page";
import { cn } from "@socialfly/ui/utils";
import {
	Building2,
	CheckCircle2,
	ChevronRight,
	CircleHelp,
	DollarSign,
	type LucideIcon,
	Megaphone,
	Radio,
	Send,
	Users,
	XCircle,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useOverview } from "@/hooks/use-admin";
import type { Overview } from "@/lib/api-types";
import { formatDate, formatMoney, formatNumber, formatRelative, formatUsd } from "@/lib/format";
import { GENERATION_STATUS, POST_STATUS, statusMeta } from "@/lib/status";
import { PageHeader, QueryError } from "../common";
import { Distribution } from "./parts";

function KpiLink({ href, children }: { href: string; children: ReactNode }) {
	return (
		<Link
			href={href}
			className="group rounded-2xl focus-visible:outline-2 focus-visible:outline-ring"
		>
			{children}
		</Link>
	);
}

type Issue = {
	label: string;
	description: string;
	count: number;
	href: string;
	icon: LucideIcon;
	tone: "danger" | "warning";
};

/** The numbers someone must act on, each linking to the list that explains them. */
function NeedsAttention({ issues }: { issues: Issue[] }) {
	const open = issues.reduce((sum, i) => sum + i.count, 0);
	return (
		<Card className="flex flex-col">
			<CardHeader className="flex-row items-center justify-between border-border border-b pb-4">
				<CardTitle>Needs attention</CardTitle>
				{open === 0 ? (
					<Badge tone="success" dot>
						All clear
					</Badge>
				) : (
					<Badge tone="danger" dot>
						{formatNumber(open)} open
					</Badge>
				)}
			</CardHeader>
			<ul className="flex-1 divide-y divide-border">
				{issues.map((issue) => {
					const hot = issue.count > 0;
					const Icon = hot ? issue.icon : CheckCircle2;
					return (
						<li key={issue.label}>
							<Link
								href={issue.href}
								className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2"
							>
								<span
									className={cn(
										"flex size-8 shrink-0 items-center justify-center rounded-full bg-muted",
										hot ? "text-foreground" : "text-subtle-foreground",
									)}
								>
									<Icon className="size-4" aria-hidden="true" />
								</span>
								<span className="grid min-w-0 flex-1 gap-0.5">
									<span className="truncate font-medium text-sm">{issue.label}</span>
									<span className="truncate text-muted-foreground text-xs">
										{issue.description}
									</span>
								</span>
								<span
									className={cn(
										"flex items-center gap-2 font-mono text-lg tabular-nums",
										!hot && "text-subtle-foreground",
										hot && issue.tone === "danger" && "text-danger",
										hot && issue.tone === "warning" && "text-warning",
									)}
								>
									{hot ? (
										<span
											className={cn(
												"size-1.5 rounded-full",
												issue.tone === "danger" ? "bg-danger" : "bg-warning",
											)}
											aria-hidden="true"
										/>
									) : null}
									{formatNumber(issue.count)}
									{hot ? <span className="sr-only"> (needs attention)</span> : null}
								</span>
								<ChevronRight
									className="size-4 shrink-0 text-subtle-foreground transition-transform group-hover:translate-x-0.5"
									aria-hidden="true"
								/>
							</Link>
						</li>
					);
				})}
			</ul>
			<p className="rounded-b-2xl border-border border-t bg-surface px-5 py-3 text-muted-foreground text-xs">
				Unconfirmed deliveries are never retried automatically.
			</p>
		</Card>
	);
}

function BreakdownCard({
	title,
	total,
	totalLabel,
	children,
}: {
	title: string;
	total: number;
	totalLabel: string;
	children: ReactNode;
}) {
	return (
		<Card>
			<CardHeader className="flex-row items-center justify-between border-border border-b pb-4">
				<CardTitle>{title}</CardTitle>
				<span className="text-muted-foreground text-xs">
					<span className="font-mono text-foreground tabular-nums">{formatNumber(total)}</span>{" "}
					{totalLabel}
				</span>
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}

type AdsOverview = NonNullable<Overview["ads"]>;

/**
 * Paid ads across every tenant. Spend stays per currency (never converted or summed);
 * unconfirmed campaigns — created-or-not unknown — are what staff should chase.
 */
function AdsCard({ ads }: { ads: AdsOverview }) {
	const spend = Object.entries(ads.spend7dByCurrency).sort((a, b) => b[1] - a[1]);
	const tiles: { label: string; value: number; alert?: boolean }[] = [
		{ label: "Ad accounts", value: ads.accounts },
		{ label: "Active campaigns", value: ads.campaignsActive },
		{ label: "Unconfirmed", value: ads.unconfirmed, alert: ads.unconfirmed > 0 },
	];
	return (
		<Card className="flex flex-col">
			<CardHeader className="flex-row items-center justify-between border-border border-b pb-4">
				<CardTitle className="flex items-center gap-2">
					<Megaphone className="size-4 text-muted-foreground" aria-hidden="true" />
					Ads
				</CardTitle>
				<span className="text-muted-foreground text-xs">All tenants</span>
			</CardHeader>
			<CardContent className="grid flex-1 content-start gap-5">
				<dl className="grid grid-cols-3 gap-2">
					{tiles.map((t) => (
						<div
							key={t.label}
							className={cn(
								"grid content-between gap-1.5 rounded-xl px-3 py-2.5",
								t.alert ? "bg-warning-soft text-warning" : "bg-surface",
							)}
						>
							<dt className={cn("text-xs leading-4", !t.alert && "text-muted-foreground")}>
								{t.label}
							</dt>
							<dd className="flex items-center gap-1 font-mono text-lg tabular-nums leading-6">
								{t.alert ? <CircleHelp className="size-4" aria-hidden="true" /> : null}
								{formatNumber(t.value)}
								{t.alert ? <span className="sr-only"> (needs attention)</span> : null}
							</dd>
						</div>
					))}
				</dl>
				<div className="grid gap-2">
					<p className="text-muted-foreground text-xs">Spend, last 7 days (per currency)</p>
					{spend.length === 0 ? (
						<p className="text-sm text-subtle-foreground">No spend.</p>
					) : (
						<ul className="divide-y divide-border rounded-xl border border-border">
							{spend.map(([currency, amount]) => (
								<li key={currency} className="flex items-center justify-between px-3 py-2 text-sm">
									<span className="font-mono text-muted-foreground text-xs">{currency}</span>
									<span className="font-mono tabular-nums">{formatMoney(amount, currency)}</span>
								</li>
							))}
						</ul>
					)}
				</div>
				{ads.unconfirmed > 0 ? (
					<p className="text-warning text-xs">
						Outcome unknown: the customer must check their ads manager before retrying.
					</p>
				) : null}
			</CardContent>
		</Card>
	);
}

function OverviewSkeleton() {
	return (
		<div className="grid gap-6" aria-hidden="true">
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{Array.from({ length: 4 }, (_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
					<Skeleton key={i} className="h-[118px] rounded-2xl" />
				))}
			</div>
			<div className="grid gap-4 lg:grid-cols-3">
				<Skeleton className="h-72 rounded-2xl" />
				<Skeleton className="h-72 rounded-2xl lg:col-span-2" />
			</div>
		</div>
	);
}

export function OverviewView() {
	const { data, error, isPending, refetch } = useOverview();

	const sum = (counts: Record<string, number>) => Object.values(counts).reduce((a, b) => a + b, 0);

	return (
		<>
			<PageHeader
				title="Overview"
				description={
					data ? (
						<>
							Platform-wide, refreshed every minute. Updated{" "}
							<time dateTime={data.generatedAt} className="font-mono">
								{formatRelative(data.generatedAt)}
							</time>
							.
						</>
					) : (
						"Platform-wide, refreshed every minute."
					)
				}
				actions={
					data ? (
						<Badge tone="success" dot className="animate-fade-in">
							Live
						</Badge>
					) : null
				}
			/>
			{error && !data ? <QueryError error={error} onRetry={() => void refetch()} /> : null}
			{isPending ? <OverviewSkeleton /> : null}
			{data ? (
				<div className="grid gap-6">
					<section aria-labelledby="kpis">
						<h2 id="kpis" className="sr-only">
							Key numbers
						</h2>
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
							<KpiLink href="/users">
								<StatCard
									interactive
									label="Users"
									value={formatNumber(data.users.total)}
									icon={Users}
									hint={`+${formatNumber(data.users.new7d)} in 7 days · ${formatNumber(data.users.disabled)} disabled`}
								/>
							</KpiLink>
							<KpiLink href="/organizations">
								<StatCard
									interactive
									label="Organizations"
									value={formatNumber(data.organizations.total)}
									icon={Building2}
									hint={`+${formatNumber(data.organizations.new7d)} in 7 days · ${formatNumber(data.organizations.deleted)} deleted`}
								/>
							</KpiLink>
							<KpiLink href="/publishing">
								<StatCard
									interactive
									label="Published targets (24h)"
									value={formatNumber(data.publishing.published24h)}
									icon={Send}
									hint={`${formatNumber(data.posts.total)} posts all time (excl. deleted)`}
								/>
							</KpiLink>
							<KpiLink href="/ai">
								<StatCard
									interactive
									label="AI spend this month"
									value={formatUsd(data.ai.spendUsd)}
									icon={DollarSign}
									hint={`Since ${formatDate(data.ai.periodStart)} · ${formatNumber(data.ai.generations.total)} generations`}
								/>
							</KpiLink>
						</div>
					</section>

					<div className="grid gap-4 lg:grid-cols-3">
						<NeedsAttention
							issues={[
								{
									label: "Failed targets",
									description: "Last 24 hours",
									count: data.publishing.failed24h,
									href: "/publishing?status=failed",
									icon: XCircle,
									tone: "danger",
								},
								{
									label: "Unconfirmed targets",
									description: "Last 24 hours · outcome unknown",
									count: data.publishing.unconfirmed24h,
									href: "/publishing?status=unconfirmed",
									icon: CircleHelp,
									tone: "warning",
								},
								{
									label: "Channels needing reconnect",
									description: `${formatNumber(data.channels.active)} active of ${formatNumber(data.channels.total)}`,
									count: data.channels.needsReauth,
									href: "/organizations",
									icon: Radio,
									tone: "warning",
								},
							]}
						/>
						<div className="lg:col-span-2">
							<BreakdownCard
								title="Posts by status"
								total={sum(data.posts.byStatus)}
								totalLabel="posts"
							>
								<Distribution
									counts={data.posts.byStatus}
									meta={(k) => statusMeta(POST_STATUS, k)}
								/>
							</BreakdownCard>
						</div>
					</div>

					<div className={cn("grid gap-4", data.ads && "lg:grid-cols-3")}>
						{data.ads ? <AdsCard ads={data.ads} /> : null}
						<div className={cn(data.ads && "lg:col-span-2")}>
							<BreakdownCard
								title="AI generations by status (this month)"
								total={data.ai.generations.total}
								totalLabel="generations"
							>
								<Distribution
									counts={data.ai.generations.byStatus}
									meta={(k) => statusMeta(GENERATION_STATUS, k)}
								/>
							</BreakdownCard>
						</div>
					</div>
				</div>
			) : null}
		</>
	);
}
