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
				"flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 sm:flex-nowrap",
				needsReauth && "bg-warning-soft/40",
			)}
		>
			<ChannelAvatar channel={channel} />
			<div className="grid min-w-0 flex-1 gap-0.5">
				<div className="flex min-w-0 items-center gap-2">
					<p className="truncate font-medium text-sm">{channel.name}</p>
					<ChannelStatusBadge status={channel.status} />
				</div>
				<p className="truncate text-muted-foreground text-xs">
					{providerName(channel.provider)}
					{channel.username ? ` · @${channel.username.replace(/^@/, "")}` : ""}
					{` · Connected ${formatRelative(channel.createdAt)}`}
				</p>
				{needsReauth ? (
					<p className="flex items-start gap-1.5 text-warning text-xs">
						<AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
						<span>
							{channel.lastError ?? "Access expired."} Scheduled posts to this channel will fail
							until you reconnect.
						</span>
					</p>
				) : null}
			</div>
			<div className="ml-auto flex items-center gap-1.5">
				{needsReauth && can("admin") ? (
					<Button
						size="sm"
						loading={connect.isPending}
						onClick={() => connect.mutate(channel.provider)}
					>
						<RefreshCw />
						Reconnect
					</Button>
				) : null}
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
			<ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface-raised">
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
