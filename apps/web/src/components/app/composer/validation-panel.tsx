"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Spinner } from "@/components/ui/feedback";
import type { Channel } from "@/lib/api-types";
import { cn } from "@/lib/utils";
import { ChannelAvatar } from "../status-badge";

export type ChannelProblems = Map<string, string[]>;

/** Per-channel readiness: server validation (live or from a 422) plus local checks. */
export function ValidationPanel({
	channels,
	problems,
	checking,
	onSelect,
}: {
	channels: Channel[];
	problems: ChannelProblems;
	checking: boolean;
	onSelect: (channelId: string) => void;
}) {
	if (channels.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">Pick at least one channel to publish to.</p>
		);
	}
	const failing = channels.filter((c) => (problems.get(c.id)?.length ?? 0) > 0).length;

	return (
		<div className="grid gap-2">
			<div className="flex items-center justify-between text-sm">
				<p
					className={cn("font-medium", failing ? "text-danger" : "text-foreground")}
					aria-live="polite"
				>
					{failing
						? `${failing} of ${channels.length} channel${channels.length > 1 ? "s" : ""} need attention`
						: "Ready to publish"}
				</p>
				{checking ? <Spinner label="Checking" /> : null}
			</div>
			<ul className="grid gap-1.5">
				{channels.map((c) => {
					const list = problems.get(c.id) ?? [];
					return (
						<li key={c.id}>
							<button
								type="button"
								onClick={() => onSelect(c.id)}
								className="flex w-full cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
							>
								<ChannelAvatar channel={c} size="sm" />
								<span className="grid min-w-0 flex-1 gap-0.5">
									<span className="flex items-center gap-1.5 text-sm">
										<span className="truncate font-medium">{c.name}</span>
										{list.length ? (
											<AlertCircle
												className="size-3.5 shrink-0 text-danger"
												aria-label="Has problems"
											/>
										) : (
											<CheckCircle2 className="size-3.5 shrink-0 text-success" aria-label="OK" />
										)}
									</span>
									{list.map((problem) => (
										<span key={problem} className="text-danger text-xs leading-snug">
											{problem}
										</span>
									))}
								</span>
							</button>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
