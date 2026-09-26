"use client";

import { Spinner } from "@socialfly/ui/components/feedback";
import { cn } from "@socialfly/ui/utils";
import { AlertCircle, CheckCircle2, CircleDashed } from "lucide-react";
import type { ReactNode } from "react";
import type { Channel } from "@/lib/api-types";
import { ChannelAvatar } from "../status-badge";

export type ChannelProblems = Map<string, string[]>;

/**
 * Per-channel problems (server validation, live or from a 422, plus local checks), shown
 * inline under the editor. Renders nothing while every channel is fine.
 */
export function ValidationPanel({
	channels,
	problems,
	onSelect,
}: {
	channels: Channel[];
	problems: ChannelProblems;
	onSelect: (channelId: string) => void;
}) {
	const failing = channels.filter((c) => (problems.get(c.id)?.length ?? 0) > 0);
	if (failing.length === 0) return null;

	return (
		<div className="grid gap-1 border-danger/20 border-t bg-danger-soft px-5 py-3">
			<p className="flex items-center gap-1.5 font-medium text-danger text-sm">
				<AlertCircle className="size-4" aria-hidden="true" />
				{failing.length === 1
					? "1 channel needs attention"
					: `${failing.length} channels need attention`}
			</p>
			<ul className="grid gap-0.5">
				{failing.map((c) => (
					<li key={c.id}>
						<button
							type="button"
							onClick={() => onSelect(c.id)}
							className="flex w-full cursor-pointer items-start gap-2.5 rounded-md px-1.5 py-1.5 text-left hover:bg-danger/5 focus-visible:outline-2 focus-visible:outline-ring"
						>
							<ChannelAvatar channel={c} size="xs" />
							<span className="grid min-w-0 flex-1 gap-0.5 text-sm">
								<span className="truncate font-medium">{c.name}</span>
								{(problems.get(c.id) ?? []).map((problem) => (
									<span key={problem} className="text-danger text-xs leading-snug">
										{problem}
									</span>
								))}
							</span>
						</button>
					</li>
				))}
			</ul>
		</div>
	);
}

/** One-line readiness summary for the action bar. */
export function ReadinessStatus({
	channels,
	problems,
	checking,
	error,
}: {
	channels: Channel[];
	problems: ChannelProblems;
	checking: boolean;
	error?: string | null;
}) {
	const failing = channels.filter((c) => (problems.get(c.id)?.length ?? 0) > 0).length;
	const base = "flex min-w-0 items-center gap-2 text-sm";
	let body: ReactNode;
	if (channels.length === 0) {
		body = (
			<span className={cn(base, "text-muted-foreground")}>
				<CircleDashed className="size-4 shrink-0" aria-hidden="true" />
				<span className="truncate">Pick at least one channel</span>
			</span>
		);
	} else if (failing) {
		body = (
			<span className={cn(base, "font-medium text-danger")}>
				<AlertCircle className="size-4 shrink-0" aria-hidden="true" />
				<span className="truncate">
					{failing} of {channels.length} channel{channels.length > 1 ? "s" : ""} need attention
				</span>
			</span>
		);
	} else {
		body = (
			<span className={cn(base, "font-medium text-foreground")}>
				<CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
				<span className="truncate">
					Ready for {channels.length} channel{channels.length > 1 ? "s" : ""}
				</span>
			</span>
		);
	}
	return (
		<div className="flex min-w-0 items-center gap-2" aria-live="polite">
			{body}
			{checking ? <Spinner label="Checking" className="size-3.5" /> : null}
			{error ? <span className="truncate text-danger text-xs">{error}</span> : null}
		</div>
	);
}
