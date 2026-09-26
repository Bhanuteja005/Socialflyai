"use client";

import { Avatar } from "@socialfly/ui/components/avatar";
import { cn } from "@socialfly/ui/utils";
import {
	ArrowBigDown,
	ArrowBigUp,
	BarChart2,
	Bookmark,
	Eye,
	Globe2,
	Heart,
	ImageIcon,
	MessageCircle,
	MoreHorizontal,
	Play,
	Repeat2,
	Send,
	Share2,
	ThumbsUp,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import type { Channel, MediaAsset } from "@/lib/api-types";
import { formatDateTime } from "@/lib/format";
import { providerName, type TargetSettings } from "@/lib/providers";
import { ProviderIcon } from "../provider-icon";

type PreviewData = {
	channel: Channel;
	text: string;
	media: MediaAsset[];
	settings: TargetSettings;
	/** Label for when it goes out ("Now", "Sep 24, 2:00 PM"). */
	when: string;
};

const handleOf = (c: Channel) => (c.username ? `@${c.username.replace(/^@/, "")}` : c.name);

/** Long captions are cut like the feeds do, so the preview shows roughly what's above the fold. */
function Caption({
	text,
	limit,
	className,
	prefix,
}: {
	text: string;
	limit: number;
	className?: string;
	prefix?: ReactNode;
}) {
	const [expanded, setExpanded] = useState(false);
	if (!text.trim() && !prefix) return null;
	const cut = !expanded && text.length > limit;
	return (
		<p className={cn("whitespace-pre-wrap break-words text-[14px] leading-relaxed", className)}>
			{prefix}
			{cut ? `${text.slice(0, limit).trimEnd()}… ` : text}
			{cut ? (
				<button
					type="button"
					className="cursor-pointer text-muted-foreground hover:underline"
					onClick={() => setExpanded(true)}
				>
					more
				</button>
			) : null}
		</p>
	);
}

function MediaTile({ asset, className }: { asset: MediaAsset; className?: string }) {
	return (
		<div className={cn("relative overflow-hidden bg-muted", className)}>
			{asset.kind === "video" ? (
				<>
					<video
						src={`${asset.url}#t=0.1`}
						preload="metadata"
						muted
						playsInline
						className="size-full object-cover"
						aria-label={asset.altText ?? asset.fileName}
					/>
					<span className="absolute inset-0 flex items-center justify-center">
						<span className="flex size-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
							<Play className="size-4 fill-current" aria-hidden="true" />
						</span>
					</span>
				</>
			) : (
				// biome-ignore lint/performance/noImgElement: user media from a runtime-configured storage host
				<img
					src={asset.url}
					alt={asset.altText ?? ""}
					className="size-full object-cover"
					loading="lazy"
				/>
			)}
		</div>
	);
}

/** 1–4+ attachments laid out the way feeds usually do: one big, two side by side, or a 2×2 grid. */
function MediaGrid({ media, className }: { media: MediaAsset[]; className?: string }) {
	if (media.length === 0) return null;
	const shown = media.slice(0, 4);
	const extra = media.length - shown.length;
	if (shown.length === 1 && shown[0]) {
		return <MediaTile asset={shown[0]} className={cn("aspect-[4/3]", className)} />;
	}
	return (
		<div className={cn("grid aspect-[4/3] grid-cols-2 gap-0.5 overflow-hidden", className)}>
			{shown.map((asset, i) => (
				<div
					key={asset.id}
					className={cn("relative", shown.length === 3 && i === 0 && "row-span-2")}
				>
					<MediaTile asset={asset} className="absolute inset-0" />
					{extra > 0 && i === shown.length - 1 ? (
						<span className="absolute inset-0 flex items-center justify-center bg-black/50 font-semibold text-lg text-white">
							+{extra}
						</span>
					) : null}
				</div>
			))}
		</div>
	);
}

function ActionRow({
	items,
	className,
}: {
	items: { icon: typeof Heart; label?: string }[];
	className?: string;
}) {
	return (
		<div
			className={cn("flex items-center justify-between text-muted-foreground", className)}
			aria-hidden="true"
		>
			{items.map(({ icon: Icon, label }, i) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: static decorative list
					key={i}
					className="flex items-center gap-1.5 font-medium text-xs"
				>
					<Icon className="size-4" />
					{label}
				</span>
			))}
		</div>
	);
}

function XLikePreview({ data }: { data: PreviewData }) {
	const { channel, text, media, when } = data;
	return (
		<div className="flex gap-3 p-4">
			<Avatar src={channel.avatarUrl} name={channel.name} size="md" />
			<div className="grid min-w-0 flex-1 gap-2">
				<div className="flex min-w-0 items-center gap-1 text-sm">
					<span className="truncate font-semibold">{channel.name}</span>
					<span className="truncate text-muted-foreground">
						{channel.provider === "x" ? `${handleOf(channel)} · ` : ""}
						{when}
					</span>
					<MoreHorizontal
						className="ml-auto size-4 shrink-0 text-muted-foreground"
						aria-hidden="true"
					/>
				</div>
				<Caption text={text} limit={280} className="-mt-1.5" />
				<MediaGrid media={media} className="rounded-2xl border border-border" />
				<ActionRow
					className="max-w-xs pt-1"
					items={
						channel.provider === "x"
							? [{ icon: MessageCircle }, { icon: Repeat2 }, { icon: Heart }, { icon: BarChart2 }]
							: [{ icon: Heart }, { icon: MessageCircle }, { icon: Repeat2 }, { icon: Send }]
					}
				/>
			</div>
		</div>
	);
}

