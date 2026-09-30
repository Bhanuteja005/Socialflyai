import { Tooltip } from "@socialfly/ui/components/controls";
import { cn } from "@socialfly/ui/utils";
import { ImageIcon } from "lucide-react";
import Link from "next/link";
import type { Post } from "@/lib/api-types";
import { formatDateTime, formatRelative, formatTime } from "@/lib/format";
import { TARGET_STATUS } from "@/lib/status";
import { ChannelAvatar, PostStatusBadge } from "../status-badge";

function PostThumb({ post }: { post: Post }) {
	const first = post.media[0];
	if (!first) return null;
	return (
		<span className="relative size-11 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
			{first.kind === "video" ? (
				<video
					src={`${first.url}#t=0.1`}
					preload="metadata"
					muted
					playsInline
					className="size-full object-cover"
				/>
			) : (
				// biome-ignore lint/performance/noImgElement: user media from a runtime-configured storage host
				<img
					src={first.url}
					alt=""
					loading="lazy"
					decoding="async"
					className="size-full object-cover"
				/>
			)}
			{post.media.length > 1 ? (
				<span className="absolute right-0.5 bottom-0.5 rounded bg-black/65 px-1 font-medium text-[9px] text-white">
					+{post.media.length - 1}
				</span>
			) : null}
		</span>
	);
}

/** The channels of a post, each with a status dot. */
export function TargetStack({ targets, max = 5 }: { targets: Post["targets"]; max?: number }) {
	const shown = targets.slice(0, max);
	return (
		<span className="flex items-center gap-1">
			{shown.map((t) => (
				<Tooltip key={t.id} content={`${t.channel.name}: ${TARGET_STATUS[t.status].label}`}>
					<span className="relative inline-flex">
						<ChannelAvatar channel={t.channel} size="sm" />
						<span
							className={cn(
								"absolute -top-0.5 -left-0.5 size-2.5 rounded-full ring-2 ring-surface-raised",
								TARGET_STATUS[t.status].dot,
							)}
							aria-hidden="true"
						/>
						<span className="sr-only">
							{t.channel.name}: {TARGET_STATUS[t.status].label}
						</span>
					</span>
				</Tooltip>
			))}
			{targets.length > max ? (
				<span className="text-muted-foreground text-xs">+{targets.length - max}</span>
			) : null}
		</span>
	);
}

export function postExcerpt(post: Post) {
	const text =
		post.content.trim() || post.targets.find((t) => t.contentOverride)?.contentOverride?.trim();
	return text || (post.media.length ? "Media post" : "Untitled post");
}

export function PostRow({
	post,
	timeZone,
	timeOnly = false,
}: {
	post: Post;
	timeZone: string;
	/** Inside a day-grouped list the date is in the group header; show just the time. */
	timeOnly?: boolean;
}) {
	const failedCount = post.targets.filter(
		(t) => t.status === "failed" || t.status === "unconfirmed",
	).length;
	return (
		<li>
			<Link
				href={`/posts/${post.id}`}
				className="flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-surface focus-visible:bg-surface focus-visible:outline-none sm:flex-row sm:items-center sm:gap-4"
			>
				{timeOnly && post.scheduledAt ? (
					<time
						dateTime={post.scheduledAt}
						className="w-16 shrink-0 font-medium text-[13px] tabular-nums sm:text-right"
					>
						{formatTime(post.scheduledAt, timeZone)}
					</time>
				) : null}
				<PostThumb post={post} />
				<div className="grid min-w-0 flex-1 grid-cols-1 gap-1">
					<p className="line-clamp-2 text-sm leading-snug sm:line-clamp-1">{postExcerpt(post)}</p>
					<p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
						{timeOnly ? (
							<span className="truncate">
								{post.targets.map((t) => t.channel.name).join(" · ")}
							</span>
						) : post.scheduledAt ? (
							<time dateTime={post.scheduledAt} title={formatRelative(post.scheduledAt)}>
								{formatDateTime(post.scheduledAt, timeZone)}
							</time>
						) : (
							<span>Not scheduled · updated {formatRelative(post.updatedAt)}</span>
						)}
						{post.media.length ? (
							<span className="inline-flex items-center gap-1">
								<ImageIcon className="size-3" aria-hidden="true" />
								{post.media.length}
							</span>
						) : null}
						{failedCount ? <span className="text-danger">{failedCount} need attention</span> : null}
					</p>
				</div>
				<div className="flex items-center justify-between gap-3 sm:justify-end">
					<TargetStack targets={post.targets} />
					<PostStatusBadge status={post.status} />
				</div>
			</Link>
		</li>
	);
}
