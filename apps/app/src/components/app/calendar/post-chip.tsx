import { cn } from "@socialfly/ui/utils";
import Link from "next/link";
import type { Post } from "@/lib/api-types";
import { formatTime } from "@/lib/format";
import { POST_STATUS } from "@/lib/status";
import { postExcerpt, TargetStack } from "../posts/post-row";
import { ProviderIcon } from "../provider-icon";

const STATUS_BORDER: Record<Post["status"], string> = {
	draft: "border-l-subtle-foreground",
	pending_approval: "border-l-violet",
	scheduled: "border-l-info",
	publishing: "border-l-warning",
	published: "border-l-success",
	partially_published: "border-l-warning",
	failed: "border-l-danger",
	canceled: "border-l-border-strong",
};

/** Compact post in a month cell. */
export function PostChip({ post, timeZone }: { post: Post; timeZone: string }) {
	const providers = [...new Set(post.targets.map((t) => t.channel.provider))].slice(0, 3);
	return (
		<Link
			href={`/posts/${post.id}`}
			className={cn(
				"flex min-w-0 items-center gap-1.5 rounded-[5px] border border-border border-l-[3px] bg-surface-raised px-1.5 py-1 text-[11px] leading-tight shadow-xs transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
				STATUS_BORDER[post.status],
				post.status === "canceled" && "opacity-60",
			)}
			title={`${POST_STATUS[post.status].label}: ${postExcerpt(post)}`}
		>
			<span className="shrink-0 font-medium text-muted-foreground tabular-nums">
				{post.scheduledAt ? formatTime(post.scheduledAt, timeZone) : ""}
			</span>
			<span className="min-w-0 flex-1 truncate">{postExcerpt(post)}</span>
			<span className="hidden shrink-0 -space-x-1 xl:flex">
				{providers.map((p) => (
					<ProviderIcon key={p} provider={p} size="xs" className="ring-1 ring-surface-raised" />
				))}
			</span>
			<span className="sr-only">{POST_STATUS[post.status].label}</span>
		</Link>
	);
}

/** Roomier card for the week view and the day agenda. */
export function PostCard({ post, timeZone }: { post: Post; timeZone: string }) {
	return (
		<Link
			href={`/posts/${post.id}`}
			className={cn(
				"grid gap-2 rounded-md border border-border border-l-[3px] bg-surface-raised p-2.5 shadow-xs transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
				STATUS_BORDER[post.status],
			)}
		>
			<div className="flex items-center justify-between gap-2 text-xs">
				<span className="font-medium tabular-nums">
					{post.scheduledAt ? formatTime(post.scheduledAt, timeZone) : ""}
				</span>
				<span className="text-muted-foreground">{POST_STATUS[post.status].label}</span>
			</div>
			<p className="line-clamp-3 text-xs leading-snug">{postExcerpt(post)}</p>
			<TargetStack targets={post.targets} max={4} />
		</Link>
	);
}
