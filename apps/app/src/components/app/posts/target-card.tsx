"use client";

import { Button } from "@socialfly/ui/components/button";
import { Checkbox } from "@socialfly/ui/components/controls";
import { ConfirmDialog } from "@socialfly/ui/components/dialog";
import { Label } from "@socialfly/ui/components/field";
import { AlertTriangle, ExternalLink, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { PostTarget } from "@/lib/api-types";
import { formatDateTime } from "@/lib/format";
import { providerName } from "@/lib/providers";
import { RETRYABLE_TARGET_STATUSES } from "@/lib/status";
import { ChannelAvatar, TargetStatusBadge } from "../status-badge";

export function TargetCard({
	target,
	timeZone,
	canRetry,
	retrying,
	onRetry,
}: {
	target: PostTarget;
	timeZone: string;
	canRetry: boolean;
	retrying: boolean;
	onRetry: (confirmNotPublished: boolean) => Promise<unknown>;
}) {
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [checked, setChecked] = useState(false);
	const platform = providerName(target.channel.provider);
	const retryable = canRetry && RETRYABLE_TARGET_STATUSES.includes(target.status);
	const unconfirmed = target.status === "unconfirmed";

	return (
		<li className="grid gap-3 px-4 py-4">
			<div className="flex flex-wrap items-center gap-3">
				<ChannelAvatar channel={target.channel} />
				<div className="grid min-w-0 flex-1">
					<p className="truncate font-medium text-sm">{target.channel.name}</p>
					<p className="truncate text-muted-foreground text-xs">
						{platform}
						{target.publishedAt
							? ` · Published ${formatDateTime(target.publishedAt, timeZone)}`
							: target.scheduledAt && target.status !== "draft"
								? ` · ${formatDateTime(target.scheduledAt, timeZone)}`
								: ""}
					</p>
				</div>
				<TargetStatusBadge status={target.status} />
				{target.externalUrl ? (
					<Button variant="outline" size="xs" asChild>
						<a href={target.externalUrl} target="_blank" rel="noreferrer">
							<ExternalLink />
							View on {platform}
						</a>
					</Button>
				) : null}
				{retryable ? (
					<Button
						variant={unconfirmed ? "outline" : "primary"}
						size="xs"
						loading={retrying}
						onClick={() => (unconfirmed ? setConfirmOpen(true) : void onRetry(false))}
					>
						<RotateCcw />
						Retry
					</Button>
				) : null}
			</div>

			{target.status === "failed" || unconfirmed ? (
				<div
					className={
						unconfirmed
							? "flex gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm"
							: "flex gap-2 rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-sm"
					}
				>
					<AlertTriangle
						className={
							unconfirmed
								? "mt-0.5 size-4 shrink-0 text-warning"
								: "mt-0.5 size-4 shrink-0 text-danger"
						}
						aria-hidden="true"
					/>
					<div className="grid gap-0.5">
						<p className="font-medium">
							{unconfirmed ? "We couldn't confirm whether this was published" : "Publishing failed"}
						</p>
						<p className="text-foreground/80 text-xs">
							{unconfirmed
								? `${platform} didn't answer in time. The post may already be live — check ${target.channel.name} before retrying.`
								: (target.errorMessage ?? "The platform rejected this post.")}
							{target.errorCode ? (
								<span className="ml-1 font-mono text-[11px] opacity-70">({target.errorCode})</span>
							) : null}
						</p>
					</div>
				</div>
			) : null}

			{target.contentOverride !== null ? (
				<details className="group text-sm">
					<summary className="cursor-pointer text-muted-foreground text-xs hover:text-foreground">
						Custom text for this channel
					</summary>
					<p className="mt-2 whitespace-pre-wrap rounded-md bg-muted px-3 py-2">
						{target.contentOverride}
					</p>
				</details>
			) : null}

			<ConfirmDialog
				open={confirmOpen}
				onOpenChange={(open) => {
					setConfirmOpen(open);
					if (!open) setChecked(false);
				}}
				title="This post may already be live"
				description={`Our last attempt reached ${platform} but we never got a confirmation back. Retrying could post it twice.`}
				confirmLabel="Publish again"
				confirmDisabled={!checked}
				onConfirm={async () => {
					await onRetry(true);
					setConfirmOpen(false);
					setChecked(false);
				}}
			>
				<div className="grid gap-3 text-sm">
					<p className="text-muted-foreground">
						Open {target.channel.name} on {platform} and look for this post first.
						{target.externalUrl ? null : " If it's there, don't retry."}
					</p>
					<div className="flex items-start gap-2.5 rounded-md border border-border p-3">
						<Checkbox
							id={`confirm-${target.id}`}
							checked={checked}
							onCheckedChange={(v) => setChecked(v === true)}
						/>
						<Label htmlFor={`confirm-${target.id}`} className="font-normal leading-snug">
							I checked {platform} and this post is not published there.
						</Label>
					</div>
				</div>
			</ConfirmDialog>
		</li>
	);
}
