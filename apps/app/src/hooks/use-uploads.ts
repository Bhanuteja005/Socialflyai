"use client";

import { toast } from "@socialfly/ui/components/toast";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { useOrg } from "@/components/app/org-provider";
import type { MediaAsset } from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { uploadMedia } from "@/lib/upload";

export type UploadItem = {
	key: string;
	file: File;
	previewUrl: string;
	progress: number;
	status: "uploading" | "done" | "error";
	error?: string;
	asset?: MediaAsset;
};

let counter = 0;

/** Parallel uploads with per-file progress; finished files land in the media library cache. */
export function useUploads(onUploaded?: (asset: MediaAsset) => void) {
	const { orgId } = useOrg();
	const queryClient = useQueryClient();
	const [items, setItems] = useState<UploadItem[]>([]);
	const callback = useRef(onUploaded);
	callback.current = onUploaded;

	const patch = useCallback((key: string, update: Partial<UploadItem>) => {
		setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...update } : i)));
	}, []);

	const upload = useCallback(
		(files: File[]) => {
			const fresh = files.map<UploadItem>((file) => ({
				key: `u${++counter}`,
				file,
				previewUrl: URL.createObjectURL(file),
				progress: 0,
				status: "uploading",
			}));
			setItems((prev) => [...prev, ...fresh]);
			for (const item of fresh) {
				uploadMedia(item.file, (p) => patch(item.key, { progress: p }))
					.then((asset) => {
						patch(item.key, { status: "done", progress: 1, asset });
						void queryClient.invalidateQueries({ queryKey: qk.mediaAll(orgId) });
						callback.current?.(asset);
					})
					.catch((error) => {
						const message = errorMessage(error, "Upload failed");
						patch(item.key, { status: "error", error: message });
						toast.error(`${item.file.name}: ${message}`);
					});
			}
		},
		[orgId, patch, queryClient],
	);

	const dismiss = useCallback((key: string) => {
		setItems((prev) => {
			const item = prev.find((i) => i.key === key);
			if (item) URL.revokeObjectURL(item.previewUrl);
			return prev.filter((i) => i.key !== key);
		});
	}, []);

	const clearFinished = useCallback(() => {
		setItems((prev) => {
			for (const i of prev) if (i.status === "done") URL.revokeObjectURL(i.previewUrl);
			return prev.filter((i) => i.status !== "done");
		});
	}, []);

	return {
		items,
		upload,
		dismiss,
		clearFinished,
		busy: items.some((i) => i.status === "uploading"),
	};
}
