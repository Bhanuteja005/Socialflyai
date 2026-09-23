"use client";

import { CalendarClock, type Send, Zap } from "lucide-react";
import { Label } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatDateTime, formatRelative, zoneLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ScheduleMode } from "./use-composer";

export function SchedulePanel({
	mode,
	onModeChange,
	value,
	onValueChange,
	scheduledAt,
	timeZone,
	disabled,
}: {
	mode: ScheduleMode;
	onModeChange: (mode: ScheduleMode) => void;
	value: string;
	onValueChange: (value: string) => void;
	scheduledAt: Date | null;
	timeZone: string;
	disabled?: boolean;
}) {
	const inPast = mode === "later" && scheduledAt !== null && scheduledAt.getTime() < Date.now();
	const options: { value: ScheduleMode; label: string; icon: typeof Send }[] = [
		{ value: "later", label: "Schedule", icon: CalendarClock },
		{ value: "now", label: "Publish now", icon: Zap },
	];

	return (
		<div className="grid gap-3">
			<div
				role="radiogroup"
				aria-label="When to publish"
				className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
			>
				{options.map((o) => (
					// biome-ignore lint/a11y/useSemanticElements: segmented control styled as buttons
					<button
						key={o.value}
						type="button"
						role="radio"
						aria-checked={mode === o.value}
						disabled={disabled}
						onClick={() => onModeChange(o.value)}
						className={cn(
							"flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md font-medium text-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring",
							mode === o.value
								? "bg-surface-raised text-foreground shadow-xs"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						<o.icon className="size-3.5" aria-hidden="true" />
						{o.label}
					</button>
				))}
			</div>
			{mode === "later" ? (
				<div className="grid gap-1.5">
					<Label htmlFor="scheduled-at">Date and time</Label>
					<Input
						id="scheduled-at"
						type="datetime-local"
						value={value}
						onChange={(e) => onValueChange(e.target.value)}
						disabled={disabled}
						aria-invalid={inPast || undefined}
						aria-describedby="scheduled-at-hint"
					/>
					<p
						id="scheduled-at-hint"
						className={cn("text-xs", inPast ? "text-danger" : "text-muted-foreground")}
					>
						{inPast
							? "That time is in the past."
							: scheduledAt
								? `${formatDateTime(scheduledAt, timeZone)} ${zoneLabel(timeZone, scheduledAt)} · ${formatRelative(scheduledAt)}`
								: "Pick a date and time."}
					</p>
				</div>
			) : (
				<p className="text-muted-foreground text-xs">
					Goes out as soon as you click Publish. Each channel publishes independently.
				</p>
			)}
		</div>
	);
}
