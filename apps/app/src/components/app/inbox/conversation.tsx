"use client";

import { Badge } from "@socialfly/ui/components/badge";
import { Button } from "@socialfly/ui/components/button";
import { Tooltip } from "@socialfly/ui/components/controls";
import { Alert, Skeleton } from "@socialfly/ui/components/feedback";
import { cn } from "@socialfly/ui/utils";
import {
	Archive,
	ExternalLink,
	FileText,
	Inbox,
	Lock,
	Mail,
	ShieldAlert,
	Sparkles,
	X,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useInboxItem, useInboxSettings, useSetItemStatus } from "@/hooks/use-inbox";
import type { InboxItem, InboxItemDetail } from "@/lib/api-types";
import { formatDateTime, formatRelative } from "@/lib/format";
import { providerName } from "@/lib/providers";
import { useOrg } from "../org-provider";
import { LoadError } from "../research/research-shared";
import {
	AuthorAvatar,
	AuthorLine,
	authorName,
	KIND_LABEL,
	RelevanceChip,
	relevanceBand,
	SentimentBadge,
} from "./inbox-shared";
import { type ComposerEdit, ReplyComposer } from "./reply-composer";
import { ReplyHistory } from "./reply-history";

/** Header, scrolling thread, and the reply box pinned to the bottom of the pane. */
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
			<div className="flex min-h-0 flex-1 flex-col" aria-busy="true">
				<div className="flex gap-3 border-border border-b px-5 py-4">
					<Skeleton className="size-9 rounded-full" />
					<div className="grid flex-1 content-center gap-2">
						<Skeleton className="h-3 w-40" />
						<Skeleton className="h-3 w-24" />
					</div>
				</div>
				<div className="grid gap-4 p-5">
					<Skeleton className="h-12" />
					<Skeleton className="h-16 w-3/4" />
					<Skeleton className="ml-auto h-14 w-2/3" />
				</div>
			</div>
		);
	}
	if (detail.isError) {
		return (
			<div className="p-4">
				<LoadError
					compact
					title="Couldn't load this conversation"
					error={detail.error}
					onRetry={() => void detail.refetch()}
				/>
			</div>
		);
	}

	const item = detail.data;
	// The thread normally includes the item itself; make sure it's there either way.
	const thread: InboxItem[] = item.thread.some((t) => t.id === item.id)
		? item.thread
		: [...item.thread, item].sort((a, b) => a.postedAt.localeCompare(b.postedAt));
	const platform = providerName(item.provider);

	return (
		<article className="flex min-h-0 flex-1 flex-col" aria-label={`${authorName(item.author)}`}>
			<header className="flex items-center gap-3 border-border border-b px-4 py-3 sm:px-5">
				<AuthorAvatar item={item} size="md" />
				<div className="grid min-w-0 flex-1 gap-0.5">
					<AuthorLine item={item} />
					<p className="truncate text-muted-foreground text-xs">
						{KIND_LABEL[item.kind]} on {item.community ?? item.channel.name} · {platform} ·{" "}
						<time
							dateTime={item.postedAt}
							title={formatDateTime(item.postedAt)}
							className="font-mono tabular-nums"
						>
							{formatRelative(item.postedAt)}
						</time>
					</p>
				</div>
				<div className="flex shrink-0 items-center gap-0.5">
					<StatusActions item={item} />
					{item.url ? (
						<Tooltip content={`Open on ${platform}`}>
							<Button asChild variant="ghost" size="icon-sm">
								<a
									href={item.url}
									target="_blank"
									rel="noreferrer"
									aria-label={`Open on ${platform}`}
								>
									<ExternalLink />
								</a>
							</Button>
						</Tooltip>
					) : null}
					<Tooltip content="Close">
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Close conversation"
							className="hidden lg:inline-flex"
							onClick={onClose}
						>
							<X />
						</Button>
					</Tooltip>
				</div>
			</header>

			<div className="scrollbar-thin grid min-h-0 flex-1 content-start gap-5 overflow-y-auto bg-surface px-4 py-5 sm:px-5">
				{item.relevance !== null || item.sentiment ? (
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl bg-surface-raised px-3.5 py-2.5 text-xs">
						<span className="inline-flex items-center gap-1.5 font-medium text-foreground">
							<Sparkles className="size-3.5 text-muted-foreground" aria-hidden="true" />
							AI triage
						</span>
						<RelevanceChip relevance={item.relevance} reason={item.relevanceReason} />
						<SentimentBadge sentiment={item.sentiment} />
						{item.relevance !== null && item.relevanceReason ? (
							<p className="basis-full text-muted-foreground leading-relaxed">
								<span className="font-medium text-foreground">
									{relevanceBand(item.relevance).label} relevance:
								</span>{" "}
								{item.relevanceReason}
							</p>
						) : null}
					</div>
				) : null}

				{item.post ? (
					<Link
						href={`/posts/${item.post.postId}`}
						className="group flex gap-3 rounded-xl border border-transparent bg-surface-raised px-3.5 py-3 transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-ring"
					>
						<FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
						<span className="grid min-w-0 gap-0.5">
							<span className="font-medium text-muted-foreground text-xs group-hover:text-foreground">
								In reply to your post
							</span>
							<span className="line-clamp-2 text-[13px] text-foreground/90">
								{item.post.excerpt || "(no text)"}
							</span>
						</span>
					</Link>
				) : null}

				{item.title ? <h2 className="font-medium text-base leading-snug">{item.title}</h2> : null}

				<ol className="grid gap-4" aria-label="Thread">
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
			</div>

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
	if (inactive) {
		return (
			<Button variant="outline" size="xs" className="mr-1" onClick={() => set("read")}>
				<Inbox />
				Move to inbox
			</Button>
		);
	}
	return (
		<>
			{item.status === "read" ? (
				<Tooltip content="Mark unread">
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Mark unread"
						onClick={() => set("new")}
					>
						<Mail />
					</Button>
				</Tooltip>
			) : null}
			<Tooltip content="Mark as spam">
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="Mark as spam"
					onClick={() => set("spam")}
				>
					<ShieldAlert />
				</Button>
			</Tooltip>
			<Button
				variant="outline"
				size="xs"
				className="mx-1"
				onClick={() => set("archived")}
				aria-keyshortcuts="e"
			>
				<Archive />
				<span className="max-sm:sr-only">Archive</span>
			</Button>
		</>
	);
}

