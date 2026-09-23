"use client";

import { Button } from "@socialfly/ui/components/button";
import { EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import { Tabs, TabsList, TabsTrigger } from "@socialfly/ui/components/tabs";
import { ImageIcon, Sparkles, Upload } from "lucide-react";
import { useState } from "react";
import { useMediaLibrary } from "@/hooks/queries";
import { useUploads } from "@/hooks/use-uploads";
import type { MediaAsset } from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { formatBytes } from "@/lib/format";
import { useOrg } from "../org-provider";
import { PageHeader } from "../page-header";
import { DropArea, useFilePicker } from "./dropzone";
import { MediaDetailsDialog } from "./media-details";
import { MediaThumb } from "./media-thumb";
import { UploadTray } from "./upload-tray";

type KindFilter = "all" | "image" | "video";

export function MediaView() {
	const { can } = useOrg();
	const editable = can("editor");
	const [kind, setKind] = useState<KindFilter>("all");
	const [selected, setSelected] = useState<MediaAsset | null>(null);
	const library = useMediaLibrary(kind === "all" ? undefined : kind);
	const uploads = useUploads();
	const picker = useFilePicker(uploads.upload);
	const items = library.data?.pages.flatMap((p) => p.items) ?? [];

	return (
		<DropArea onFiles={uploads.upload} disabled={!editable} className="min-h-[60dvh]">
			{picker.input}
			<PageHeader
				title="Media"
				description="Images and videos you can attach to posts. Drop files anywhere on this page to upload."
				actions={
					editable ? (
						<Button onClick={picker.open}>
							<Upload />
							Upload
						</Button>
					) : null
				}
			/>

			<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
				<Tabs value={kind} onValueChange={(v) => setKind(v as KindFilter)}>
					<TabsList aria-label="Filter by type">
						<TabsTrigger value="all">All</TabsTrigger>
						<TabsTrigger value="image">Images</TabsTrigger>
						<TabsTrigger value="video">Videos</TabsTrigger>
					</TabsList>
				</Tabs>
			</div>

			<UploadTray items={uploads.items} onDismiss={uploads.dismiss} className="mb-4" />

			{library.isPending ? (
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{Array.from({ length: 10 }, (_, i) => `sk-${i}`).map((k) => (
						<Skeleton key={k} className="aspect-square" />
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
					icon={ImageIcon}
					title={kind === "all" ? "Your library is empty" : `No ${kind}s yet`}
					description={
						editable
							? "Upload JPG, PNG, GIF, WebP, MP4 or MOV files, or drag them onto this page."
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
					<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
						{items.map((asset) => (
							<li key={asset.id}>
								<button
									type="button"
									onClick={() => setSelected(asset)}
									className="group grid w-full cursor-pointer gap-1.5 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
								>
									<span className="relative block">
										<MediaThumb
											asset={asset}
											className="ring-1 ring-border transition group-hover:ring-border-strong"
										/>
										{asset.source === "ai" ? (
											<span className="absolute top-1.5 right-1.5 inline-flex items-center gap-0.5 rounded bg-black/65 px-1.5 py-0.5 font-medium text-[10px] text-white">
												<Sparkles className="size-3" aria-hidden="true" />
												AI
												<span className="sr-only"> generated</span>
											</span>
										) : null}
									</span>
									<span className="grid min-w-0 px-0.5">
										<span className="truncate font-medium text-xs">{asset.fileName}</span>
										<span className="truncate text-[11px] text-muted-foreground">
											{formatBytes(asset.sizeBytes)}
											{asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ""}
											{asset.altText ? "" : asset.kind === "image" ? " · No alt text" : ""}
										</span>
									</span>
								</button>
							</li>
						))}
					</ul>
					{library.hasNextPage ? (
						<div className="mt-6 flex justify-center">
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
