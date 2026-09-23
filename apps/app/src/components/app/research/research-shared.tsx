"use client";

import { Button } from "@socialfly/ui/components/button";
import { EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import { cn } from "@socialfly/ui/utils";
import type { ReactNode } from "react";
import type { EngineId } from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";

/** Display name and the server env var that turns each AI-visibility engine on. */
export const ENGINES: Record<EngineId, { name: string; envVar: string }> = {
	claude: { name: "Claude", envVar: "ANTHROPIC_API_KEY" },
	chatgpt: { name: "ChatGPT", envVar: "OPENAI_API_KEY" },
	gemini: { name: "Gemini", envVar: "GEMINI_API_KEY" },
	perplexity: { name: "Perplexity", envVar: "PERPLEXITY_API_KEY" },
};

export const engineName = (id: string) => ENGINES[id as EngineId]?.name ?? id;

/** A headline number. `hint` says what it means (or why it's missing). */
export function StatTile({
	label,
	value,
	hint,
	className,
}: {
	label: string;
	value: string;
	hint?: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"grid content-start gap-1 rounded-lg border border-border bg-surface-raised p-4 shadow-xs",
				className,
			)}
		>
			<p className="text-muted-foreground text-xs">{label}</p>
			<p className="font-semibold text-2xl tabular-nums tracking-tight">{value}</p>
			{hint ? <div className="text-subtle-foreground text-xs">{hint}</div> : null}
		</div>
	);
}

export function StatTilesSkeleton({ count = 4 }: { count?: number }) {
	return (
		<div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden="true">
			{Array.from({ length: count }, (_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
				<div key={i} className="grid gap-2 rounded-lg border border-border p-4">
					<Skeleton className="h-3 w-20" />
					<Skeleton className="h-7 w-16" />
					<Skeleton className="h-3 w-28" />
				</div>
			))}
		</div>
	);
}

/** Error state with a retry button — every query-backed section uses it. */
export function LoadError({
	title,
	error,
	onRetry,
	compact,
}: {
	title: string;
	error: unknown;
	onRetry: () => void;
	compact?: boolean;
}) {
	return (
		<EmptyState
			compact={compact}
			title={title}
			description={errorMessage(error)}
			action={
				<Button variant="outline" size="sm" onClick={onRetry}>
					Retry
				</Button>
			}
		/>
	);
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
	return (
		<div className="grid gap-2" aria-busy="true">
			{Array.from({ length: rows }, (_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
				<Skeleton key={i} className="h-11" />
			))}
		</div>
	);
}

/** "example.com" from a URL; the URL itself when it can't be parsed. */
export function hostOf(url: string) {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}
