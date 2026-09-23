"use client";

import { PenSquare, Rows3 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useChannels, usePosts } from "@/hooks/queries";
import type { PostStatus } from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { POST_STATUS, POST_STATUSES } from "@/lib/status";
import { useOrg } from "../org-provider";
import { PageHeader } from "../page-header";
import { PostRow } from "./post-row";

const ALL = "all";

export function PostsView() {
	const { org, can } = useOrg();
	const params = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();
	const statusParam = params.get("status");
	const status = POST_STATUSES.includes(statusParam as PostStatus)
		? (statusParam as PostStatus)
		: undefined;
	const channelId = params.get("channel") ?? undefined;
	const channels = useChannels();
	const posts = usePosts({ status, channelId, limit: "500" });

	const setFilter = (key: string, value: string) => {
		const next = new URLSearchParams(params);
		if (value === ALL) next.delete(key);
		else next.set(key, value);
		router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
	};

	const filtered = Boolean(status || channelId);

	return (
		<>
			<PageHeader
				title="Posts"
				description="Everything planned, sent and in draft."
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
			<div className="mb-4 flex flex-wrap gap-2">
				<Select value={status ?? ALL} onValueChange={(v) => setFilter("status", v)}>
					<SelectTrigger className="w-44" aria-label="Filter by status">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ALL}>All statuses</SelectItem>
						{POST_STATUSES.map((s) => (
							<SelectItem key={s} value={s}>
								{POST_STATUS[s].label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select value={channelId ?? ALL} onValueChange={(v) => setFilter("channel", v)}>
					<SelectTrigger className="w-52" aria-label="Filter by channel">
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
					<Button variant="ghost" onClick={() => router.replace(pathname, { scroll: false })}>
						Clear filters
					</Button>
				) : null}
			</div>

			{posts.isPending ? (
				<div className="overflow-hidden rounded-lg border border-border">
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
				</div>
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
			) : posts.data.length === 0 ? (
				<EmptyState
					icon={Rows3}
					title={filtered ? "No posts match these filters" : "No posts yet"}
					description={
						filtered
							? "Try a different status or channel."
							: "Create your first post and schedule it to one or more channels."
					}
					action={
						!filtered && can("editor") ? (
							<Button asChild>
								<Link href="/compose">Create post</Link>
							</Button>
						) : null
					}
				/>
			) : (
				<ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface-raised">
					{posts.data.map((post) => (
						<PostRow key={post.id} post={post} timeZone={org.timezone} />
					))}
				</ul>
			)}
		</>
	);
}
