"use client";

import { Button } from "@socialfly/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@socialfly/ui/components/card";
import { EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import {
	AlertTriangle,
	ArrowRight,
	CalendarClock,
	CheckCircle2,
	type LucideIcon,
	PenSquare,
	Radio,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useChannels, usePosts } from "@/hooks/queries";
import { useCurrentUser } from "@/hooks/use-session";
import { AnalyticsSnapshot } from "../analytics/analytics-snapshot";
import { useOrg } from "../org-provider";
import { PageHeader } from "../page-header";
import { PostRow } from "../posts/post-row";
import { ChannelHealth } from "./channel-health";

const DAY = 86_400_000;

function Stat({
	label,
	value,
	icon: Icon,
	tone,
	href,
	loading,
}: {
	label: string;
	value: number | string;
	icon: LucideIcon;
	tone: string;
	href: string;
	loading: boolean;
}) {
	return (
		<Link
			href={href}
			className="group flex items-center gap-3 rounded-lg border border-border bg-surface-raised p-4 shadow-xs transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-ring"
		>
			<span className={`flex size-9 items-center justify-center rounded-md ${tone}`}>
				<Icon className="size-4.5" aria-hidden="true" />
			</span>
			<span className="grid">
				{loading ? (
					<Skeleton className="mb-1 h-6 w-10" />
				) : (
					<span className="font-semibold text-xl tabular-nums leading-7">{value}</span>
				)}
				<span className="text-muted-foreground text-xs">{label}</span>
			</span>
		</Link>
	);
}

function greeting() {
	const h = new Date().getHours();
	return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function DashboardView() {
	const { org, can } = useOrg();
	const user = useCurrentUser();
	// Stable window for this visit: last 30 days → next 30 days.
	const [range] = useState(() => {
		const now = Date.now();
		return {
			now,
			from: new Date(now - 30 * DAY).toISOString(),
			to: new Date(now + 30 * DAY).toISOString(),
		};
	});
	const posts = usePosts(
		{ from: range.from, to: range.to, limit: "500" },
		{ refetchInterval: 60_000 },
	);
	const channels = useChannels();

	const { upcoming, attention, publishedWeek, scheduledWeek } = useMemo(() => {
		const list = posts.data ?? [];
		const time = (p: (typeof list)[number]) =>
			p.scheduledAt ? new Date(p.scheduledAt).getTime() : 0;
		const upcoming = list
			.filter((p) => p.status === "scheduled" && time(p) >= range.now)
			.slice(0, 6);
		const attention = list
			.filter((p) => p.targets.some((t) => t.status === "failed" || t.status === "unconfirmed"))
			.sort((a, b) => time(b) - time(a))
			.slice(0, 6);
		const publishedWeek = list.filter(
			(p) =>
				(p.status === "published" || p.status === "partially_published") &&
				time(p) >= range.now - 7 * DAY,
		).length;
		const scheduledWeek = list.filter(
			(p) => p.status === "scheduled" && time(p) >= range.now && time(p) <= range.now + 7 * DAY,
		).length;
		return { upcoming, attention, publishedWeek, scheduledWeek };
	}, [posts.data, range.now]);

	const firstName = user?.name?.split(" ")[0];
	const loading = posts.isPending;
	const noChannels = channels.isSuccess && channels.data.length === 0;

	return (
		<>
			<PageHeader
				title={`${greeting()}${firstName ? `, ${firstName}` : ""}`}
				description={`Here's what's happening in ${org.name}.`}
				actions={
					can("editor") ? (
						<Button asChild>
							<Link href="/compose">
								<PenSquare />
								Create post
							</Link>
						</Button>
					) : null
				}
			/>

			{noChannels ? (
				<Card className="mb-6 overflow-hidden">
					<CardContent className="flex flex-col gap-4 bg-gradient-to-br from-primary-soft to-transparent sm:flex-row sm:items-center">
						<span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
							<Radio className="size-5" aria-hidden="true" />
						</span>
						<div className="grid flex-1 gap-0.5">
							<p className="font-semibold">Connect your first channel</p>
							<p className="text-muted-foreground text-sm">
								Link X, LinkedIn, Instagram and more to start scheduling posts.
							</p>
						</div>
						<Button asChild>
							<Link href="/channels">
								Connect a channel
								<ArrowRight />
							</Link>
						</Button>
					</CardContent>
				</Card>
			) : null}

			<div className="mb-6 grid gap-3 sm:grid-cols-3">
				<Stat
					label="Scheduled in the next 7 days"
					value={scheduledWeek}
					icon={CalendarClock}
					tone="bg-info-soft text-info"
					href="/calendar"
					loading={loading}
				/>
				<Stat
					label="Published in the last 7 days"
					value={publishedWeek}
					icon={CheckCircle2}
					tone="bg-success-soft text-success"
					href="/posts?status=published"
					loading={loading}
				/>
				<Stat
					label="Posts needing attention"
					value={attention.length}
					icon={AlertTriangle}
					tone="bg-danger-soft text-danger"
					href="/posts?status=failed"
					loading={loading}
				/>
			</div>

			<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
				<div className="grid gap-6">
					<Card>
						<CardHeader className="flex-row items-center justify-between">
							<CardTitle>Upcoming</CardTitle>
							<Button variant="link" size="sm" asChild>
								<Link href="/calendar">Open calendar</Link>
							</Button>
						</CardHeader>
						<CardContent className="p-0 pt-3">
							{loading ? (
								<div className="grid gap-3 p-5 pt-2">
									{["a", "b", "c"].map((k) => (
										<Skeleton key={k} className="h-12" />
									))}
								</div>
							) : upcoming.length ? (
								<ul className="divide-y divide-border border-border border-t">
									{upcoming.map((p) => (
										<PostRow key={p.id} post={p} timeZone={org.timezone} />
									))}
								</ul>
							) : (
								<div className="p-5 pt-2">
									<EmptyState
										compact
										icon={CalendarClock}
										title="Nothing scheduled"
										description="Posts you schedule for the next 30 days show up here."
									/>
								</div>
							)}
						</CardContent>
					</Card>

					{attention.length ? (
						<Card className="border-danger/30">
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<AlertTriangle className="size-4 text-danger" aria-hidden="true" />
									Needs attention
								</CardTitle>
							</CardHeader>
							<CardContent className="p-0 pt-3">
								<ul className="divide-y divide-border border-border border-t">
									{attention.map((p) => (
										<PostRow key={p.id} post={p} timeZone={org.timezone} />
									))}
								</ul>
							</CardContent>
						</Card>
					) : null}
				</div>
				<div className="grid gap-6">
					{channels.isSuccess && !noChannels ? <AnalyticsSnapshot /> : null}
					<ChannelHealth />
				</div>
			</div>
		</>
	);
}
