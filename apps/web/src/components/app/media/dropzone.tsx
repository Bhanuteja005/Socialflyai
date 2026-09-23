"use client";

import { UploadCloud } from "lucide-react";
import { type DragEvent, type ReactNode, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";
import { ACCEPT_ATTR, isAcceptedFile } from "@/lib/upload";
import { cn } from "@/lib/utils";

function acceptFiles(list: FileList | null, onFiles: (files: File[]) => void) {
	const files = [...(list ?? [])];
	const ok = files.filter(isAcceptedFile);
	const rejected = files.length - ok.length;
	if (rejected > 0) {
		toast.error(`${rejected} file${rejected > 1 ? "s" : ""} skipped`, {
			description: "Only JPG, PNG, GIF, WebP, MP4 and MOV files are supported.",
		});
	}
	if (ok.length) onFiles(ok);
}

/** Hidden file input + a hook for a trigger button. */
export function useFilePicker(onFiles: (files: File[]) => void) {
	const ref = useRef<HTMLInputElement>(null);
	const input = (
		<input
			ref={ref}
			type="file"
			accept={ACCEPT_ATTR}
			multiple
			className="sr-only"
			tabIndex={-1}
			aria-hidden="true"
			onChange={(e) => {
				acceptFiles(e.target.files, onFiles);
				e.target.value = "";
			}}
		/>
	);
	return { input, open: () => ref.current?.click() };
}

/** Wraps an area so files can be dropped on it; shows an overlay while dragging. */
export function DropArea({
	onFiles,
	disabled,
	children,
	className,
	label = "Drop files to upload",
}: {
	onFiles: (files: File[]) => void;
	disabled?: boolean;
	children: ReactNode;
	className?: string;
	label?: string;
}) {
	const [dragging, setDragging] = useState(false);
	const depth = useRef(0);

	const handlers = disabled
		? {}
		: {
				onDragEnter: (e: DragEvent) => {
					if (!e.dataTransfer.types.includes("Files")) return;
					e.preventDefault();
					depth.current++;
					setDragging(true);
				},
				onDragOver: (e: DragEvent) => {
					if (e.dataTransfer.types.includes("Files")) e.preventDefault();
				},
				onDragLeave: () => {
					depth.current = Math.max(0, depth.current - 1);
					if (depth.current === 0) setDragging(false);
				},
				onDrop: (e: DragEvent) => {
					e.preventDefault();
					depth.current = 0;
					setDragging(false);
					acceptFiles(e.dataTransfer.files, onFiles);
				},
			};

	return (
		<div className={cn("relative", className)} {...handlers}>
			{children}
			{dragging ? (
				<div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-primary border-dashed bg-primary-soft/80 backdrop-blur-[1px]">
					<UploadCloud className="size-6 text-primary-text" aria-hidden="true" />
					<p className="font-medium text-primary-text text-sm">{label}</p>
				</div>
			) : null}
		</div>
	);
}
