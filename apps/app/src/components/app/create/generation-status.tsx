"use client";

import { Badge, type BadgeTone } from "@socialfly/ui/components/badge";
import { Alert, Spinner } from "@socialfly/ui/components/feedback";
import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import type { Generation, GenerationKind, GenerationStatus } from "@/lib/api-types";
import { errorMessage, friendlyCode } from "@/lib/errors";
import { AiError } from "../ai/ai-shared";

export const GENERATION_KIND: Record<GenerationKind, string> = {
	post: "Post drafts",
	rewrite: "Rewrite",
	hashtags: "Hashtags",
	carousel_outline: "Carousel outline",
	image: "Image",
	carousel: "Carousel",
	video_script: "Video script",
	video: "Video",
	research: "Brand research",
	visibility: "AI visibility check",
	seo: "Keyword data",
};

export const GENERATION_STATUS: Record<GenerationStatus, { label: string; tone: BadgeTone }> = {
	pending: { label: "Queued", tone: "neutral" },
	running: { label: "Generating", tone: "info" },
	succeeded: { label: "Ready", tone: "success" },
	failed: { label: "Failed", tone: "danger" },
};

export function GenerationBadge({ status }: { status: GenerationStatus }) {
	const meta = GENERATION_STATUS[status];
	return (
		<Badge tone={meta.tone} dot>
			{meta.label}
		</Badge>
	);
}

/** "/compose?generation=…&content=…" — the composer attaches the generation's media itself. */
export function composeHref(generationId: string, content?: string) {
	const params = new URLSearchParams({ generation: generationId });
	if (content?.trim()) params.set("content", content.trim());
	return `/compose?${params.toString()}`;
}

/**
 * The lifecycle of an async generation: start error → queued/running → failed or
 * `children` (rendered only once it succeeded).
 */
export function GenerationProgress({
	startError,
	pollError,
	generation,
	waitingLabel,
	placeholder,
	children,
}: {
	startError: unknown;
	pollError: unknown;
	generation: Generation | undefined;
	waitingLabel: string;
	/** Shown while the worker is busy, e.g. a skeleton in the output's shape. */
	placeholder: ReactNode;
	children: (generation: Generation) => ReactNode;
}) {
	if (startError) return <AiError error={startError} />;
	if (!generation) return null;
	if (generation.status === "failed") {
		const code = generation.error?.code;
		return (
			<Alert tone="danger" icon={AlertTriangle} title="Generation failed">
				{friendlyCode(code) ??
					generation.error?.message ??
					"Something went wrong. Please try again."}
			</Alert>
		);
	}
	if (generation.status !== "succeeded") {
		return (
			<div className="grid gap-3">
				<p className="flex items-center gap-2 text-muted-foreground text-sm" aria-live="polite">
					<Spinner />
					{waitingLabel}
				</p>
				{placeholder}
				{pollError ? (
					<p className="text-danger text-xs">
						Lost touch with the server: {errorMessage(pollError)}. Still retrying…
					</p>
				) : null}
			</div>
		);
	}
	return <>{children(generation)}</>;
}
