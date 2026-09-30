"use client";

import { Button } from "@socialfly/ui/components/button";
import { EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import { StatCard, type StatTone } from "@socialfly/ui/components/page";
import { cn } from "@socialfly/ui/utils";
import type { LucideIcon } from "lucide-react";
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
	icon,
	tone,
	className,
}: {
	label: string;
	value: string;
	hint?: ReactNode;
	icon?: LucideIcon;
	tone?: StatTone;
	className?: string;
}) {
	return (
		<StatCard
			label={label}
			value={value}
			icon={icon}
			tone={tone}
			className={className}
			hint={hint ? <span className="line-clamp-2">{hint}</span> : undefined}
		/>
	);
}

export function StatTilesSkeleton({ count = 4 }: { count?: number }) {
	return (
		<div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-hidden="true">
			{Array.from({ length: count }, (_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
				<div key={i} className="grid gap-3 rounded-2xl border border-border bg-surface-raised p-4">
					<Skeleton className="h-3 w-20" />
					<Skeleton className="h-8 w-16" />
					<Skeleton className="h-3 w-28" />
				</div>
			))}
		</div>
	);
}

/**
 * A setup gap (a missing API key, an engine that isn't connected) as one muted line with a
 * small status dot — never a coloured alert box. Env var names go in `<code>`.
 */
export function SetupNote({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<p
			role="status"
			className={cn(
				"flex items-start gap-2 text-muted-foreground text-xs leading-5 [&_code]:rounded-md [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[11px] [&_code]:text-foreground",
				className,
			)}
		>
			<span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-warning" aria-hidden="true" />
			<span className="min-w-0">{children}</span>
		</p>
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
