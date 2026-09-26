import { cn } from "@socialfly/ui/utils";
import { Play } from "lucide-react";
import type { MediaAsset } from "@/lib/api-types";
import { formatDuration } from "@/lib/format";

/** Square preview for an image or video asset. Storage hosts vary per deployment, so plain <img>. */
export function MediaThumb({
	asset,
	className,
	hideBadge,
}: {
	asset: MediaAsset;
	className?: string;
	/** Callers that draw their own video badge turn this one off. */
	hideBadge?: boolean;
}) {
	return (
		<div className={cn("relative aspect-square overflow-hidden rounded-md bg-muted", className)}>
			{asset.kind === "video" ? (
				<>
					<video
						src={`${asset.url}#t=0.1`}
						preload="metadata"
						muted
						playsInline
						className="size-full object-cover"
						aria-label={asset.altText ?? asset.fileName}
					/>
					{hideBadge ? null : (
						// Top-left: generated videos burn captions into the bottom of the frame.
						<span className="absolute top-1.5 left-1.5 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[10px] text-white tabular-nums backdrop-blur-sm">
							<Play className="size-2.5 fill-current" aria-hidden="true" />
							{asset.durationMs ? formatDuration(asset.durationMs) : "Video"}
						</span>
					)}
				</>
			) : (
				// biome-ignore lint/performance/noImgElement: user media from a runtime-configured storage host
				<img
					src={asset.url}
					alt={asset.altText ?? ""}
					loading="lazy"
					decoding="async"
					className="size-full object-cover"
				/>
			)}
		</div>
	);
}
