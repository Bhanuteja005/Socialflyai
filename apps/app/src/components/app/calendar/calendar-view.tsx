"use client";

import { Button } from "@socialfly/ui/components/button";
import { Skeleton } from "@socialfly/ui/components/feedback";
import { Tabs, TabsList, TabsTrigger } from "@socialfly/ui/components/tabs";
import { toast } from "@socialfly/ui/components/toast";
import { cn } from "@socialfly/ui/utils";
import { ChevronLeft, ChevronRight, Globe2, PenSquare, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePosts } from "@/hooks/queries";
import type { Post } from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { zoneLabel } from "@/lib/format";
import { POST_STATUS } from "@/lib/status";
import { dateKey, type PlainDate, todayIn } from "@/lib/timezone";
import { useOrg } from "../org-provider";
import { PageHeader } from "../page-header";
import {
	composeDateFor,
	groupByDay,
	rangeFor,
	shift,
	title,
	type CalendarView as View,
	visibleDays,
	weekdayLabel,
} from "./calendar-utils";
import { PostCard, PostChip } from "./post-chip";

const VIEW_KEY = "sf-calendar-view";
const MAX_CHIPS = 3;

export function CalendarView() {
	const { org, can } = useOrg();
	const tz = org.timezone;
	const today = useMemo(() => todayIn(tz), [tz]);
	const [view, setView] = useState<View>("month");
	const [anchor, setAnchor] = useState<PlainDate>(today);
	const [selected, setSelected] = useState<PlainDate>(today);

	useEffect(() => {
		try {
			if (localStorage.getItem(VIEW_KEY) === "week") setView("week");
		} catch {
			// ignore
		}
	}, []);

	const changeView = (next: View) => {
		setView(next);
		setAnchor(selected);
		try {
			localStorage.setItem(VIEW_KEY, next);
		} catch {
			// ignore
		}
	};

	const days = useMemo(() => visibleDays(view, anchor), [view, anchor]);
	const range = useMemo(() => rangeFor(days, tz), [days, tz]);
	const posts = usePosts({ from: range.from, to: range.to, limit: "500" });
	const byDay = useMemo(() => groupByDay(posts.data ?? [], tz), [posts.data, tz]);

	useEffect(() => {
		if (posts.isError) toast.error(errorMessage(posts.error, "Couldn't load the calendar"));
	}, [posts.isError, posts.error]);

	const editor = can("editor");
	const selectedPosts = byDay.get(dateKey(selected)) ?? [];

	return (
		<>
			<PageHeader
				title="Calendar"
				description="Plan and review everything going out, across every channel."
				actions={
					editor ? (
						<Button asChild variant="brand">
							<Link href="/compose">
								<PenSquare />
								Create post
							</Link>
						</Button>
					) : null
				}
			/>
			<div className="overflow-hidden rounded-xl border border-border bg-surface-raised shadow-card">
				<div className="flex flex-wrap items-center justify-between gap-3 border-border border-b px-4 py-3">
					<div className="flex items-center gap-3">
						<div className="flex items-center rounded-lg border border-border bg-surface-raised shadow-xs">
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={`Previous ${view}`}
								onClick={() => setAnchor((a) => shift(view, a, -1))}
							>
								<ChevronLeft />
							</Button>
							<Button
								variant="ghost"
								size="sm"
								className="rounded-none border-border border-x"
								onClick={() => {
									setAnchor(today);
									setSelected(today);
								}}
							>
								Today
							</Button>
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={`Next ${view}`}
								onClick={() => setAnchor((a) => shift(view, a, 1))}
							>
								<ChevronRight />
							</Button>
						</div>
						<h2 className="font-semibold text-base tracking-tight" aria-live="polite">
							{title(view, anchor, days)}
						</h2>
					</div>
					<div className="flex items-center gap-3">
						<span className="hidden items-center gap-1.5 text-muted-foreground text-xs md:flex">
							<Globe2 className="size-3.5" aria-hidden="true" />
							{tz.replace(/_/g, " ")} ({zoneLabel(tz)})
						</span>
						<Tabs value={view} onValueChange={(v) => changeView(v as View)}>
							<TabsList aria-label="Calendar view">
								<TabsTrigger value="month">Month</TabsTrigger>
								<TabsTrigger value="week">Week</TabsTrigger>
							</TabsList>
						</Tabs>
					</div>
				</div>

				<div className="relative bg-border">
					<div className="grid grid-cols-7 gap-px">
						{days.slice(0, 7).map((d) => (
							<div
								key={`h-${dateKey(d)}`}
								className="bg-surface px-2.5 py-2 font-medium text-muted-foreground text-xs"
							>
								<span className="hidden sm:inline">{weekdayLabel(d)}</span>
								<span className="sm:hidden">{weekdayLabel(d, "narrow")}</span>
							</div>
						))}
						{days.map((d) => {
							const key = dateKey(d);
							const list = byDay.get(key) ?? [];
							const outside = view === "month" && d.month !== anchor.month;
							const isToday = key === dateKey(today);
							const isSelected = key === dateKey(selected);
							const past = key < dateKey(today);
							return (
								<DayCell
									key={key}
									day={d}
									posts={list}
									view={view}
									outside={outside}
									isToday={isToday}
									isSelected={isSelected}
									canCreate={editor && !past}
									loading={posts.isPending}
									timeZone={tz}
									onSelect={() => setSelected(d)}
									onMore={() => {
										setSelected(d);
										changeView("week");
										setAnchor(d);
									}}
								/>
							);
						})}
					</div>
				</div>
			</div>

			{/* Day agenda: the readable view on small screens, where cells only show dots. */}
			<section className="mt-6 sm:hidden" aria-label="Selected day">
				<h3 className="mb-2 font-medium text-sm">
					{weekdayLabel(selected)} {selected.day}
				</h3>
				{selectedPosts.length ? (
					<div className="grid gap-2">
						{selectedPosts.map((p) => (
							<PostCard key={p.id} post={p} timeZone={tz} />
						))}
					</div>
				) : (
					<p className="text-muted-foreground text-sm">Nothing scheduled.</p>
				)}
			</section>

			<ul
				className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs"
				aria-label="Legend"
			>
				{(["scheduled", "published", "partially_published", "failed", "draft"] as const).map(
					(s) => (
						<li key={s} className="flex items-center gap-1.5">
							<span className={cn("size-2 rounded-full", POST_STATUS[s].dot)} aria-hidden="true" />
							{POST_STATUS[s].label}
						</li>
					),
				)}
			</ul>
		</>
	);
}

