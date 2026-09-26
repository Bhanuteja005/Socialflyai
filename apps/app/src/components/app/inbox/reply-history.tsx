"use client";

import { Badge } from "@socialfly/ui/components/badge";
import { Button } from "@socialfly/ui/components/button";
import { Checkbox } from "@socialfly/ui/components/controls";
import { ConfirmDialog } from "@socialfly/ui/components/dialog";
import { Alert, Spinner } from "@socialfly/ui/components/feedback";
import { Textarea } from "@socialfly/ui/components/input";
import { toast } from "@socialfly/ui/components/toast";
import { cn } from "@socialfly/ui/utils";
import {
	AlertTriangle,
	Check,
	ExternalLink,
	Pencil,
	RotateCcw,
	Sparkles,
	Trash2,
	Undo2,
	X,
	XCircle,
} from "lucide-react";
import { useId, useState } from "react";
import { useReplyMutations } from "@/hooks/use-inbox";
import { useCurrentUser } from "@/hooks/use-session";
import type { InboxReply } from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { formatDateTime, formatRelative } from "@/lib/format";
import { providerName } from "@/lib/providers";
import { useOrg } from "../org-provider";
import { ReplyStatusBadge } from "./inbox-shared";

const IN_FLIGHT: InboxReply["status"][] = ["approved", "queued", "sending"];

/** Reject with a reason the author will see. */
export function RejectDialog({
	open,
	onOpenChange,
	onReject,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onReject: (reason: string) => Promise<unknown>;
}) {
	const id = useId();
	const [reason, setReason] = useState("");
	return (
		<ConfirmDialog
			open={open}
			onOpenChange={(o) => {
				onOpenChange(o);
				if (!o) setReason("");
			}}
			title="Reject this reply?"
			description="It won't be posted. The person who wrote it sees your reason and can edit and resubmit."
			confirmLabel="Reject"
			tone="danger"
			confirmDisabled={reason.trim().length < 3}
			onConfirm={async () => {
				await onReject(reason.trim())
					.then(() => {
						onOpenChange(false);
						setReason("");
					})
					.catch(() => undefined);
			}}
		>
			<div className="grid gap-1.5">
				<label htmlFor={id} className="font-medium text-sm">
					Reason
				</label>
				<Textarea
					id={id}
					value={reason}
					maxLength={500}
					className="min-h-20"
					placeholder="e.g. Too salesy — answer their question first."
					onChange={(e) => setReason(e.target.value)}
				/>
			</div>
		</ConfirmDialog>
	);
}

/**
 * Retry for a reply whose outcome we never learned. Posting again could publish it twice,
 * so the person has to look on the platform first and say it isn't there.
 */
export function UnconfirmedRetry({
	reply,
	provider,
	itemUrl,
	onRetry,
	pending,
}: {
	reply: InboxReply;
	provider: string;
	itemUrl: string | null;
	onRetry: () => void;
	pending: boolean;
}) {
	const id = useId();
	const [checked, setChecked] = useState(false);
	const platform = providerName(provider);
	return (
		<Alert tone="warning" icon={AlertTriangle} title="We couldn't confirm this was posted">
			<div className="grid gap-2.5">
				<p>
					{platform} didn't tell us whether the reply went through. Check the platform before
					retrying — posting again could publish it twice.
				</p>
				{reply.error?.message ? <p className="text-xs">Details: {reply.error.message}</p> : null}
				{itemUrl ? (
					<a
						href={itemUrl}
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-1 font-medium text-xs underline underline-offset-2"
					>
						Check on {platform}
						<ExternalLink className="size-3" aria-hidden="true" />
					</a>
				) : null}
				<div className="flex items-start gap-2">
					<Checkbox
						id={id}
						className="mt-0.5"
						checked={checked}
						onCheckedChange={(v) => setChecked(v === true)}
					/>
					<label htmlFor={id} className="text-xs">
						I checked {platform} and this reply is not there.
					</label>
				</div>
				<div>
					<Button
						size="xs"
						variant="outline"
						disabled={!checked}
						loading={pending}
						onClick={onRetry}
					>
						<RotateCcw />
						Post it again
					</Button>
				</div>
			</div>
		</Alert>
	);
}

/** Our answers to one item, newest first, with what each person may do next. */
export function ReplyHistory({
	replies,
	itemId,
	provider,
	itemUrl,
	onEdit,
}: {
	replies: InboxReply[];
	itemId: string;
	provider: string;
	itemUrl: string | null;
	/** Load a reply's text into the composer (`id` null → as a new reply). */
	onEdit: (reply: { id: string | null; text: string }) => void;
}) {
	if (!replies.length) return null;
	const sorted = [...replies].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	return (
		<section aria-labelledby={`replies-${itemId}`} className="grid gap-2">
			<h3 id={`replies-${itemId}`} className="font-medium text-muted-foreground text-xs">
				Your replies
			</h3>
			<ul className="grid gap-2">
				{sorted.map((r) => (
					<ReplyCard
						key={r.id}
						reply={r}
						itemId={itemId}
						provider={provider}
						itemUrl={itemUrl}
						onEdit={onEdit}
					/>
				))}
			</ul>
		</section>
	);
}

