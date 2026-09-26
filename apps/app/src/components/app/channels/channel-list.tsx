"use client";

import { Button } from "@socialfly/ui/components/button";
import { ConfirmDialog } from "@socialfly/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@socialfly/ui/components/dropdown-menu";
import { toast } from "@socialfly/ui/components/toast";
import { cn } from "@socialfly/ui/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, MoreHorizontal, RefreshCw, Unplug } from "lucide-react";
import { useState } from "react";
import { useConnectChannel } from "@/hooks/use-connect-channel";
import { api, callVoid } from "@/lib/api-client";
import type { Channel } from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { formatRelative } from "@/lib/format";
import { providerName } from "@/lib/providers";
import { qk } from "@/lib/query-keys";
import { useOrg } from "../org-provider";
import { ChannelAvatar, ChannelStatusBadge } from "../status-badge";

function ChannelRow({ channel, onDisconnect }: { channel: Channel; onDisconnect: () => void }) {
	const { can } = useOrg();
	const connect = useConnectChannel();
	const needsReauth = channel.status === "needs_reauth";

	return (
		<li
			className={cn(
				"flex flex-col rounded-xl border bg-surface-raised shadow-card transition-[border-color,box-shadow] hover:shadow-sm",
				needsReauth ? "border-warning/40" : "border-border hover:border-border-strong",
			)}
		>
			<div className="flex items-start gap-3 p-4">
				<ChannelAvatar channel={channel} size="lg" />
				<div className="grid min-w-0 flex-1 gap-0.5 pt-0.5">
					<p className="truncate font-semibold text-sm">{channel.name}</p>
					<p className="truncate text-muted-foreground text-xs">
						{providerName(channel.provider)}
						{channel.username ? ` · @${channel.username.replace(/^@/, "")}` : ""}
					</p>
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${channel.name}`}>
							<MoreHorizontal />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{channel.profileUrl ? (
							<DropdownMenuItem asChild>
								<a href={channel.profileUrl} target="_blank" rel="noreferrer">
									<ExternalLink />
									View profile
								</a>
							</DropdownMenuItem>
						) : null}
						{can("admin") ? (
							<>
								<DropdownMenuItem onSelect={() => connect.mutate(channel.provider)}>
									<RefreshCw />
									Reconnect
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem destructive onSelect={onDisconnect}>
									<Unplug />
									Disconnect
								</DropdownMenuItem>
							</>
						) : null}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			{needsReauth ? (
				<p className="mx-4 mb-3 flex items-start gap-1.5 rounded-lg bg-warning-soft px-2.5 py-2 text-warning text-xs">
					<AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
					<span>
						{channel.lastError ?? "Access expired."} Scheduled posts to this channel will fail until
						you reconnect.
					</span>
				</p>
			) : null}
			<div className="mt-auto flex items-center justify-between gap-2 border-border border-t px-4 py-2.5">
				<span className="flex items-center gap-2 text-muted-foreground text-xs">
					<ChannelStatusBadge status={channel.status} />
					{needsReauth ? null : <>Connected {formatRelative(channel.createdAt)}</>}
				</span>
				{needsReauth && can("admin") ? (
					<Button
						size="xs"
						loading={connect.isPending}
						onClick={() => connect.mutate(channel.provider)}
					>
						<RefreshCw />
						Reconnect
					</Button>
				) : null}
			</div>
		</li>
	);
}

export function ChannelList({ channels }: { channels: Channel[] }) {
	const { orgId } = useOrg();
	const queryClient = useQueryClient();
	const [target, setTarget] = useState<Channel | null>(null);

	const disconnect = useMutation({
		mutationFn: (id: string) => callVoid(api.channels[":id"].$delete({ param: { id } })),
		onSuccess: (_, id) => {
			queryClient.setQueryData<{ channels: Channel[] }>(qk.channels(orgId), (prev) =>
				prev ? { channels: prev.channels.filter((c) => c.id !== id) } : prev,
			);
			void queryClient.invalidateQueries({ queryKey: qk.postsAll(orgId) });
			toast.success("Channel disconnected");
			setTarget(null);
		},
		onError: (error) => toast.error(errorMessage(error)),
	});

	return (
		<>
			<ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
				{channels.map((channel) => (
					<ChannelRow key={channel.id} channel={channel} onDisconnect={() => setTarget(channel)} />
				))}
			</ul>
			<ConfirmDialog
				open={target !== null}
				onOpenChange={(open) => (open ? undefined : setTarget(null))}
				title={`Disconnect ${target?.name ?? "channel"}?`}
				description="Scheduled posts to this channel will be canceled. Posts already published stay on the platform."
				confirmLabel="Disconnect"
				tone="danger"
				loading={disconnect.isPending}
				onConfirm={() => (target ? disconnect.mutate(target.id) : undefined)}
			/>
		</>
	);
}
