"use client";

import { Badge } from "@socialfly/ui/components/badge";
import { Button } from "@socialfly/ui/components/button";
import { EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import {
	Clapperboard,
	Eye,
	FileText,
	GalleryHorizontal,
	Hash,
	ImageIcon,
	Inbox,
	Megaphone,
	MessageSquareReply,
	PenSquare,
	Search,
	Telescope,
	Wand2,
} from "lucide-react";
import Link from "next/link";
import { useGenerations } from "@/hooks/use-ai";
import type { Generation, GenerationKind } from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { formatRelative } from "@/lib/format";
import { MediaThumb } from "../media/media-thumb";
import { useOrg } from "../org-provider";
import { SectionHeader } from "../page-header";
import { composeHref, GENERATION_KIND, GENERATION_STATUS } from "./generation-status";

const gridClass = "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4";

const KIND_ICON: Record<GenerationKind, typeof ImageIcon> = {
	post: FileText,
	rewrite: Wand2,
	hashtags: Hash,
	carousel_outline: GalleryHorizontal,
	image: ImageIcon,
	carousel: GalleryHorizontal,
	video_script: Clapperboard,
	video: Clapperboard,
	research: Telescope,
	visibility: Eye,
	seo: Search,
	triage: Inbox,
	reply_draft: MessageSquareReply,
	ad_copy: Megaphone,
};

/** The line a person would recognise the generation by: its prompt, brief or topic. */
function summary(g: Generation): string {
	const input = (g.input ?? {}) as Record<string, unknown>;
	for (const key of ["prompt", "brief", "topic", "text"]) {
		const value = input[key];
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	const slides = input.slides;
	if (Array.isArray(slides) && slides[0] && typeof slides[0].heading === "string") {
		return slides[0].heading;
	}
	const scenes = input.scenes;
	if (Array.isArray(scenes) && scenes[0] && typeof scenes[0].caption === "string") {
		return scenes[0].caption;
	}
	return GENERATION_KIND[g.kind];
}

export function RecentGenerations() {
	const { can } = useOrg();
	const recent = useGenerations({ limit: "12" });
	const items = recent.data?.items ?? [];

	return (
		<section aria-labelledby="recent-generations">
			<SectionHeader title={<span id="recent-generations">Recent generations</span>} />
			{recent.isPending ? (
				<div className={gridClass}>
					{Array.from({ length: 4 }, (_, i) => `sk-${i}`).map((k) => (
						<div key={k} className="overflow-hidden rounded-2xl border border-border">
							<Skeleton className="aspect-square rounded-none" />
							<div className="grid gap-1.5 p-3">
								<Skeleton className="h-3 w-1/2" />
								<Skeleton className="h-2.5 w-3/4" />
							</div>
						</div>
					))}
				</div>
			) : recent.isError ? (
				<EmptyState
					compact
					title="Couldn't load recent generations"
					description={errorMessage(recent.error)}
					action={
						<Button variant="outline" size="sm" onClick={() => recent.refetch()}>
							Retry
						</Button>
					}
				/>
			) : items.length === 0 ? (
				<EmptyState
					compact
					icon={Wand2}
					title="Nothing generated yet"
					description="Images, carousels, videos and AI drafts you create show up here."
				/>
			) : (
				<ul className={gridClass}>
					{items.map((g) => {
						const Icon = KIND_ICON[g.kind];
						const cover = g.media[0];
						const usable =
							can("editor") &&
							g.status === "succeeded" &&
							g.media.length > 0 &&
							(g.kind === "image" || g.kind === "carousel" || g.kind === "video");
						const status = GENERATION_STATUS[g.status];
						return (
							<li
								key={g.id}
								className="group overflow-hidden rounded-2xl border border-border bg-surface-raised transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-md"
							>
								<div className="relative">
									{cover ? (
										<MediaThumb asset={cover} className="rounded-none" />
									) : (
										<div className="flex aspect-square items-center justify-center bg-surface">
											<span className="flex size-11 items-center justify-center rounded-full border border-border bg-surface-raised">
												<Icon className="size-5 text-muted-foreground" aria-hidden="true" />
											</span>
										</div>
									)}
									<span className="absolute top-2 right-2 flex items-center gap-1">
										{g.kind === "carousel" && g.media.length > 1 ? (
											<span className="rounded-full bg-black/60 px-2 py-0.5 font-mono text-[10px] text-white tabular-nums backdrop-blur-sm">
												{g.media.length} slides
											</span>
										) : null}
										<Badge tone={status.tone} dot className="bg-surface-raised/95 backdrop-blur-sm">
											{status.label}
										</Badge>
									</span>
									{usable ? (
										// Hover/focus overlay on pointer devices; always visible on touch screens.
										<div className="absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-black/60 to-transparent p-3 pt-10 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
											<Button size="sm" variant="outline" asChild className="border-transparent">
												<Link href={composeHref(g.id)}>
													<PenSquare />
													Use in a post
												</Link>
											</Button>
										</div>
									) : null}
								</div>
								<div className="grid min-w-0 gap-1 border-border border-t px-3 py-2.5">
									<div className="flex items-center justify-between gap-2">
										<span className="flex min-w-0 items-center gap-1.5 font-medium text-[13px]">
											<Icon
												className="size-3.5 shrink-0 text-muted-foreground"
												aria-hidden="true"
											/>
											<span className="truncate">{GENERATION_KIND[g.kind]}</span>
										</span>
										<span className="shrink-0 font-mono text-[11.5px] text-subtle-foreground tabular-nums">
											{formatRelative(g.createdAt)}
										</span>
									</div>
									<p className="truncate text-muted-foreground text-xs" title={summary(g)}>
										{summary(g)}
									</p>
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}