function InstagramPreview({ data }: { data: PreviewData }) {
	const { channel, text, media } = data;
	const first = media[0];
	return (
		<div>
			<div className="flex items-center gap-2.5 px-3 py-2.5">
				<span className="rounded-full bg-[linear-gradient(45deg,#f9ce34,#ee2a7b,#6228d7)] p-[2px]">
					<span className="block rounded-full bg-surface-raised p-[2px]">
						<Avatar src={channel.avatarUrl} name={channel.name} size="xs" />
					</span>
				</span>
				<span className="truncate font-semibold text-[13px]">
					{channel.username ?? channel.name}
				</span>
				<MoreHorizontal className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
			</div>
			{first ? (
				<div className="relative">
					<MediaTile asset={first} className="aspect-[4/5]" />
					{media.length > 1 ? (
						<span className="absolute top-2.5 right-2.5 rounded-full bg-black/60 px-2 py-0.5 font-medium text-[11px] text-white">
							1/{media.length}
						</span>
					) : null}
				</div>
			) : (
				<div className="flex aspect-[4/5] flex-col items-center justify-center gap-2 bg-muted text-center text-muted-foreground">
					<ImageIcon className="size-6" aria-hidden="true" />
					<p className="max-w-48 text-xs">Instagram posts need at least one image or video</p>
				</div>
			)}
			<div className="grid gap-2 px-3 py-3">
				<div className="flex items-center gap-3.5 text-foreground" aria-hidden="true">
					<Heart className="size-5" />
					<MessageCircle className="size-5" />
					<Send className="size-5" />
					<Bookmark className="ml-auto size-5" />
				</div>
				<Caption
					text={text}
					limit={125}
					className="text-[13px]"
					prefix={<span className="mr-1.5 font-semibold">{channel.username ?? channel.name}</span>}
				/>
			</div>
		</div>
	);
}

function FeedPreview({ data }: { data: PreviewData }) {
	const { channel, text, media, when } = data;
	const linkedin = channel.provider.startsWith("linkedin");
	return (
		<div>
			<div className="flex items-start gap-2.5 px-4 pt-4">
				<Avatar
					src={channel.avatarUrl}
					name={channel.name}
					size="md"
					square={channel.provider === "linkedin_page"}
				/>
				<div className="grid min-w-0 flex-1 leading-tight">
					<span className="truncate font-semibold text-sm">{channel.name}</span>
					<span className="flex items-center gap-1 text-muted-foreground text-xs">
						{when} ·
						<Globe2 className="size-3" aria-hidden="true" />
					</span>
				</div>
				<MoreHorizontal className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
			</div>
			<Caption text={text} limit={linkedin ? 210 : 250} className="px-4 pt-3" />
			<MediaGrid media={media} className="mt-3" />
			<div className="mx-4 flex items-center justify-between border-border border-b py-2 text-muted-foreground text-xs">
				<span className="flex items-center gap-1">
					<span className="flex size-4 items-center justify-center rounded-full bg-info text-white">
						<ThumbsUp className="size-2.5" aria-hidden="true" />
					</span>
					0
				</span>
				<span>0 comments</span>
			</div>
			<ActionRow
				className="px-6 py-2.5"
				items={[
					{ icon: ThumbsUp, label: "Like" },
					{ icon: MessageCircle, label: "Comment" },
					{ icon: linkedin ? Repeat2 : Share2, label: linkedin ? "Repost" : "Share" },
					...(linkedin ? [{ icon: Send, label: "Send" }] : []),
				]}
			/>
		</div>
	);
}

function YouTubePreview({ data }: { data: PreviewData }) {
	const { channel, media, settings } = data;
	const video = media.find((m) => m.kind === "video");
	const title = typeof settings.title === "string" && settings.title.trim() ? settings.title : "";
	return (
		<div className="grid gap-3 p-3">
			{video ? (
				<MediaTile asset={video} className="aspect-video rounded-lg" />
			) : (
				<div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-lg bg-muted text-muted-foreground">
					<Play className="size-6" aria-hidden="true" />
					<p className="text-xs">YouTube needs a video</p>
				</div>
			)}
			<div className="flex gap-2.5">
				<Avatar src={channel.avatarUrl} name={channel.name} size="sm" />
				<div className="grid min-w-0 gap-0.5">
					<p
						className={cn(
							"line-clamp-2 font-semibold text-sm",
							!title && "text-subtle-foreground italic",
						)}
					>
						{title || "Add a video title below"}
					</p>
					<p className="flex items-center gap-1 text-muted-foreground text-xs">
						{channel.name} · 0 views
						<Eye className="size-3" aria-hidden="true" />
					</p>
				</div>
			</div>
		</div>
	);
}