function ReplyCard({
	reply,
	itemId,
	provider,
	itemUrl,
	onEdit,
}: {
	reply: InboxReply;
	itemId: string;
	provider: string;
	itemUrl: string | null;
	onEdit: (reply: { id: string | null; text: string }) => void;
}) {
	const { can } = useOrg();
	const me = useCurrentUser();
	const { update, approve, reject, retry, remove } = useReplyMutations(itemId);
	const [rejecting, setRejecting] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const admin = can("admin");
	const editor = can("editor");
	const mine = reply.createdBy?.id === me?.id;
	const when = reply.sentAt ?? reply.updatedAt ?? reply.createdAt;

	return (
		<li
			className={cn(
				"grid gap-2 rounded-xl border p-3.5",
				reply.status === "sent"
					? "border-border-strong bg-surface-raised"
					: "border-border bg-surface-raised",
			)}
		>
			<div className="flex flex-wrap items-center gap-1.5 text-xs">
				<ReplyStatusBadge status={reply.status} />
				{reply.source === "ai" ? (
					<Badge tone="outline">
						<Sparkles />
						AI draft
					</Badge>
				) : null}
				<span className="text-muted-foreground">
					{reply.createdBy ? (mine ? "You" : reply.createdBy.name) : "Someone"}
					{" · "}
					<time dateTime={when} title={formatDateTime(when)} className="font-mono tabular-nums">
						{formatRelative(when)}
					</time>
				</span>
				{IN_FLIGHT.includes(reply.status) ? (
					<span className="ml-auto inline-flex items-center gap-1 text-muted-foreground">
						<Spinner className="size-3" label="Posting" />
						Posting…
					</span>
				) : null}
			</div>

			<p className="whitespace-pre-wrap text-sm leading-relaxed">{reply.text}</p>

			{reply.approvedBy && reply.status !== "rejected" ? (
				<p className="text-muted-foreground text-xs">Approved by {reply.approvedBy.name}</p>
			) : null}

			{reply.status === "rejected" ? (
				<Alert tone="danger" icon={XCircle} title="Rejected">
					{reply.rejectionReason ?? "No reason given."}
				</Alert>
			) : null}

			{reply.status === "failed" ? (
				<Alert tone="danger" icon={AlertTriangle} title="Couldn't post this reply">
					{reply.error?.message ?? "The platform refused it."}
				</Alert>
			) : null}

			{reply.status === "unconfirmed" && editor ? (
				<UnconfirmedRetry
					reply={reply}
					provider={provider}
					itemUrl={itemUrl}
					pending={retry.isPending}
					onRetry={() => retry.mutate({ id: reply.id, confirmNotSent: true })}
				/>
			) : null}

			{retry.error ? <p className="text-danger text-xs">{errorMessage(retry.error)}</p> : null}

			<div className="flex flex-wrap items-center gap-1">
				{reply.externalUrl ? (
					<Button asChild variant="ghost" size="xs">
						<a href={reply.externalUrl} target="_blank" rel="noreferrer">
							<ExternalLink />
							View on {providerName(provider)}
						</a>
					</Button>
				) : null}
				{reply.status === "pending_approval" && admin ? (
					<>
						<Button size="xs" loading={approve.isPending} onClick={() => approve.mutate(reply.id)}>
							{approve.isPending ? null : <Check />}
							Approve
						</Button>
						<Button variant="outline" size="xs" onClick={() => setRejecting(true)}>
							<X />
							Reject
						</Button>
					</>
				) : null}
				{editor &&
				(reply.status === "draft" || (reply.status === "pending_approval" && (mine || admin))) ? (
					<Button
						variant="ghost"
						size="xs"
						onClick={() => onEdit({ id: reply.id, text: reply.text })}
					>
						<Pencil />
						Edit
					</Button>
				) : null}
				{editor && reply.status === "rejected" ? (
					<Button
						variant="ghost"
						size="xs"
						onClick={() => onEdit({ id: reply.id, text: reply.text })}
					>
						<Pencil />
						Edit and resubmit
					</Button>
				) : null}
				{editor && reply.status === "pending_approval" && (mine || admin) ? (
					<Button
						variant="ghost"
						size="xs"
						loading={update.isPending}
						onClick={() =>
							update.mutate(
								{ id: reply.id, submit: false },
								{ onError: (e) => toast.error(errorMessage(e)) },
							)
						}
					>
						{update.isPending ? null : <Undo2 />}
						Withdraw
					</Button>
				) : null}
				{editor && reply.status === "failed" ? (
					<Button
						variant="outline"
						size="xs"
						loading={retry.isPending}
						onClick={() => retry.mutate({ id: reply.id })}
					>
						{retry.isPending ? null : <RotateCcw />}
						Retry
					</Button>
				) : null}
				{editor && (reply.status === "draft" || reply.status === "rejected") && (mine || admin) ? (
					<Button
						variant="ghost"
						size="xs"
						className="ml-auto"
						aria-label="Delete reply"
						onClick={() => setDeleting(true)}
					>
						<Trash2 />
					</Button>
				) : null}
			</div>

			<RejectDialog
				open={rejecting}
				onOpenChange={setRejecting}
				onReject={(reason) => reject.mutateAsync({ id: reply.id, reason })}
			/>
			<ConfirmDialog
				open={deleting}
				onOpenChange={setDeleting}
				title="Delete this reply?"
				description="It hasn't been posted, so nothing changes on the platform."
				confirmLabel="Delete"
				tone="danger"
				onConfirm={async () => {
					await remove.mutateAsync(reply.id).catch(() => undefined);
					setDeleting(false);
				}}
			/>
		</li>
	);
}
