"use client";

import { Button } from "@socialfly/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@socialfly/ui/components/card";
import { EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import {
	Clapperboard,
	Eye,
	FileText,
	GalleryHorizontal,
	Hash,
	ImageIcon,
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
import { composeHref, GENERATION_KIND, GenerationBadge } from "./generation-status";

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
		<Card>
			<CardHeader>
				<CardTitle>Recent</CardTitle>
			</CardHeader>
			<CardContent>
				{recent.isPending ? (
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
						{Array.from({ length: 4 }, (_, i) => `sk-${i}`).map((k) => (
							<Skeleton key={k} className="aspect-square" />
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
					<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
						{items.map((g) => {
							const Icon = KIND_ICON[g.kind];
							const cover = g.media[0];
							const usable =
								can("editor") &&
								g.status === "succeeded" &&
								g.media.length > 0 &&
								(g.kind === "image" || g.kind === "carousel" || g.kind === "video");
							return (
								<li key={g.id} className="grid content-start gap-2">
									<div className="relative">
										{cover ? (
											<MediaThumb asset={cover} className="ring-1 ring-border" />
										) : (
											<div className="flex aspect-square items-center justify-center rounded-md bg-muted">
												<Icon className="size-6 text-subtle-foreground" aria-hidden="true" />
											</div>
										)}
										{g.kind === "carousel" && g.media.length > 1 ? (
											<span className="absolute top-1.5 right-1.5 rounded bg-black/65 px-1.5 py-0.5 font-medium text-[10px] text-white">
												{g.media.length} slides
											</span>
										) : null}
									</div>
									<div className="grid min-w-0 gap-1 px-0.5">
										<div className="flex items-center justify-between gap-2">
											<span className="truncate font-medium text-xs">
												{GENERATION_KIND[g.kind]}
											</span>
											<GenerationBadge status={g.status} />
										</div>
										<p
											className="line-clamp-2 text-[11px] text-muted-foreground"
											title={summary(g)}
										>
											{summary(g)}
										</p>
										<p className="text-[11px] text-subtle-foreground">
											{formatRelative(g.createdAt)}
										</p>
										{usable ? (
											<Button variant="outline" size="xs" asChild className="justify-self-start">
												<Link href={composeHref(g.id)}>
													<PenSquare />
													Use in a post
												</Link>
											</Button>
										) : null}
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
