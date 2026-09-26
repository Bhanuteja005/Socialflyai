"use client";

import { Badge } from "@socialfly/ui/components/badge";
import { Button } from "@socialfly/ui/components/button";
import { Card, CardHeader, CardTitle } from "@socialfly/ui/components/card";
import { EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import { Plus, Radio, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useChannels } from "@/hooks/queries";
import { useConnectChannel } from "@/hooks/use-connect-channel";
import { providerMeta } from "@/lib/providers";
import { useOrg } from "../org-provider";
import { ChannelAvatar } from "../status-badge";

export function ChannelHealth() {
	const { can } = useOrg();
	const { data: channels, isPending } = useChannels();
	const connect = useConnectChannel();
	const broken = channels?.filter((c) => c.status === "needs_reauth") ?? [];

	return (
		<Card>
			<CardHeader className="flex-row items-center justify-between">
				<CardTitle>Channels</CardTitle>
				{channels?.length ? (
					broken.length ? (
						<Badge tone="warning" dot>
							{broken.length} to reconnect
						</Badge>
					) : (
						<Badge tone="success" dot>
							All healthy
						</Badge>
					)
				) : null}
			</CardHeader>
			<div className="p-5 pt-4">
				{isPending ? (
					<div className="grid gap-3">
						{["a", "b", "c"].map((k) => (
							<Skeleton key={k} className="h-9" />
						))}
					</div>
				) : !channels?.length ? (
					<EmptyState
						compact
						icon={Radio}
						title="No channels yet"
						description="Connect an account to start publishing."
						action={
							can("admin") ? (
								<Button asChild size="sm">
									<Link href="/channels#connect">
										<Plus />
										Connect
									</Link>
								</Button>
							) : null
						}
					/>
				) : (
					<ul className="grid gap-1">
						{[...broken, ...channels.filter((c) => c.status !== "needs_reauth")]
							.slice(0, 6)
							.map((c) => (
								<li key={c.id} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5">
									<ChannelAvatar channel={c} size="sm" />
									<span className="grid min-w-0 flex-1 leading-tight">
										<span className="truncate font-medium text-[13px]">{c.name}</span>
										<span className="truncate text-muted-foreground text-xs">
											{providerMeta(c.provider).name}
											{c.username ? ` · @${c.username}` : ""}
										</span>
									</span>
									{c.status === "needs_reauth" ? (
										can("admin") ? (
											<Button
												variant="outline"
												size="xs"
												loading={connect.isPending && connect.variables === c.provider}
												onClick={() => connect.mutate(c.provider)}
											>
												<RefreshCw />
												Reconnect
											</Button>
										) : (
											<Badge tone="warning">Reconnect</Badge>
										)
									) : (
										<span className="size-2 rounded-full bg-success">
											<span className="sr-only">Active</span>
										</span>
									)}
								</li>
							))}
					</ul>
				)}
				{channels?.length ? (
					<Button variant="outline" size="sm" asChild className="mt-4 w-full">
						<Link href="/channels">Manage channels</Link>
					</Button>
				) : null}
			</div>
		</Card>
	);
}
