"use client";

import { Badge } from "@socialfly/ui/components/badge";
import { Button } from "@socialfly/ui/components/button";
import { Alert, Skeleton } from "@socialfly/ui/components/feedback";
import { cn } from "@socialfly/ui/utils";
import {
	Archive,
	ExternalLink,
	Inbox,
	Lock,
	Mail,
	MessageSquareReply,
	ShieldAlert,
	X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useInboxItem, useInboxSettings, useSetItemStatus } from "@/hooks/use-inbox";
import type { InboxItem, InboxItemDetail } from "@/lib/api-types";
import { formatDateTime, formatRelative } from "@/lib/format";
import { providerName } from "@/lib/providers";
import { useOrg } from "../org-provider";
import { LoadError } from "../research/research-shared";
import {
	AuthorAvatar,
	AuthorLine,
	KIND_LABEL,
	RelevanceChip,
	relevanceBand,
	SentimentBadge,
} from "./inbox-shared";
import { type ComposerEdit, ReplyComposer } from "./reply-composer";
import { ReplyHistory } from "./reply-history";

export function Conversation({
	id,
	focusComposer,
	onClose,
}: {
	id: string;
	focusComposer: number;
	onClose: () => void;
}) {
	const { can } = useOrg();
	const editor = can("editor");
	const detail = useInboxItem(id);
	const settings = useInboxSettings(editor);
	const setStatus = useSetItemStatus();
	const [edit, setEdit] = useState<ComposerEdit | null>(null);

	// Opening a new item marks it read (once) — viewers can look without changing anything.
	const markedRef = useRef(false);
	const status = detail.data?.status;
	useEffect(() => {
		if (!editor || markedRef.current || status !== "new") return;
		markedRef.current = true;
		setStatus.mutate({ ids: [id], status: "read", quiet: true });
	}, [editor, status, id, setStatus]);

	if (detail.isPending) {
		return (
			<div className="grid gap-4 rounded-lg border border-border p-4" aria-busy="true">
				<div className="flex gap-3">
					<Skeleton className="size-9 rounded-full" />
					<div className="grid flex-1 gap-2">
						<Skeleton className="h-3 w-40" />
						<Skeleton className="h-3 w-24" />
					</div>
				</div>
				<Skeleton className="h-16" />
				<Skeleton className="h-28" />
			</div>
		);
	}
	if (detail.isError) {
		return (
			<LoadError
				compact
				title="Couldn't load this conversation"
				error={detail.error}
				onRetry={() => void detail.refetch()}
			/>
		);
	}

	const item = detail.data;
	// The thread normally includes the item itself; make sure it's there either way.
	const thread: InboxItem[] = item.thread.some((t) => t.id === item.id)
		? item.thread
		: [...item.thread, item].sort((a, b) => a.postedAt.localeCompare(b.postedAt));
	const platform = providerName(item.provider);

	return (
		<article className="grid gap-4 rounded-lg border border-border bg-surface-raised p-4 shadow-xs">
			<header className="flex flex-wrap items-start gap-3">
				<AuthorAvatar item={item} size="md" />
				<div className="grid min-w-0 flex-1 gap-0.5">
					<AuthorLine item={item} />
					<p className="truncate text-muted-foreground text-xs">
						{KIND_LABEL[item.kind]} on {item.community ?? item.channel.name} ·{" "}
						<time dateTime={item.postedAt} title={formatDateTime(item.postedAt)}>
							{formatRelative(item.postedAt)}
						</time>
					</p>
				</div>
				<div className="flex items-center gap-1">
					{item.url ? (
						<Button asChild variant="ghost" size="icon-sm">
							<a
								href={item.url}
								target="_blank"
								rel="noreferrer"
								aria-label={`Open on ${platform}`}
								title={`Open on ${platform}`}
							>
								<ExternalLink />
							</a>
						</Button>
					) : null}
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Close conversation"
						className="hidden lg:inline-flex"
						onClick={onClose}
					>
						<X />
					</Button>
				</div>
			</header>

			<StatusActions item={item} />

			{item.relevance !== null || item.sentiment ? (
				<div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs">
					<RelevanceChip relevance={item.relevance} reason={item.relevanceReason} />
					<SentimentBadge sentiment={item.sentiment} />
					{item.relevance !== null && item.relevanceReason ? (
						<span className="min-w-0 flex-1 text-muted-foreground">
							<span className="font-medium text-foreground">
								{relevanceBand(item.relevance).label} relevance:
							</span>{" "}
							{item.relevanceReason}
						</span>
					) : null}
				</div>
			) : null}

			{item.post ? (
				<Link
					href={`/posts/${item.post.postId}`}
					className="grid gap-1 rounded-md border border-border border-l-4 border-l-primary/50 bg-surface px-3 py-2 transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-ring"
				>
					<span className="font-medium text-[11px] text-subtle-foreground uppercase tracking-wider">
						Your post
					</span>
					<span className="line-clamp-3 text-muted-foreground text-sm">
						{item.post.excerpt || "(no text)"}
					</span>
				</Link>
			) : null}

			{item.title ? <h2 className="font-semibold text-base leading-snug">{item.title}</h2> : null}

			<ol className="grid gap-2.5" aria-label="Thread">
				{thread.map((t) => (
					<ThreadMessage key={t.id} message={t} current={t.id === item.id} />
				))}
			</ol>

			<ReplyHistory
				replies={item.replies}
				itemId={item.id}
				provider={item.provider}
				itemUrl={item.url}
				onEdit={(r) => setEdit((prev) => ({ ...r, n: (prev?.n ?? 0) + 1 }))}
			/>

			<ReplyArea
				item={item}
				edit={edit}
				onEditDone={() => setEdit(null)}
				focusComposer={focusComposer}
				approvalRequired={settings.data?.replyApprovalRequired}
			/>
		</article>
	);
}

