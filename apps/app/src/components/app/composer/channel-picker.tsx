"use client";

import { Button } from "@socialfly/ui/components/button";
import { Tooltip } from "@socialfly/ui/components/controls";
import { cn } from "@socialfly/ui/utils";
import { Check, Plus } from "lucide-react";
import Link from "next/link";
import type { Channel } from "@/lib/api-types";
import { providerName } from "@/lib/providers";
import { ChannelAvatar } from "../status-badge";

function groupByProvider(channels: Channel[]) {
	const groups = new Map<string, Channel[]>();
	for (const c of channels) groups.set(c.provider, [...(groups.get(c.provider) ?? []), c]);
	return [...groups.entries()];
}

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
			<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border border-dashed px-4 py-3">
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
		<fieldset className="grid gap-3">
			<legend className="sr-only">Publish to</legend>
			{groupByProvider(channels).map(([provider, list]) => (
				<div key={provider} className="flex flex-wrap items-center gap-2">
					<span className="w-full text-[11px] text-subtle-foreground uppercase tracking-wider sm:w-24 sm:shrink-0">
						{providerName(provider)}
					</span>
					{list.map((channel) => {
						const selected = selectedIds.includes(channel.id);
						const disabled = channel.status !== "active" && !selected;
						const chip = (
							<button
								key={channel.id}
								type="button"
								aria-pressed={selected}
								disabled={disabled}
								onClick={() => onToggle(channel.id)}
								className={cn(
									"flex h-10 max-w-full cursor-pointer items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition-all focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-45",
									selected
										? "border-primary bg-primary-soft text-foreground"
										: "border-border bg-surface-raised text-muted-foreground hover:border-border-strong hover:text-foreground",
									selected && errorIds.has(channel.id) && "border-danger bg-danger-soft",
								)}
							>
								<ChannelAvatar channel={channel} size="sm" />
								<span className="max-w-40 truncate font-medium">{channel.name}</span>
								{selected ? (
									<Check className="size-3.5 shrink-0 text-primary-text" aria-hidden="true" />
								) : null}
							</button>
						);
						return channel.status !== "active" ? (
							<Tooltip
								key={channel.id}
								content="Reconnect this channel on the Channels page to post to it"
							>
								<span className="inline-flex">{chip}</span>
							</Tooltip>
						) : (
							<span key={channel.id} className="inline-flex">
								{chip}
							</span>
						);
					})}
				</div>
			))}
		</fieldset>
	);
}
