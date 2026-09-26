"use client";

import { Button } from "@socialfly/ui/components/button";
import { Card } from "@socialfly/ui/components/card";
import { EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import { Input } from "@socialfly/ui/components/input";
import { SectionHeader } from "@socialfly/ui/components/page";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@socialfly/ui/components/select";
import { cn } from "@socialfly/ui/utils";
import { PenSquare, Rows3, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useChannels, usePosts } from "@/hooks/queries";
import type { Post, PostStatus } from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { POST_STATUSES } from "@/lib/status";
import { useOrg } from "../org-provider";
import { PageHeader } from "../page-header";
import { PostRow, postExcerpt } from "./post-row";

const ALL = "all";

/** Status tabs. "Published" also shows partial successes; anything else lives under All. */
const TABS: { value: string; label: string; match: (s: PostStatus) => boolean }[] = [
	{ value: ALL, label: "All", match: () => true },
	{ value: "scheduled", label: "Scheduled", match: (s) => s === "scheduled" },
	{ value: "draft", label: "Drafts", match: (s) => s === "draft" },
	{ value: "pending_approval", label: "Approval", match: (s) => s === "pending_approval" },
	{
		value: "published",
		label: "Published",
		match: (s) => s === "published" || s === "partially_published",
	},
	{ value: "failed", label: "Failed", match: (s) => s === "failed" },
];

type Bucket = { key: string; title: string; description: string; posts: Post[] };

/** All-posts view: what needs a decision first, then drafts, then the timeline both ways. */
function bucketize(posts: Post[], now: number): Bucket[] {
	const time = (p: Post) => (p.scheduledAt ? new Date(p.scheduledAt).getTime() : 0);
	const approval = posts.filter((p) => p.status === "pending_approval");
	const drafts = posts.filter((p) => p.status === "draft");
	const rest = posts.filter((p) => p.status !== "pending_approval" && p.status !== "draft");
	const upcoming = rest.filter((p) => time(p) >= now).sort((a, b) => time(a) - time(b));
	const past = rest.filter((p) => time(p) < now).sort((a, b) => time(b) - time(a));
	return [
		{
			key: "approval",
			title: "Waiting for approval",
			description: "An approver needs to sign these off.",
			posts: approval,
		},
		{ key: "drafts", title: "Drafts", description: "Not scheduled yet.", posts: drafts },
		{
			key: "upcoming",
			title: "Upcoming",
			description: "Scheduled, soonest first.",
			posts: upcoming,
		},
		{
			key: "past",
			title: "Sent",
			description: "Published or attempted, newest first.",
			posts: past,
		},
	].filter((b) => b.posts.length > 0);
}

export function PostsView() {
	const { org, can } = useOrg();
	const params = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();
	const statusParam = params.get("status");
	const tab = TABS.find((t) => t.value === statusParam) ?? TABS[0];
	// Deep links may carry any status (e.g. ?status=canceled); honour it even without a tab.
	const exactStatus =
		!TABS.some((t) => t.value === statusParam) && POST_STATUSES.includes(statusParam as PostStatus)
			? (statusParam as PostStatus)
			: undefined;
	const channelId = params.get("channel") ?? undefined;
	const [query, setQuery] = useState("");
	const [now] = useState(() => Date.now());
	const channels = useChannels();
	// One fetch for every tab so the tab counts stay right; filtering is client-side.
	const posts = usePosts({ channelId, limit: "500" });

	const setFilter = (key: string, value: string) => {
		const next = new URLSearchParams(params);
		if (value === ALL) next.delete(key);
		else next.set(key, value);
		router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
	};

	const counts = useMemo(() => {
		const list = posts.data ?? [];
		return Object.fromEntries(
			TABS.map((t) => [t.value, list.filter((p) => t.match(p.status)).length]),
		);
	}, [posts.data]);

	const visible = useMemo(() => {
		const q = query.trim().toLowerCase();
		return (posts.data ?? []).filter(
			(p) =>
				(exactStatus ? p.status === exactStatus : tab?.match(p.status)) &&
				(!q || postExcerpt(p).toLowerCase().includes(q)),
		);
	}, [posts.data, tab, exactStatus, query]);

	const filtered = Boolean(statusParam || channelId || query);
	const grouped = tab?.value === ALL && !exactStatus;

	return (
		<>
			<PageHeader
				title="Posts"
				description="Everything planned, sent and in draft — across every channel."
				actions={
					can("editor") ? (
						<Button asChild variant="brand">
							<Link href="/compose">
								<PenSquare />
								Create post
							</Link>
						</Button>
					) : null
				}
			/>

			<div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
				<nav
					aria-label="Filter by status"
					className="scrollbar-thin flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-border bg-muted/70 p-0.5"
				>
					{TABS.map((t) => {
						const active = !exactStatus && t.value === tab?.value;
						return (
							<button
								key={t.value}
								type="button"
								onClick={() => setFilter("status", t.value)}
								aria-current={active ? "page" : undefined}
								className={cn(
									"inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md px-3 font-medium text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-ring",
									active
										? "bg-surface-raised text-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{t.label}
								{posts.data ? (
									<span
										className={cn(
											"rounded px-1 text-[11px] tabular-nums",
											active ? "bg-muted text-muted-foreground" : "text-subtle-foreground",
										)}
									>
										{counts[t.value]}
									</span>
								) : null}
							</button>
						);
					})}
				</nav>
				<div className="flex flex-wrap items-center gap-2">
					<div className="relative w-full sm:w-60">
						<Search
							className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-subtle-foreground"
							aria-hidden="true"
						/>
						<Input
							type="search"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Search posts"
							aria-label="Search posts"
							className="h-8 pl-8 text-[13px]"
						/>
					</div>
					<Select value={channelId ?? ALL} onValueChange={(v) => setFilter("channel", v)}>
						<SelectTrigger className="h-8 w-48 text-[13px]" aria-label="Filter by channel">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={ALL}>All channels</SelectItem>
							{channels.data?.map((c) => (
								<SelectItem key={c.id} value={c.id}>
									{c.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{filtered ? (
						<Button
							variant="ghost"
							size="sm"
							onClick={() => {
								setQuery("");
								router.replace(pathname, { scroll: false });
							}}
						>
							<X />
							Clear
						</Button>
					) : null}
				</div>
			</div>

			{posts.isPending ? (
				<Card className="overflow-hidden">
					{["a", "b", "c", "d", "e"].map((k) => (
						<div
							key={k}
							className="flex items-center gap-4 border-border border-b px-4 py-4 last:border-0"
						>
							<div className="grid flex-1 gap-2">
								<Skeleton className="h-4 w-3/4" />
								<Skeleton className="h-3 w-40" />
							</div>
							<Skeleton className="h-6 w-24" />
						</div>
					))}
				</Card>
			) : posts.isError ? (
				<EmptyState
					title="Couldn't load posts"
					description={errorMessage(posts.error)}
					action={
						<Button variant="outline" onClick={() => posts.refetch()}>
							Retry
						</Button>
					}
				/>
			) : visible.length === 0 ? (
				<EmptyState
					icon={Rows3}
					title={filtered ? "No posts match these filters" : "No posts yet"}
					description={
						filtered
							? "Try a different status, channel or search."
							: "Create your first post and schedule it to one or more channels."
					}
					action={
						!filtered && can("editor") ? (
							<Button asChild>
								<Link href="/compose">
									<PenSquare />
									Create post
								</Link>
							</Button>
						) : null
					}
				/>
			) : grouped ? (
				<div className="grid grid-cols-1 gap-8">
					{bucketize(visible, now).map((b) => (
						<section key={b.key} aria-labelledby={`posts-${b.key}`}>
							<SectionHeader
								title={
									<span id={`posts-${b.key}`}>
										{b.title}{" "}
										<span className="font-normal text-subtle-foreground">{b.posts.length}</span>
									</span>
								}
								description={b.description}
							/>
							<Card className="overflow-hidden">
								<ul className="divide-y divide-border">
									{b.posts.map((post) => (
										<PostRow key={post.id} post={post} timeZone={org.timezone} />
									))}
								</ul>
							</Card>
						</section>
					))}
				</div>
			) : (
				<Card className="overflow-hidden">
					<ul className="divide-y divide-border">
						{visible.map((post) => (
							<PostRow key={post.id} post={post} timeZone={org.timezone} />
						))}
					</ul>
				</Card>
			)}
		</>
	);
}
