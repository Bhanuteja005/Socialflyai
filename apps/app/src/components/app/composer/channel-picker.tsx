"use client";

import { Button } from "@socialfly/ui/components/button";
import { Tooltip } from "@socialfly/ui/components/controls";
import { cn } from "@socialfly/ui/utils";
import { Check, Plus, RotateCw } from "lucide-react";
import Link from "next/link";
import type { Channel } from "@/lib/api-types";
import { providerName } from "@/lib/providers";
import { ChannelAvatar } from "../status-badge";

/** Avatar row: one round toggle per channel, Buffer-style. */
export function ChannelPicker({
	channels,
	selectedIds,
	onToggle,
	errorIds,
}: {
	channels: Channel[];
	selectedIds: string[];
	onToggle: (id: string) => void;
	/** Channels with validation problems get a red ring. */
	errorIds: Set<string>;
}) {
	if (channels.length === 0) {
		return (
			<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border border-dashed bg-surface px-4 py-3">
				<p className="text-muted-foreground text-sm">No channels connected yet.</p>
				<Button size="sm" variant="outline" asChild>
					<Link href="/channels">
						<Plus />
						Connect a channel
					</Link>
				</Button>
			</div>
		);
	}

	return (
		<fieldset>
			<legend className="sr-only">Publish to</legend>
			<ul className="flex flex-wrap items-center gap-3">
				{channels.map((channel) => {
					const selected = selectedIds.includes(channel.id);
					const inactive = channel.status !== "active";
					// A channel that lost access can still be deselected, never newly selected.
					const disabled = inactive && !selected;
					const error = selected && errorIds.has(channel.id);
					const label = `${channel.name} · ${providerName(channel.provider)}`;
					return (
						<li key={channel.id}>
							<Tooltip
								content={
									inactive ? `${label} — reconnect on the Channels page to post to it` : label
								}
							>
								<span className="inline-flex">
									<button
										type="button"
										aria-pressed={selected}
										aria-label={label}
										disabled={disabled}
										onClick={() => onToggle(channel.id)}
										className={cn(
											"relative cursor-pointer rounded-full p-[3px] ring-2 transition-all focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:cursor-not-allowed",
											selected
												? error
													? "ring-danger"
													: "ring-primary"
												: "opacity-50 ring-transparent grayscale hover:opacity-100 hover:ring-border-strong hover:grayscale-0",
											disabled &&
												"opacity-35 hover:opacity-35 hover:ring-transparent hover:grayscale",
										)}
									>
										<ChannelAvatar channel={channel} size="md" />
										{selected ? (
											<span
												className={cn(
													"absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full ring-2 ring-surface-raised",
													error ? "bg-danger text-white" : "bg-primary text-primary-foreground",
												)}
												aria-hidden="true"
											>
												<Check className="size-2.5" strokeWidth={3} />
											</span>
										) : inactive ? (
											<span
												className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-warning text-white ring-2 ring-surface-raised"
												aria-hidden="true"
											>
												<RotateCw className="size-2.5" strokeWidth={3} />
											</span>
										) : null}
									</button>
								</span>
							</Tooltip>
						</li>
					);
				})}
				<li>
					<Tooltip content="Connect another channel">
						<Link
							href="/channels"
							aria-label="Connect another channel"
							className="flex size-[42px] items-center justify-center rounded-full border border-border-strong border-dashed text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
						>
							<Plus className="size-4" aria-hidden="true" />
						</Link>
					</Tooltip>
				</li>
			</ul>
		</fieldset>
	);
}
