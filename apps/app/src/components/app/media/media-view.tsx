"use client";

import { Button } from "@socialfly/ui/components/button";
import { EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import { Tabs, TabsList, TabsTrigger } from "@socialfly/ui/components/tabs";
import {
	AlertCircle,
	Film,
	ImageIcon,
	Images,
	Maximize2,
	Play,
	Sparkles,
	Upload,
} from "lucide-react";
import { useState } from "react";
import { useMediaLibrary } from "@/hooks/queries";
import { useUploads } from "@/hooks/use-uploads";
import type { MediaAsset } from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { formatBytes, formatDuration } from "@/lib/format";
import { useOrg } from "../org-provider";
import { PageHeader } from "../page-header";
import { DropArea, useFilePicker } from "./dropzone";
import { MediaDetailsDialog } from "./media-details";
import { MediaThumb } from "./media-thumb";
import { UploadTray } from "./upload-tray";

type KindFilter = "all" | "image" | "video";

const gridClass = "grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5";

function MediaTile({ asset, onOpen }: { asset: MediaAsset; onOpen: () => void }) {
	const missingAlt = asset.kind === "image" && !asset.altText;
	return (
		<button
			type="button"
			onClick={onOpen}
			className="group grid w-full cursor-pointer overflow-hidden rounded-2xl border border-border bg-surface-raised text-left transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
		>
			<span className="relative block">
				<MediaThumb asset={asset} hideBadge className="rounded-none" />
				{/* Hover veil so the badges stay legible on light images and the tile reads as clickable. */}
				<span
					aria-hidden="true"
					className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/25"
				>
					<span className="flex size-9 scale-90 items-center justify-center rounded-full bg-surface-raised/90 text-foreground opacity-0 shadow-md transition-all group-hover:scale-100 group-hover:opacity-100">
						<Maximize2 className="size-4" />
					</span>
				</span>
				<span className="absolute inset-x-2 top-2 flex items-start justify-between gap-1">
					{asset.kind === "video" ? (
						<span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[10px] text-white tabular-nums backdrop-blur-sm">
							<Play className="size-2.5 fill-current" aria-hidden="true" />
							{asset.durationMs ? formatDuration(asset.durationMs) : "Video"}
						</span>
					) : (
						<span />
					)}
					{asset.source === "ai" ? (
						<span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 font-medium text-[10px] text-white backdrop-blur-sm">
							<Sparkles className="size-2.5" aria-hidden="true" />
							AI
							<span className="sr-only"> generated</span>
						</span>
					) : null}
				</span>
			</span>
			<span className="grid min-w-0 gap-0.5 border-border border-t px-3 py-2.5">
				<span className="truncate font-medium text-[13px]">{asset.fileName}</span>
				<span className="flex min-w-0 items-center gap-1.5 font-mono text-[11.5px] text-muted-foreground">
					<span className="truncate tabular-nums">
						{formatBytes(asset.sizeBytes)}
						{asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ""}
					</span>
					{missingAlt ? (
						<span
							className="ml-auto inline-flex shrink-0 items-center gap-0.5 text-warning"
							title="No alt text"
						>
							<AlertCircle className="size-3" aria-hidden="true" />
							<span className="sr-only">No alt text</span>
						</span>
					) : null}
				</span>
			</span>
		</button>
	);
}

export function MediaView() {
	const { can } = useOrg();
	const editable = can("editor");
	const [kind, setKind] = useState<KindFilter>("all");
	const [selected, setSelected] = useState<MediaAsset | null>(null);
	const library = useMediaLibrary(kind === "all" ? undefined : kind);
	const uploads = useUploads();
	const picker = useFilePicker(uploads.upload);
	const items = library.data?.pages.flatMap((p) => p.items) ?? [];
	const countLabel = library.isPending
		? null
		: `${items.length}${library.hasNextPage ? "+" : ""} ${items.length === 1 ? "file" : "files"}`;

	return (
		<DropArea
			onFiles={uploads.upload}
			disabled={!editable}
			className="min-h-[60dvh]"
			label="Drop to upload to your library"
		>
			{picker.input}
			<PageHeader title="Media library" description="Drop files anywhere to upload." />

			<div className="mb-5 flex flex-wrap items-center gap-3">
				<Tabs value={kind} onValueChange={(v) => setKind(v as KindFilter)}>
					<TabsList aria-label="Filter by type">
						<TabsTrigger value="all">
							<Images />
							All
						</TabsTrigger>
						<TabsTrigger value="image">
							<ImageIcon />
							Images
						</TabsTrigger>
						<TabsTrigger value="video">
							<Film />
							Videos
						</TabsTrigger>
					</TabsList>
				</Tabs>
				{countLabel ? (
					<span className="font-mono text-muted-foreground text-xs tabular-nums">{countLabel}</span>
				) : null}
				{editable ? (
					<Button className="ml-auto" onClick={picker.open}>
						<Upload />
						Upload
					</Button>
				) : null}
			</div>

			<UploadTray items={uploads.items} onDismiss={uploads.dismiss} className="mb-5" />

			{library.isPending ? (
				<div className={gridClass}>
					{Array.from({ length: 10 }, (_, i) => `sk-${i}`).map((k) => (
						<div key={k} className="overflow-hidden rounded-2xl border border-border">
							<Skeleton className="aspect-square rounded-none" />
							<div className="grid gap-1.5 p-3">
								<Skeleton className="h-3 w-3/4" />
								<Skeleton className="h-2.5 w-1/2" />
							</div>
						</div>
					))}
				</div>
			) : library.isError ? (
				<EmptyState
					title="Couldn't load your media"
					description={errorMessage(library.error)}
					action={
						<Button variant="outline" onClick={() => library.refetch()}>
							Retry
						</Button>
					}
				/>
			) : items.length === 0 ? (
				<EmptyState
					icon={kind === "video" ? Film : ImageIcon}
					title={kind === "all" ? "Your library is empty" : `No ${kind}s yet`}
					description={
						editable
							? "JPG, PNG, GIF, WebP, MP4 or MOV."
							: "Editors can upload images and videos here."
					}
					action={
						editable ? (
							<Button variant="outline" onClick={picker.open}>
								<Upload />
								Upload files
							</Button>
						) : null
					}
				/>
			) : (
				<>
					<ul className={gridClass}>
						{items.map((asset) => (
							<li key={asset.id}>
								<MediaTile asset={asset} onOpen={() => setSelected(asset)} />
							</li>
						))}
					</ul>
					{library.hasNextPage ? (
						<div className="mt-8 flex justify-center">
							<Button
								variant="outline"
								loading={library.isFetchingNextPage}
								onClick={() => library.fetchNextPage()}
							>
								Load more
							</Button>
						</div>
					) : null}
				</>
			)}
			<MediaDetailsDialog
				asset={selected}
				onOpenChange={(open) => (open ? undefined : setSelected(null))}
			/>
		</DropArea>
	);
}
