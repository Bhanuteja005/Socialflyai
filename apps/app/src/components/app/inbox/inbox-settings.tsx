"use client";

import { Badge } from "@socialfly/ui/components/badge";
import { Button } from "@socialfly/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@socialfly/ui/components/card";
import { Switch } from "@socialfly/ui/components/controls";
import { EmptyState } from "@socialfly/ui/components/feedback";
import { Label } from "@socialfly/ui/components/field";
import { Check, Minus, Radio, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useConnectChannel } from "@/hooks/use-connect-channel";
import { useInboxSettings, useUpdateInboxSettings } from "@/hooks/use-inbox";
import type { InboxChannelCapability } from "@/lib/api-types";
import { providerName } from "@/lib/providers";
import { ProviderIcon } from "../provider-icon";
import { ListSkeleton, LoadError } from "../research/research-shared";

function Yes({ on, label }: { on: boolean; label: string }) {
	return on ? (
		<Check className="size-4 text-foreground" aria-label={`${label}: yes`} />
	) : (
		<Minus className="size-4 text-subtle-foreground" aria-label={`${label}: no`} />
	);
}

/** Admin settings: the approval rule, and what each channel lets the inbox do. */
export function InboxSettingsPanel() {
	const settings = useInboxSettings();
	const save = useUpdateInboxSettings();
	const connect = useConnectChannel();

	if (settings.isPending) return <ListSkeleton rows={4} />;
	if (settings.isError) {
		return (
			<LoadError
				title="Couldn't load inbox settings"
				error={settings.error}
				onRetry={() => void settings.refetch()}
			/>
		);
	}
	const { replyApprovalRequired, channels } = settings.data;
	const supported = channels.filter((c) => c.supportsInbox);

	return (
		<div className="grid max-w-3xl gap-4">
			<Card>
				<CardContent className="flex items-start justify-between gap-6 p-5">
					<div className="grid gap-1">
						<Label htmlFor="reply-approval" className="font-medium text-sm">
							Require approval for replies
						</Label>
						<CardDescription>
							Editors' replies wait for an admin before they're sent.
						</CardDescription>
					</div>
					<Switch
						id="reply-approval"
						className="mt-0.5"
						checked={
							save.isPending
								? (save.variables?.replyApprovalRequired ?? replyApprovalRequired)
								: replyApprovalRequired
						}
						disabled={save.isPending}
						onCheckedChange={(on) => save.mutate({ replyApprovalRequired: on })}
					/>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Channels</CardTitle>
					<CardDescription>Missing permissions? Reconnect the channel.</CardDescription>
				</CardHeader>
				{channels.length === 0 ? (
					<CardContent>
						<EmptyState
							compact
							icon={Radio}
							title="No channels connected"
							action={
								<Button asChild size="sm">
									<Link href="/channels">Connect a channel</Link>
								</Button>
							}
						/>
					</CardContent>
				) : (
					<div className="mt-4 overflow-x-auto">
						{supported.length === 0 ? (
							<p className="px-5 pb-3 text-muted-foreground text-sm">
								None of your connected platforms support the inbox yet.
							</p>
						) : null}
						<table className="w-full min-w-[34rem] text-sm">
							<caption className="sr-only">Inbox capabilities per channel</caption>
							<thead>
								<tr className="h-10 border-border border-y bg-surface text-left text-muted-foreground text-xs">
									<th scope="col" className="px-5 py-2 font-medium">
										Channel
									</th>
									<th scope="col" className="px-2 py-2 text-center font-medium">
										Inbox
									</th>
									<th scope="col" className="px-2 py-2 text-center font-medium">
										Read
									</th>
									<th scope="col" className="px-2 py-2 text-center font-medium">
										Reply
									</th>
									<th scope="col" className="px-5 py-2 font-medium">
										<span className="sr-only">Actions</span>
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{channels.map((c) => (
									<ChannelRow
										key={c.id}
										channel={c}
										reconnecting={connect.isPending && connect.variables === c.provider}
										onReconnect={() => connect.mutate(c.provider)}
									/>
								))}
							</tbody>
						</table>
					</div>
				)}
			</Card>
		</div>
	);
}

function ChannelRow({
	channel: c,
	reconnecting,
	onReconnect,
}: {
	channel: InboxChannelCapability;
	reconnecting: boolean;
	onReconnect: () => void;
}) {
	return (
		<tr>
			<td className="px-5 py-3">
				<div className="flex min-w-0 items-center gap-2.5">
					<ProviderIcon provider={c.provider} size="md" />
					<div className="grid min-w-0">
						<span className="truncate font-medium">{c.name}</span>
						<span className="text-muted-foreground text-xs">{providerName(c.provider)}</span>
					</div>
				</div>
				{c.missingScopes.length ? (
					<p className="mt-1.5 text-warning text-xs">
						Missing permissions:{" "}
						{c.missingScopes.map((s) => (
							<Badge key={s} tone="warning" className="mr-1 font-mono">
								{s}
							</Badge>
						))}
					</p>
				) : !c.supportsInbox ? (
					<p className="mt-1.5 text-muted-foreground text-xs">
						{providerName(c.provider)} doesn't offer comments to apps like ours yet.
					</p>
				) : null}
			</td>
			<td className="px-2 py-3 text-center">
				<span className="inline-flex justify-center">
					<Yes on={c.supportsInbox} label="Supports inbox" />
				</span>
			</td>
			<td className="px-2 py-3 text-center">
				<span className="inline-flex justify-center">
					<Yes on={c.canRead} label="Can read" />
				</span>
			</td>
			<td className="px-2 py-3 text-center">
				<span className="inline-flex justify-center">
					<Yes on={c.canReply} label="Can reply" />
				</span>
			</td>
			<td className="px-5 py-3 text-right">
				{c.supportsInbox && c.missingScopes.length ? (
					<Button size="xs" variant="outline" loading={reconnecting} onClick={onReconnect}>
						{reconnecting ? null : <RefreshCw />}
						Reconnect
					</Button>
				) : null}
			</td>
		</tr>
	);
}
