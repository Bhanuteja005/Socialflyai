"use client";

import { Alert } from "@socialfly/ui/components/feedback";
import { cn } from "@socialfly/ui/utils";
import { AlertTriangle, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useAiCapabilities } from "@/hooks/use-ai";
import type { AiBudget } from "@/lib/api-types";
import { errorMessage, isApiError } from "@/lib/errors";
import { formatUsd } from "@/lib/format";

/** "AI usage this month: $1.20 of $10.00" — nothing while capabilities load. */
export function AiUsage({ budget, className }: { budget?: AiBudget; className?: string }) {
	const caps = useAiCapabilities();
	const b = budget ?? caps.data?.budget;
	if (!b) return null;
	const limit = b.limitUsd;
	const ratio = limit ? Math.min(1, b.usedUsd / limit) : 0;
	const exhausted = limit !== null && (b.remainingUsd ?? 0) <= 0;
	return (
		<div className={cn("grid gap-1 text-muted-foreground text-xs", className)}>
			<p className={cn(exhausted && "text-danger")}>
				AI usage this month:{" "}
				<span className="font-medium text-foreground tabular-nums">{formatUsd(b.usedUsd)}</span>
				{limit === null ? (
					" (no limit)"
				) : (
					<>
						{" "}
						of <span className="tabular-nums">{formatUsd(limit)}</span>
					</>
				)}
			</p>
			{limit ? (
				<div
					className="h-1 w-full min-w-32 overflow-hidden rounded-full bg-muted"
					role="progressbar"
					aria-label="AI budget used"
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={Math.round(ratio * 100)}
				>
					<div
						className={cn(
							"h-full rounded-full",
							ratio >= 1 ? "bg-danger" : ratio > 0.8 ? "bg-warning" : "bg-primary",
						)}
						style={{ width: `${ratio * 100}%` }}
					/>
				</div>
			) : null}
		</div>
	);
}

/** Shown in place of AI controls when the server has no key for that feature. */
export function AiNotConfigured({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<Alert tone="info" icon={Sparkles} title="AI isn't configured" className={className}>
			{children}
		</Alert>
	);
}

/** Inline error for an AI call; the budget case gets its own, clearer wording. */
export function AiError({ error, className }: { error: unknown; className?: string }) {
	if (!error) return null;
	const budget = isApiError(error) && error.code === "ai_budget_exceeded";
	return (
		<Alert
			tone={budget ? "warning" : "danger"}
			icon={AlertTriangle}
			title={budget ? "Monthly AI budget used up" : undefined}
			className={className}
		>
			{errorMessage(error)}
		</Alert>
	);
}
