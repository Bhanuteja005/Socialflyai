"use client";

import { Button } from "@socialfly/ui/components/button";
import { Card } from "@socialfly/ui/components/card";
import { EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import { SectionHeader, StatCard } from "@socialfly/ui/components/page";
import {
	AlertTriangle,
	ArrowRight,
	CalendarClock,
	CalendarDays,
	CheckCircle2,
	Inbox,
	PenSquare,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useChannels, usePosts } from "@/hooks/queries";
import { useInboxCounts } from "@/hooks/use-inbox";
import { useCurrentUser } from "@/hooks/use-session";
import type { Post } from "@/lib/api-types";
import { AnalyticsSnapshot } from "../analytics/analytics-snapshot";
import { useOrg } from "../org-provider";
import { PageHeader } from "../page-header";
import { PostRow } from "../posts/post-row";
import { ChannelHealth } from "./channel-health";
import { CreateShortcuts } from "./create-shortcuts";
import { SetupChecklist } from "./setup-checklist";

const DAY = 86_400_000;

function greeting() {
	const h = new Date().getHours();
	return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** yyyy-mm-dd in the org's zone, so "Today" means the organization's today. */
const dayKey = (d: Date, timeZone: string) =>
	new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(d);

function dayLabel(date: Date, timeZone: string, now: number) {
	const key = dayKey(date, timeZone);
	if (key === dayKey(new Date(now), timeZone)) return "Today";
	if (key === dayKey(new Date(now + DAY), timeZone)) return "Tomorrow";
	return new Intl.DateTimeFormat(undefined, {
		timeZone,
		weekday: "long",
		month: "short",
		day: "numeric",
	}).format(date);
}

function groupByDay(posts: Post[], timeZone: string, now: number) {
	const groups: { label: string; posts: Post[] }[] = [];
	for (const p of posts) {
		if (!p.scheduledAt) continue;
		const label = dayLabel(new Date(p.scheduledAt), timeZone, now);
		const last = groups.at(-1);
		if (last?.label === label) last.posts.push(p);
		else groups.push({ label, posts: [p] });
	}
	return groups;
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
	const inbox = useInboxCounts();

	const { upcoming, attention, publishedWeek, scheduledWeek } = useMemo(() => {
		const list = posts.data ?? [];
		const time = (p: (typeof list)[number]) =>
			p.scheduledAt ? new Date(p.scheduledAt).getTime() : 0;
		const upcoming = list
			.filter((p) => p.status === "scheduled" && time(p) >= range.now)
			.sort((a, b) => time(a) - time(b))
			.slice(0, 8);
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
	const groups = groupByDay(upcoming, org.timezone, range.now);
	const today = new Intl.DateTimeFormat(undefined, {
		timeZone: org.timezone,
		weekday: "long",
		month: "long",
		day: "numeric",
	}).format(new Date(range.now));

	return (
		<>
			<PageHeader
				eyebrow={today}
				title={`${greeting()}${firstName ? `, ${firstName}` : ""}`}
				description={`Here's what's happening across ${org.name}.`}
				actions={
					<>
						<Button asChild variant="outline">
							<Link href="/calendar">
								<CalendarDays />
								Calendar
							</Link>
						</Button>
						{can("editor") ? (
							<Button asChild variant="brand">
								<Link href="/compose">
									<PenSquare />
									Create post
								</Link>
							</Button>
						) : null}
					</>
				}
			/>

			<SetupChecklist />

			<div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
				<Link
					href="/calendar"
					className="group rounded-2xl focus-visible:outline-2 focus-visible:outline-ring"
				>
					<StatCard
						interactive
						label="Scheduled"
						value={scheduledWeek}
						hint="Next 7 days"
						tone="primary"
						icon={CalendarClock}
						loading={loading}
					/>
				</Link>
				<Link
					href="/posts?status=published"
					className="group rounded-2xl focus-visible:outline-2 focus-visible:outline-ring"
				>
					<StatCard
						interactive
						label="Published"
						value={publishedWeek}
						hint="Last 7 days"
						tone="success"
						icon={CheckCircle2}
						loading={loading}
					/>
				</Link>
				<Link
					href="/posts?status=failed"
					className="group rounded-2xl focus-visible:outline-2 focus-visible:outline-ring"
				>
					<StatCard
						interactive
						label="Needs attention"
						value={attention.length}
						hint={attention.length ? "Failed or unconfirmed" : "All clear"}
						icon={AlertTriangle}
						tone={attention.length ? "danger" : "neutral"}
						loading={loading}
					/>
				</Link>
				<Link
					href="/inbox"
					className="group rounded-2xl focus-visible:outline-2 focus-visible:outline-ring"
				>
					<StatCard
						interactive
						label="Inbox"
						value={inbox.data?.new ?? 0}
						hint="Unread conversations"
						icon={Inbox}
						loading={inbox.isPending}
					/>
				</Link>
			</div>

			<div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
				<div className="grid min-w-0 grid-cols-1 gap-8">
					<section aria-labelledby="up-next">
						<SectionHeader
							title={<span id="up-next">Up next</span>}
							description="Scheduled posts for the next 30 days"
							actions={
								<Button variant="ghost" size="sm" asChild>
									<Link href="/calendar">
										Open calendar
										<ArrowRight />
									</Link>
								</Button>
							}
						/>
						{loading ? (
							<Card className="grid gap-3 p-4">
								{["a", "b", "c", "d"].map((k) => (
									<Skeleton key={k} className="h-14" />
								))}
							</Card>
						) : groups.length ? (
							<Card className="overflow-hidden rounded-3xl">
								{groups.map((g) => (
									<div key={g.label}>
										<p className="flex items-center gap-2 border-border border-b bg-surface px-4 py-2 font-mono text-muted-foreground text-xs">
											{g.label === "Today" ? (
												<span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
											) : null}
											{g.label}
											<span className="text-subtle-foreground">· {g.posts.length}</span>
										</p>
										<ul className="divide-y divide-border border-border border-b last:border-b-0">
											{g.posts.map((p) => (
												<PostRow key={p.id} post={p} timeZone={org.timezone} timeOnly />
											))}
										</ul>
									</div>
								))}
							</Card>
						) : (
							<EmptyState
								icon={CalendarClock}
								title="Nothing scheduled yet"
								description={
									noChannels
										? "Connect a channel, then plan your first post."
										: "Posts you schedule for the next 30 days show up here."
								}
								action={
									can("editor") && !noChannels ? (
										<Button asChild size="sm">
											<Link href="/compose">
												<PenSquare />
												Schedule a post
											</Link>
										</Button>
									) : null
								}
							/>
						)}
					</section>

					{attention.length ? (
						<section aria-labelledby="attention">
							<SectionHeader
								title={
									<span id="attention" className="flex items-center gap-2">
										<span className="size-1.5 rounded-full bg-danger" aria-hidden="true" />
										Needs attention
									</span>
								}
								description="These didn't publish everywhere — check each channel and retry."
							/>
							<Card className="overflow-hidden rounded-3xl">
								<ul className="divide-y divide-border">
									{attention.map((p) => (
										<PostRow key={p.id} post={p} timeZone={org.timezone} />
									))}
								</ul>
							</Card>
						</section>
					) : null}
				</div>

				<aside className="grid min-w-0 grid-cols-1 gap-6" aria-label="Summary">
					{channels.isSuccess && !noChannels ? <AnalyticsSnapshot /> : null}
					<ChannelHealth />
					{can("editor") ? <CreateShortcuts /> : null}
				</aside>
			</div>
		</>
	);
}
