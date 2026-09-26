"use client";

import { Badge } from "@socialfly/ui/components/badge";
import { Button } from "@socialfly/ui/components/button";
import {
	ConfirmDialog,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@socialfly/ui/components/dialog";
import { Field } from "@socialfly/ui/components/field";
import { Textarea } from "@socialfly/ui/components/input";
import { toast } from "@socialfly/ui/components/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Film, ImageIcon, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
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
				<DialogContent className="max-w-4xl gap-0 overflow-hidden p-0 sm:p-0">
					{asset ? (
						<div className="grid md:grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)]">
							<div className="flex min-h-64 items-center justify-center bg-muted p-4 md:min-h-[480px]">
								{asset.kind === "video" ? (
									<video
										src={asset.url}
										controls
										playsInline
										className="max-h-[60dvh] w-full rounded-xl"
									>
										<track kind="captions" />
									</video>
								) : (
									// biome-ignore lint/performance/noImgElement: user media from a runtime-configured storage host
									<img
										src={asset.url}
										alt={asset.altText ?? ""}
										className="max-h-[60dvh] w-auto rounded-xl object-contain"
									/>
								)}
							</div>
							<div className="grid content-start gap-5 border-border border-t p-5 md:border-t-0 md:border-l">
								<DialogHeader>
									<DialogTitle className="truncate">{asset.fileName}</DialogTitle>
									<DialogDescription className="flex flex-wrap items-center gap-1.5">
										<Badge tone="outline">
											{asset.kind === "video" ? <Film /> : <ImageIcon />}
											{asset.kind === "video" ? "Video" : "Image"}
										</Badge>
										{asset.source === "ai" ? (
											<Badge tone="outline">
												<Sparkles />
												AI generated
											</Badge>
										) : null}
									</DialogDescription>
								</DialogHeader>
								<dl className="grid divide-y divide-border rounded-xl border border-border text-sm">
									{facts.map(([k, v]) => (
										<div key={k} className="flex items-center justify-between gap-4 px-3 py-2">
											<dt className="text-muted-foreground">{k}</dt>
											<dd className="truncate text-right font-mono text-[13px] tabular-nums">
												{v}
											</dd>
										</div>
									))}
								</dl>
								<Field
									label="Alt text"
									htmlFor="alt-text"
									hint="Read by screen readers; sent to platforms that support it."
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
								<div className="flex flex-wrap items-center gap-2">
									{editable ? (
										<Button
											variant="danger-outline"
											size="sm"
											onClick={() => setConfirmDelete(true)}
										>
											<Trash2 />
											Delete
										</Button>
									) : null}
									<Button variant="ghost" size="sm" asChild>
										<a href={asset.url} target="_blank" rel="noreferrer">
											<ExternalLink />
											Open original
										</a>
									</Button>
									{editable ? (
										<Button
											size="sm"
											className="ml-auto"
											loading={save.isPending}
											disabled={altText === (asset.altText ?? "")}
											onClick={() => save.mutate(altText)}
										>
											Save alt text
										</Button>
									) : null}
								</div>
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
