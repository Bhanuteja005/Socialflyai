"use client";

import { Badge } from "@socialfly/ui/components/badge";
import { Button } from "@socialfly/ui/components/button";
import { EmptyState } from "@socialfly/ui/components/feedback";
import { Textarea } from "@socialfly/ui/components/input";
import { toast } from "@socialfly/ui/components/toast";
import { cn } from "@socialfly/ui/utils";
import {
	Check,
	ClipboardCheck,
	ExternalLink,
	MessageSquare,
	Pencil,
	Sparkles,
	X,
} from "lucide-react";
import { useId, useState } from "react";
import { useApprovals, useReplyMutations } from "@/hooks/use-inbox";
import type { InboxApproval } from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { formatDateTime, formatRelative, textLength } from "@/lib/format";
import { providerName } from "@/lib/providers";
import { ListSkeleton, LoadError } from "../research/research-shared";
import { AuthorAvatar, AuthorLine, KIND_LABEL, limitFromError, replyLimit } from "./inbox-shared";
import { RejectDialog } from "./reply-history";

/** Replies waiting for an admin: read the original, tweak the answer, approve or send back. */
export function ApprovalsView({ onOpenItem }: { onOpenItem: (itemId: string) => void }) {
	const approvals = useApprovals(true);

	if (approvals.isPending) return <ListSkeleton rows={3} />;
	if (approvals.isError) {
		return (
			<LoadError
				title="Couldn't load replies awaiting approval"
				error={approvals.error}
				onRetry={() => void approvals.refetch()}
			/>
		);
	}
	if (approvals.data.items.length === 0) {
		return (
			<EmptyState
				icon={ClipboardCheck}
				title="Nothing waiting for approval"
				description="When approval is required, replies your editors submit appear here before they're posted."
			/>
		);
	}
	return (
		<ul className="grid max-w-3xl gap-3">
			{approvals.data.items.map((a) => (
				<ApprovalCard key={a.reply.id} approval={a} onOpenItem={() => onOpenItem(a.item.id)} />
			))}
		</ul>
	);
}

function ApprovalCard({
	approval: { reply, item },
	onOpenItem,
}: {
	approval: InboxApproval;
	onOpenItem: () => void;
}) {
	const id = useId();
	const { update, approve, reject } = useReplyMutations(item.id);
	const [editing, setEditing] = useState(false);
	const [text, setText] = useState(reply.text);
	const [rejecting, setRejecting] = useState(false);
	const [limitOverride, setLimitOverride] = useState<number | null>(null);
	const limit = limitOverride ?? item.maxReplyLength ?? replyLimit(item.provider);
	const length = textLength(text);
	const over = length > limit;

	function save() {
		const next = text.trim();
		if (!next || over) return;
		if (next === reply.text) {
			setEditing(false);
			return;
		}
		update.mutate(
			{ id: reply.id, text: next },
			{
				onSuccess: () => {
					setEditing(false);
					toast.success("Reply updated");
				},
				onError: (e) => {
					const reported = limitFromError(e);
					if (reported) setLimitOverride(reported);
				},
			},
		);
	}

	return (
		<li className="grid gap-3 rounded-lg border border-border bg-surface-raised p-4 shadow-xs">
			<div className="flex items-start gap-3">
				<AuthorAvatar item={item} />
				<div className="grid min-w-0 flex-1 gap-1">
					<div className="flex min-w-0 items-center gap-2">
						<AuthorLine item={item} className="flex-1" />
						<time
							dateTime={item.postedAt}
							title={formatDateTime(item.postedAt)}
							className="shrink-0 text-subtle-foreground text-xs"
						>
							{formatRelative(item.postedAt)}
						</time>
					</div>
					<p className="line-clamp-4 whitespace-pre-wrap text-muted-foreground text-sm">
						{item.title ? (
							<span className="font-medium text-foreground">{item.title} — </span>
						) : null}
						{item.text}
					</p>
					<p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-subtle-foreground text-xs">
						<span>
							{KIND_LABEL[item.kind]} on {item.community ?? item.channel.name}
						</span>
						<button
							type="button"
							onClick={onOpenItem}
							className="inline-flex cursor-pointer items-center gap-1 underline-offset-2 hover:text-foreground hover:underline"
						>
							<MessageSquare className="size-3" aria-hidden="true" />
							Open conversation
						</button>
						{item.url ? (
							<a
								href={item.url}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1 underline-offset-2 hover:text-foreground hover:underline"
							>
								<ExternalLink className="size-3" aria-hidden="true" />
								View on {providerName(item.provider)}
							</a>
						) : null}
					</p>
				</div>
			</div>

			<div className="ml-10 grid gap-2 rounded-lg border border-violet/25 bg-violet-soft/30 p-3">
				<p className="flex flex-wrap items-center gap-1.5 text-xs">
					<Badge tone="violet" dot>
						Pending approval
					</Badge>
					{reply.source === "ai" ? (
						<Badge tone="outline">
							<Sparkles />
							AI draft
						</Badge>
					) : null}
					<span className="text-muted-foreground">
						{reply.createdBy?.name ?? "Someone"} · {formatRelative(reply.createdAt)}
					</span>
				</p>
				{editing ? (
					<div className="grid gap-1.5">
						<label htmlFor={`${id}-text`} className="sr-only">
							Reply text
						</label>
						<Textarea
							id={`${id}-text`}
							value={text}
							autoFocus
							className="min-h-24"
							aria-invalid={over || undefined}
							aria-describedby={`${id}-count`}
							onChange={(e) => setText(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Escape") {
									setText(reply.text);
									setEditing(false);
								}
							}}
						/>
						<p
							id={`${id}-count`}
							className={cn("text-xs tabular-nums", over ? "text-danger" : "text-muted-foreground")}
						>
							{length.toLocaleString()} / {limit.toLocaleString()}
						</p>
						{update.error ? (
							<p role="alert" className="text-danger text-xs">
								{errorMessage(update.error)}
							</p>
						) : null}
					</div>
				) : (
					<p className="whitespace-pre-wrap text-sm leading-relaxed">{reply.text}</p>
				)}
			</div>

			<div className="ml-10 flex flex-wrap gap-2">
				{editing ? (
					<>
						<Button
							size="sm"
							loading={update.isPending}
							disabled={!text.trim() || over}
							onClick={save}
						>
							{update.isPending ? null : <Check />}
							Save
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => {
								setText(reply.text);
								setEditing(false);
							}}
						>
							Cancel
						</Button>
					</>
				) : (
					<>
						<Button size="sm" loading={approve.isPending} onClick={() => approve.mutate(reply.id)}>
							{approve.isPending ? null : <Check />}
							Approve and send
						</Button>
						<Button variant="outline" size="sm" onClick={() => setEditing(true)}>
							<Pencil />
							Edit
						</Button>
						<Button variant="danger-outline" size="sm" onClick={() => setRejecting(true)}>
							<X />
							Reject
						</Button>
					</>
				)}
			</div>

			<RejectDialog
				open={rejecting}
				onOpenChange={setRejecting}
				onReject={(reason) => reject.mutateAsync({ id: reply.id, reason })}
			/>
		</li>
	);
}
