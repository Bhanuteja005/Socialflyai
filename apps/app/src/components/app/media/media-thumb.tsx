import { cn } from "@socialfly/ui/utils";
import { Film } from "lucide-react";
import type { MediaAsset } from "@/lib/api-types";
import { formatDuration } from "@/lib/format";

/** Square preview for an image or video asset. Storage hosts vary per deployment, so plain <img>. */
export function MediaThumb({ asset, className }: { asset: MediaAsset; className?: string }) {
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
					<span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded bg-black/65 px-1.5 py-0.5 font-medium text-[10px] text-white">
						<Film className="size-3" aria-hidden="true" />
						{asset.durationMs ? formatDuration(asset.durationMs) : "Video"}
					</span>
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
