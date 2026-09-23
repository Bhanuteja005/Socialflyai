"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	ConfirmDialog,
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { api, call, callVoid } from "@/lib/api-client";
import type { MediaAsset } from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { formatBytes, formatDate, formatDuration } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import { useOrg } from "../org-provider";

export function MediaDetailsDialog({
	asset,
	onOpenChange,
}: {
	asset: MediaAsset | null;
	onOpenChange: (open: boolean) => void;
}) {
	const { orgId, can } = useOrg();
	const queryClient = useQueryClient();
	const [altText, setAltText] = useState("");
	const [confirmDelete, setConfirmDelete] = useState(false);
	const editable = can("editor");

	useEffect(() => setAltText(asset?.altText ?? ""), [asset]);

	const save = useMutation({
		mutationFn: (value: string) =>
			call(
				api.media[":id"].$patch({
					param: { id: asset?.id ?? "" },
					json: { altText: value.trim() || null },
				}),
			),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: qk.mediaAll(orgId) });
			toast.success("Alt text saved");
			onOpenChange(false);
		},
		onError: (e) => toast.error(errorMessage(e)),
	});

	const remove = useMutation({
		mutationFn: () => callVoid(api.media[":id"].$delete({ param: { id: asset?.id ?? "" } })),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: qk.mediaAll(orgId) });
			toast.success("File deleted");
			setConfirmDelete(false);
			onOpenChange(false);
		},
		onError: (e) => {
			toast.error(errorMessage(e));
			setConfirmDelete(false);
		},
	});

	const facts = asset
		? [
				["Type", asset.mimeType],
				["Size", formatBytes(asset.sizeBytes)],
				asset.width && asset.height ? ["Dimensions", `${asset.width} × ${asset.height}`] : null,
				asset.durationMs ? ["Duration", formatDuration(asset.durationMs)] : null,
				["Uploaded", formatDate(asset.createdAt)],
			].filter((f): f is [string, string] => f !== null)
		: [];

	return (
		<>
			<Dialog open={asset !== null && !confirmDelete} onOpenChange={onOpenChange}>
				<DialogContent className="max-w-3xl">
					<DialogHeader>
						<DialogTitle className="truncate">{asset?.fileName}</DialogTitle>
					</DialogHeader>
					{asset ? (
						<div className="grid gap-5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
							<div className="flex max-h-[60dvh] items-center justify-center overflow-hidden rounded-lg bg-muted">
								{asset.kind === "video" ? (
									<video src={asset.url} controls playsInline className="max-h-[60dvh] w-full">
										<track kind="captions" />
									</video>
								) : (
									// biome-ignore lint/performance/noImgElement: user media from a runtime-configured storage host
									<img
										src={asset.url}
										alt={asset.altText ?? ""}
										className="max-h-[60dvh] w-auto object-contain"
									/>
								)}
							</div>
							<div className="grid content-start gap-4">
								<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
									{facts.map(([k, v]) => (
										<div key={k} className="contents">
											<dt className="text-muted-foreground">{k}</dt>
											<dd className="truncate">{v}</dd>
										</div>
									))}
								</dl>
								<Field
									label="Alt text"
									htmlFor="alt-text"
									hint="Describes the image for people using screen readers. Sent to platforms that support it."
								>
									<Textarea
										id="alt-text"
										rows={4}
										maxLength={1000}
										value={altText}
										disabled={!editable}
										onChange={(e) => setAltText(e.target.value)}
										placeholder={editable ? "A team photo at the product launch…" : "No alt text"}
									/>
								</Field>
								{editable ? (
									<div className="flex flex-wrap items-center justify-between gap-2">
										<Button
											variant="danger-outline"
											size="sm"
											onClick={() => setConfirmDelete(true)}
										>
											<Trash2 />
											Delete
										</Button>
										<Button
											size="sm"
											loading={save.isPending}
											disabled={altText === (asset.altText ?? "")}
											onClick={() => save.mutate(altText)}
										>
											Save alt text
										</Button>
									</div>
								) : null}
							</div>
						</div>
					) : null}
				</DialogContent>
			</Dialog>
			<ConfirmDialog
				open={confirmDelete}
				onOpenChange={setConfirmDelete}
				title="Delete this file?"
				description="It will be removed from your library. Files attached to a post can't be deleted until you remove them from the post."
				confirmLabel="Delete"
				tone="danger"
				loading={remove.isPending}
				onConfirm={() => remove.mutate()}
			/>
		</>
	);
}