function ThreadMessage({ message, current }: { message: InboxItem; current: boolean }) {
	const time = (
		<time
			dateTime={message.postedAt}
			title={formatDateTime(message.postedAt)}
			className="shrink-0 font-mono text-[11px] text-subtle-foreground tabular-nums"
		>
			{formatRelative(message.postedAt)}
		</time>
	);
	if (message.fromSelf) {
		return (
			<li className="ml-10 grid justify-items-end gap-1 sm:ml-16">
				<p className="flex items-center gap-2 text-xs">
					{time}
					<span className="font-medium text-foreground">You · {message.channel.name}</span>
				</p>
				<p className="whitespace-pre-wrap rounded-2xl rounded-tr-md bg-ink px-3.5 py-2.5 text-ink-foreground text-sm leading-relaxed">
					{message.text}
				</p>
			</li>
		);
	}
	return (
		<li aria-current={current ? "true" : undefined} className="mr-6 flex gap-2.5 sm:mr-16">
			<AuthorAvatar item={message} />
			<div className="grid min-w-0 flex-1 gap-1">
				<div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
					<AuthorLine item={message} className="max-w-full" />
					{time}
					{current ? (
						<Badge tone="outline">This {KIND_LABEL[message.kind].toLowerCase()}</Badge>
					) : null}
				</div>
				<p
					className={cn(
						"w-fit max-w-full whitespace-pre-wrap rounded-2xl rounded-tl-md px-3.5 py-2.5 text-sm leading-relaxed",
						current
							? "border border-border bg-surface-raised text-foreground"
							: "bg-surface-raised text-muted-foreground",
					)}
				>
					{message.text}
				</p>
			</div>
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
	let body: ReactNode;
	if (!can("editor")) {
		body = (
			<p className="flex items-center gap-1.5 text-muted-foreground text-xs">
				<Lock className="size-3.5" aria-hidden="true" />
				Viewers can read the inbox. Ask an admin for editor access to reply.
			</p>
		);
	} else if (item.fromSelf) {
		return null;
	} else if (!item.canReply) {
		body = (
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
	} else {
		body = (
			<ReplyComposer
				item={item}
				edit={edit}
				onEditDone={onEditDone}
				focusSignal={focusComposer}
				approvalRequired={approvalRequired}
			/>
		);
	}
	return (
		<div className="shrink-0 border-border border-t bg-surface-raised px-4 py-3 sm:px-5">
			{body}
		</div>
	);
}