function DayCell({
	day,
	posts,
	view,
	outside,
	isToday,
	isSelected,
	canCreate,
	loading,
	timeZone,
	onSelect,
	onMore,
}: {
	day: PlainDate;
	posts: Post[];
	view: View;
	outside: boolean;
	isToday: boolean;
	isSelected: boolean;
	canCreate: boolean;
	loading: boolean;
	timeZone: string;
	onSelect: () => void;
	onMore: () => void;
}) {
	const week = view === "week";
	const hidden = posts.length - MAX_CHIPS;
	return (
		<div
			className={cn(
				"group relative flex flex-col gap-1 bg-surface-raised p-1.5 transition-colors",
				week ? "min-h-16 sm:min-h-[26rem]" : "min-h-16 sm:min-h-32",
				outside && "bg-surface",
				// Layered over an opaque base: the grid behind the cells is the border colour.
				isToday && "bg-[linear-gradient(var(--primary-soft),var(--primary-soft))]",
				isSelected && "max-sm:bg-[linear-gradient(var(--primary-soft),var(--primary-soft))]",
			)}
		>
			<div className="flex items-center justify-between">
				<button
					type="button"
					onClick={onSelect}
					className={cn(
						"flex size-6 cursor-pointer items-center justify-center rounded-full text-xs tabular-nums focus-visible:outline-2 focus-visible:outline-ring",
						isToday
							? "bg-primary font-semibold text-primary-foreground"
							: outside
								? "text-subtle-foreground"
								: "text-foreground",
					)}
					aria-label={`Select ${weekdayLabel(day)} ${day.day}${posts.length ? `, ${posts.length} posts` : ""}`}
					aria-pressed={isSelected}
				>
					{day.day}
				</button>
				{canCreate ? (
					<Link
						href={`/compose?date=${encodeURIComponent(composeDateFor(day, timeZone))}`}
						className="hidden size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 sm:flex"
						aria-label={`Create a post on ${weekdayLabel(day)} ${day.day}`}
					>
						<Plus className="size-3.5" aria-hidden="true" />
					</Link>
				) : null}
			</div>

			{loading ? (
				<Skeleton className="hidden h-5 sm:block" />
			) : (
				<>
					{week ? (
						<div className="hidden gap-1.5 sm:grid">
							{posts.map((p) => (
								<PostCard key={p.id} post={p} timeZone={timeZone} />
							))}
						</div>
					) : null}
					<div className={cn("hidden min-w-0 gap-1", !week && "sm:grid")}>
						{posts.slice(0, MAX_CHIPS).map((p) => (
							<PostChip key={p.id} post={p} timeZone={timeZone} />
						))}
						{hidden > 0 ? (
							<button
								type="button"
								onClick={onMore}
								className="cursor-pointer rounded px-1 text-left font-medium text-[11px] text-muted-foreground hover:text-foreground"
							>
								+{hidden} more
							</button>
						) : null}
					</div>
					<div className="flex flex-wrap gap-0.5 sm:hidden" aria-hidden="true">
						{posts.slice(0, 4).map((p) => (
							<span key={p.id} className={cn("size-1.5 rounded-full", POST_STATUS[p.status].dot)} />
						))}
					</div>
				</>
			)}
		</div>
	);
}
