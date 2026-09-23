"use client";

import { Check, ImageIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { useMediaLibrary } from "@/hooks/queries";
import type { MediaAsset } from "@/lib/api-types";
import { cn } from "@/lib/utils";
import { MediaThumb } from "../media/media-thumb";

/** Pick existing files from the library; returns them in click order. */
export function MediaPickerDialog({
	open,
	onOpenChange,
	alreadyAttached,
	onConfirm,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	alreadyAttached: string[];
	onConfirm: (assets: MediaAsset[]) => void;
}) {
	const library = useMediaLibrary();
	const [picked, setPicked] = useState<MediaAsset[]>([]);
	const items = library.data?.pages.flatMap((p) => p.items) ?? [];

	useEffect(() => {
		if (open) setPicked([]);
	}, [open]);

	const toggle = (asset: MediaAsset) =>
		setPicked((prev) =>
			prev.some((a) => a.id === asset.id)
				? prev.filter((a) => a.id !== asset.id)
				: [...prev, asset],
		);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-3xl">
				<DialogHeader>
					<DialogTitle>Add from library</DialogTitle>
					<DialogDescription>
						Selected files are attached in the order you pick them.
					</DialogDescription>
				</DialogHeader>
				<div className="scrollbar-thin -mx-1 max-h-[55dvh] overflow-y-auto px-1 py-1">
					{library.isPending ? (
						<div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
							{Array.from({ length: 10 }, (_, i) => `sk-${i}`).map((k) => (
								<Skeleton key={k} className="aspect-square" />
							))}
						</div>
					) : items.length === 0 ? (
						<EmptyState
							icon={ImageIcon}
							title="Your library is empty"
							description="Upload files from the composer or the Media page."
							compact
						/>
					) : (
						<ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
							{items.map((asset) => {
								const attached = alreadyAttached.includes(asset.id);
								const order = picked.findIndex((a) => a.id === asset.id);
								const selected = order >= 0;
								return (
									<li key={asset.id}>
										<button
											type="button"
											disabled={attached}
											aria-pressed={selected}
											onClick={() => toggle(asset)}
											className={cn(
												"relative block w-full cursor-pointer rounded-md focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40",
												selected && "ring-2 ring-primary ring-offset-2 ring-offset-surface-raised",
											)}
										>
											<MediaThumb asset={asset} />
											<span className="sr-only">{asset.fileName}</span>
											{selected ? (
												<span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-primary font-semibold text-[11px] text-primary-foreground">
													{order + 1}
												</span>
											) : attached ? (
												<span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-background">
													<Check className="size-3" aria-label="Already attached" />
												</span>
											) : null}
										</button>
									</li>
								);
							})}
						</ul>
					)}
					{library.hasNextPage ? (
						<div className="mt-4 flex justify-center">
							<Button
								variant="outline"
								size="sm"
								loading={library.isFetchingNextPage}
								onClick={() => library.fetchNextPage()}
							>
								Load more
							</Button>
						</div>
					) : null}
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						disabled={picked.length === 0}
						onClick={() => {
							onConfirm(picked);
							onOpenChange(false);
						}}
					>
						Attach {picked.length > 0 ? picked.length : ""}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
