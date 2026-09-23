"use client";

import { Button } from "@socialfly/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@socialfly/ui/components/card";
import { Skeleton } from "@socialfly/ui/components/feedback";
import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { useChannels } from "@/hooks/queries";
import { useConnectChannel } from "@/hooks/use-connect-channel";
import { useOrg } from "../org-provider";
import { ChannelAvatar, ChannelStatusBadge } from "../status-badge";

export function ChannelHealth() {
	const { can } = useOrg();
	const { data: channels, isPending } = useChannels();
	const connect = useConnectChannel();
	const broken = channels?.filter((c) => c.status === "needs_reauth") ?? [];

	return (
		<Card>
			<CardHeader className="flex-row items-center justify-between">
				<CardTitle>Channels</CardTitle>
				<Button variant="link" size="sm" asChild>
					<Link href="/channels">Manage</Link>
				</Button>
			</CardHeader>
			<CardContent className="grid gap-3">
				{isPending ? (
					["a", "b", "c"].map((k) => <Skeleton key={k} className="h-9" />)
				) : !channels?.length ? (
					<p className="text-muted-foreground text-sm">No channels connected yet.</p>
				) : (
					<>
						<p className="text-muted-foreground text-xs">
							{broken.length
								? `${broken.length} of ${channels.length} need to be reconnected`
								: `All ${channels.length} channels are healthy`}
						</p>
						<ul className="grid gap-2.5">
							{[...broken, ...channels.filter((c) => c.status !== "needs_reauth")]
								.slice(0, 8)
								.map((c) => (
									<li key={c.id} className="flex items-center gap-2.5">
										<ChannelAvatar channel={c} size="sm" />
										<span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
										{c.status === "needs_reauth" && can("admin") ? (
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
											<ChannelStatusBadge status={c.status} />
										)}
									</li>
								))}
						</ul>
					</>
				)}
			</CardContent>
		</Card>
	);
}