function StatusActions({ item }: { item: InboxItemDetail }) {
	const { can } = useOrg();
	const setStatus = useSetItemStatus();
	if (!can("editor")) return null;
	const set = (status: InboxItem["status"]) => setStatus.mutate({ ids: [item.id], status });
	const inactive = item.status === "archived" || item.status === "spam";
	return (
		<div className="-mt-1 flex flex-wrap gap-1">
			{inactive ? (
				<Button variant="outline" size="xs" onClick={() => set("read")}>
					<Inbox />
					Move to inbox
				</Button>
			) : (
				<>
					<Button variant="outline" size="xs" onClick={() => set("archived")} aria-keyshortcuts="e">
						<Archive />
						Archive
					</Button>
					<Button variant="ghost" size="xs" onClick={() => set("spam")}>
						<ShieldAlert />
						Spam
					</Button>
					{item.status === "read" ? (
						<Button variant="ghost" size="xs" onClick={() => set("new")}>
							<Mail />
							Mark unread
						</Button>
					) : null}
				</>
			)}
		</div>
	);
}

function ThreadMessage({ message, current }: { message: InboxItem; current: boolean }) {
	if (message.fromSelf) {
		return (
			<li className="ml-8 grid gap-1 rounded-lg rounded-tr-sm bg-primary-soft/60 px-3 py-2">
				<p className="flex items-center gap-1.5 font-medium text-primary-text text-xs">
					<MessageSquareReply className="size-3.5" aria-hidden="true" />
					You ({message.channel.name})
					<time
						dateTime={message.postedAt}
						title={formatDateTime(message.postedAt)}
						className="ml-auto font-normal text-subtle-foreground"
					>
						{formatRelative(message.postedAt)}
					</time>
				</p>
				<p className="whitespace-pre-wrap text-sm leading-relaxed">{message.text}</p>
			</li>
		);
	}
	return (
		<li
			aria-current={current ? "true" : undefined}
			className={cn(
				"mr-8 grid gap-1 rounded-lg rounded-tl-sm px-3 py-2",
				current ? "bg-surface ring-2 ring-primary/40" : "bg-muted/60",
			)}
		>
			<div className="flex min-w-0 items-center gap-2">
				<AuthorLine item={message} className="flex-1" />
				{current ? (
					<Badge tone="primary">This {KIND_LABEL[message.kind].toLowerCase()}</Badge>
				) : null}
				<time
					dateTime={message.postedAt}
					title={formatDateTime(message.postedAt)}
					className="shrink-0 text-subtle-foreground text-xs"
				>
					{formatRelative(message.postedAt)}
				</time>
			</div>
			<p
				className={cn(
					"whitespace-pre-wrap text-sm leading-relaxed",
					!current && "text-muted-foreground",
				)}
			>
				{message.text}
			</p>
		</li>
	);
}

function ReplyArea({
	item,
	edit,
	onEditDone,
	focusComposer,
	approvalRequired,
}: {
	item: InboxItemDetail;
	edit: ComposerEdit | null;
	onEditDone: () => void;
	focusComposer: number;
	approvalRequired: boolean | undefined;
}) {
	const { can } = useOrg();
	if (!can("editor")) {
		return (
			<p className="flex items-center gap-1.5 text-muted-foreground text-xs">
				<Lock className="size-3.5" aria-hidden="true" />
				Viewers can read the inbox. Ask an admin for editor access to reply.
			</p>
		);
	}
	if (item.fromSelf) return null;
	if (!item.canReply) {
		return (
			<Alert
				tone="warning"
				icon={Lock}
				title="You can't reply to this from SocialFly"
				action={
					<Button asChild variant="outline" size="xs">
						<Link href="/channels">Channels</Link>
					</Button>
				}
			>
				{item.replyBlockedReason ??
					`${providerName(item.provider)} doesn't let us answer this. Open it on the platform instead.`}
			</Alert>
		);
	}
	return (
		<ReplyComposer
			item={item}
			edit={edit}
			onEditDone={onEditDone}
			focusSignal={focusComposer}
			approvalRequired={approvalRequired}
		/>
	);
}