function RedditPreview({ data }: { data: PreviewData }) {
	const { channel, text, media, settings, when } = data;
	const sub = typeof settings.subreddit === "string" ? settings.subreddit.replace(/^r\//, "") : "";
	const title = typeof settings.title === "string" ? settings.title : "";
	return (
		<div className="grid gap-2 p-4">
			<div className="flex items-center gap-2 text-xs">
				<ProviderIcon provider="reddit" size="sm" className="rounded-full" />
				<span className={cn("font-semibold", !sub && "text-subtle-foreground italic")}>
					{sub ? `r/${sub}` : "r/subreddit"}
				</span>
				<span className="text-muted-foreground">
					· u/{channel.username ?? channel.name} · {when}
				</span>
			</div>
			<p className={cn("font-semibold text-base", !title && "text-subtle-foreground italic")}>
				{title || "Add a post title below"}
			</p>
			<Caption text={text} limit={300} className="text-muted-foreground text-sm" />
			<MediaGrid media={media} className="rounded-xl border border-border" />
			<div className="flex items-center gap-2 pt-1 text-muted-foreground" aria-hidden="true">
				<span className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 font-medium text-xs">
					<ArrowBigUp className="size-4" />
					Vote
					<ArrowBigDown className="size-4" />
				</span>
				<span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 font-medium text-xs">
					<MessageCircle className="size-3.5" />0
				</span>
				<span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 font-medium text-xs">
					<Share2 className="size-3.5" />
					Share
				</span>
			</div>
		</div>
	);
}

function PreviewBody({ data }: { data: PreviewData }) {
	switch (data.channel.provider) {
		case "x":
		case "threads":
			return <XLikePreview data={data} />;
		case "instagram":
			return <InstagramPreview data={data} />;
		case "youtube":
			return <YouTubePreview data={data} />;
		case "reddit":
			return <RedditPreview data={data} />;
		default:
			return <FeedPreview data={data} />;
	}
}

/**
 * Right-hand live preview: an approximation of how the post reads on each selected
 * channel. Visual only — the real rules are enforced by validation.
 */
export function PostPreview({
	channels,
	content,
	overrides,
	settings,
	media,
	scheduledAt,
	timeZone,
	active,
	onActiveChange,
}: {
	channels: Channel[];
	content: string;
	overrides: Record<string, string | undefined>;
	settings: Record<string, TargetSettings>;
	media: MediaAsset[];
	scheduledAt: Date | null;
	timeZone: string;
	/** Channel id shown; follows the editor tab when that's a channel. */
	active: string | null;
	onActiveChange: (id: string) => void;
}) {
	const channel = channels.find((c) => c.id === active) ?? channels[0];
	const when = scheduledAt ? formatDateTime(scheduledAt, timeZone) : "Just now";

	return (
		<section
			aria-label="Post preview"
			className="overflow-hidden rounded-2xl border border-border bg-surface-raised"
		>
			<div className="flex items-center justify-between gap-3 border-border border-b px-4 py-3">
				<h2 className="font-medium text-[15px]">
					{channel ? `${providerName(channel.provider)} preview` : "Preview"}
				</h2>
				{channels.length > 1 ? (
					<div
						role="tablist"
						aria-label="Preview channel"
						className="scrollbar-thin flex max-w-[60%] gap-1 overflow-x-auto"
					>
						{channels.map((c) => (
							<button
								key={c.id}
								type="button"
								role="tab"
								aria-selected={c.id === channel?.id}
								aria-label={`Preview on ${c.name}`}
								title={c.name}
								onClick={() => onActiveChange(c.id)}
								className={cn(
									"flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-all focus-visible:outline-2 focus-visible:outline-ring",
									c.id === channel?.id
										? "bg-muted ring-1 ring-foreground"
										: "opacity-50 grayscale hover:opacity-100 hover:grayscale-0",
								)}
							>
								<ProviderIcon provider={c.provider} size="sm" />
							</button>
						))}
					</div>
				) : null}
			</div>
			<div className="bg-surface p-4">
				{channel ? (
					<div className="overflow-hidden rounded-xl border border-border bg-surface-raised">
						<PreviewBody
							key={channel.id}
							data={{
								channel,
								text: overrides[channel.id] ?? content,
								media,
								settings: settings[channel.id] ?? {},
								when,
							}}
						/>
					</div>
				) : (
					<div className="grid gap-3 rounded-xl border border-border border-dashed bg-surface-raised p-4">
						<div className="flex items-center gap-2.5">
							<div className="size-9 rounded-full bg-muted" />
							<div className="grid flex-1 gap-1.5">
								<div className="h-2.5 w-28 rounded-full bg-muted" />
								<div className="h-2 w-16 rounded-full bg-muted" />
							</div>
						</div>
						<div className="grid gap-1.5">
							<div className="h-2.5 rounded-full bg-muted" />
							<div className="h-2.5 w-4/5 rounded-full bg-muted" />
						</div>
						<div className="aspect-[4/3] rounded-lg bg-muted" />
						<p className="text-center text-muted-foreground text-xs">Pick a channel to preview</p>
					</div>
				)}
			</div>
		</section>
	);
}
