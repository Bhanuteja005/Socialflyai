"use client";

import { Button } from "@socialfly/ui/components/button";
import { cn } from "@socialfly/ui/utils";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import type { UploadItem } from "@/hooks/use-uploads";
import { formatBytes } from "@/lib/format";

export function UploadProgress({ value }: { value: number }) {
	return (
		<div
			className="h-1 w-full overflow-hidden rounded-full bg-muted"
			role="progressbar"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={Math.round(value * 100)}
		>
			<div
				className="h-full rounded-full bg-primary transition-[width] duration-200"
				style={{ width: `${Math.max(4, Math.round(value * 100))}%` }}
			/>
		</div>
	);
}

/** Compact list of in-progress / failed uploads. */
export function UploadTray({
	items,
	onDismiss,
	className,
}: {
	items: UploadItem[];
	onDismiss: (key: string) => void;
	className?: string;
}) {
	const visible = items.filter((i) => i.status !== "done");
	if (visible.length === 0) return null;
	return (
		<ul className={cn("grid gap-2", className)} aria-live="polite">
			{visible.map((item) => (
				<li
					key={item.key}
					className="flex items-center gap-3 rounded-xl border border-border bg-surface-raised px-3.5 py-2.5"
				>
					<div className="grid min-w-0 flex-1 gap-1.5">
						<div className="flex items-center justify-between gap-2 text-xs">
							<span className="truncate font-medium">{item.file.name}</span>
							<span className="shrink-0 font-mono text-muted-foreground tabular-nums">
								{item.status === "uploading"
									? `${Math.round(item.progress * 100)}% of ${formatBytes(item.file.size)}`
									: null}
							</span>
						</div>
						{item.status === "error" ? (
							<p className="flex items-center gap-1 text-danger text-xs">
								<AlertCircle className="size-3.5" aria-hidden="true" />
								{item.error}
							</p>
						) : (
							<UploadProgress value={item.progress} />
						)}
					</div>
					{item.status === "error" ? (
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label={`Dismiss ${item.file.name}`}
							onClick={() => onDismiss(item.key)}
						>
							<X />
						</Button>
					) : item.progress >= 1 ? (
						<CheckCircle2 className="size-4 text-success" aria-label="Processing" />
					) : null}
				</li>
			))}
		</ul>
	);
}
