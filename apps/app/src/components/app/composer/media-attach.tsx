"use client";

import { Button } from "@socialfly/ui/components/button";
import { ChevronLeft, ChevronRight, ImagePlus, Library, Upload, X } from "lucide-react";
import { useState } from "react";
import { useUploads } from "@/hooks/use-uploads";
import type { MediaAsset } from "@/lib/api-types";
import { DropArea, useFilePicker } from "../media/dropzone";
import { MediaThumb } from "../media/media-thumb";
import { UploadProgress } from "../media/upload-tray";
import { MediaPickerDialog } from "./media-picker-dialog";

export function MediaAttach({
	media,
	onChange,
	disabled,
}: {
	media: MediaAsset[];
	/** Functional so parallel uploads finishing together never drop each other. */
	onChange: (update: (prev: MediaAsset[]) => MediaAsset[]) => void;
	disabled?: boolean;
}) {
	const [pickerOpen, setPickerOpen] = useState(false);
	// Uploaded files are appended as each one becomes ready.
	const uploads = useUploads((asset) => onChange((prev) => [...prev, asset]));
	const picker = useFilePicker(uploads.upload);
	const pending = uploads.items.filter((i) => i.status === "uploading");

	const move = (index: number, delta: number) => {
		const next = [...media];
		const [item] = next.splice(index, 1);
		if (!item) return;
		next.splice(index + delta, 0, item);
		onChange(() => next);
	};

	return (
		<DropArea onFiles={uploads.upload} disabled={disabled} className="grid gap-3">
			{picker.input}
			{media.length > 0 || pending.length > 0 ? (
				<ul className="flex flex-wrap gap-2" aria-label="Attached media">
					{media.map((asset, index) => (
						<li key={asset.id} className="group relative w-24">
							<MediaThumb asset={asset} className="ring-1 ring-border" />
							{index === 0 && media.length > 1 ? (
								<span className="absolute top-1 left-1 rounded bg-black/65 px-1 text-[10px] text-white">
									Cover
								</span>
							) : null}
							{disabled ? null : (
								<div className="absolute inset-x-1 bottom-1 flex justify-between opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
									<Button
										variant="secondary"
										size="icon-xs"
										className="size-6 bg-black/60 text-white hover:bg-black/80"
										disabled={index === 0}
										onClick={() => move(index, -1)}
										aria-label={`Move ${asset.fileName} earlier`}
									>
										<ChevronLeft />
									</Button>
									<Button
										variant="secondary"
										size="icon-xs"
										className="size-6 bg-black/60 text-white hover:bg-black/80"
										disabled={index === media.length - 1}
										onClick={() => move(index, 1)}
										aria-label={`Move ${asset.fileName} later`}
									>
										<ChevronRight />
									</Button>
								</div>
							)}
							{disabled ? null : (
								<Button
									variant="secondary"
									size="icon-xs"
									className="absolute -top-2 -right-2 size-6 rounded-full border border-border bg-surface-raised shadow-sm"
									onClick={() => onChange((prev) => prev.filter((m) => m.id !== asset.id))}
									aria-label={`Remove ${asset.fileName}`}
								>
									<X />
								</Button>
							)}
						</li>
					))}
					{pending.map((item) => (
						<li
							key={item.key}
							className="grid w-24 content-end gap-1.5 rounded-md bg-muted p-2"
							aria-label={`Uploading ${item.file.name}`}
						>
							<span className="truncate text-[10px] text-muted-foreground">{item.file.name}</span>
							<UploadProgress value={item.progress} />
						</li>
					))}
				</ul>
			) : null}
			{disabled ? null : (
				<div className="flex flex-wrap items-center gap-2 rounded-lg border border-border border-dashed px-3 py-2.5">
					<ImagePlus className="size-4 text-subtle-foreground" aria-hidden="true" />
					<span className="mr-auto text-muted-foreground text-xs">
						Drag images or videos here, or
					</span>
					<Button variant="outline" size="xs" onClick={picker.open}>
						<Upload />
						Upload
					</Button>
					<Button variant="outline" size="xs" onClick={() => setPickerOpen(true)}>
						<Library />
						Library
					</Button>
				</div>
			)}
			<MediaPickerDialog
				open={pickerOpen}
				onOpenChange={setPickerOpen}
				alreadyAttached={media.map((m) => m.id)}
				onConfirm={(assets) => onChange((prev) => [...prev, ...assets])}
			/>
		</DropArea>
	);
}
