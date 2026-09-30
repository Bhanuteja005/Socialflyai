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

const tileClass =
	"flex size-20 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-border-strong border-dashed text-[11px] text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring";

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
	const empty = media.length === 0 && pending.length === 0;

	const move = (index: number, delta: number) => {
		const next = [...media];
		const [item] = next.splice(index, 1);
		if (!item) return;
		next.splice(index + delta, 0, item);
		onChange(() => next);
	};

	const dialog = (
		<MediaPickerDialog
			open={pickerOpen}
			onOpenChange={setPickerOpen}
			alreadyAttached={media.map((m) => m.id)}
			onConfirm={(assets) => onChange((prev) => [...prev, ...assets])}
		/>
	);

	if (empty) {
		if (disabled) return null;
		return (
			<DropArea onFiles={uploads.upload} disabled={disabled}>
				{picker.input}
				<div className="flex flex-wrap items-center gap-3 rounded-xl border border-border-strong border-dashed bg-surface px-4 py-3">
					<span className="flex size-9 items-center justify-center rounded-full bg-surface-raised ring-1 ring-border">
						<ImagePlus className="size-4 text-muted-foreground" aria-hidden="true" />
					</span>
					<div className="mr-auto grid gap-0.5">
						<p className="font-medium text-sm">Add images or video</p>
						<p className="text-muted-foreground text-xs">Drop files here</p>
					</div>
					<div className="flex gap-2">
						<Button variant="outline" size="sm" onClick={picker.open}>
							<Upload />
							Upload
						</Button>
						<Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
							<Library />
							Library
						</Button>
					</div>
				</div>
				{dialog}
			</DropArea>
		);
	}

	return (
		<DropArea onFiles={uploads.upload} disabled={disabled}>
			{picker.input}
			<ul className="flex flex-wrap gap-2.5" aria-label="Attached media">
				{media.map((asset, index) => (
					<li key={asset.id} className="group relative size-20">
						<MediaThumb asset={asset} className="rounded-lg ring-1 ring-border" />
						{index === 0 && media.length > 1 ? (
							<span className="absolute top-1 left-1 rounded-full bg-black/65 px-1.5 font-medium text-[10px] text-white">
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
								className="absolute -top-2 -right-2 size-6 border border-border bg-surface-raised"
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
						className="grid size-20 content-end gap-1.5 rounded-lg bg-muted p-2"
						aria-label={`Uploading ${item.file.name}`}
					>
						<span className="truncate font-mono text-[10px] text-muted-foreground">
							{item.file.name}
						</span>
						<UploadProgress value={item.progress} />
					</li>
				))}
				{disabled ? null : (
					<>
						<li>
							<button type="button" className={tileClass} onClick={picker.open}>
								<Upload className="size-4" aria-hidden="true" />
								Upload
							</button>
						</li>
						<li>
							<button type="button" className={tileClass} onClick={() => setPickerOpen(true)}>
								<Library className="size-4" aria-hidden="true" />
								Library
							</button>
						</li>
					</>
				)}
			</ul>
			{dialog}
		</DropArea>
	);
}
