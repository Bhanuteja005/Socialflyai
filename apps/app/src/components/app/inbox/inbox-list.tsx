"use client";

import { Button } from "@socialfly/ui/components/button";
import { Checkbox } from "@socialfly/ui/components/controls";
import { EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import { cn } from "@socialfly/ui/utils";
import { Archive, Inbox, MailOpen, PartyPopper, SearchX, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { type useInboxItems, useSetItemStatus } from "@/hooks/use-inbox";
import type { InboxItem, InboxItemStatus } from "@/lib/api-types";
import { formatDateTime, formatRelative, pluralize } from "@/lib/format";
import { useOrg } from "../org-provider";
import { LoadError } from "../research/research-shared";
import {
	AuthorAvatar,
	authorName,
	KIND_LABEL,
	type ListView,
	RelevanceChip,
	ReplyIndicator,
	SentimentBadge,
} from "./inbox-shared";

/** Statuses each view shows; anything else was just moved away and is hidden until the refetch. */
const VIEW_STATUSES: Record<ListView, InboxItemStatus[]> = {
	open: ["new", "read"],
	discussions: ["new", "read"],
	replied: ["replied"],
	archived: ["archived"],
	spam: ["spam"],
};

/** True when a key press is meant for a text field or a menu, not for inbox shortcuts. */
function isTypingTarget(target: EventTarget | null) {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	if (target.closest("[role=dialog],[role=menu],[role=listbox]")) return true;
	return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function InboxList({
	view,
	items: query,
	openId,
	filtered,
	onOpen,
	onReply,
}: {
	view: ListView;
	items: ReturnType<typeof useInboxItems>;
	openId: string | null;
	filtered: boolean;
	onOpen: (id: string) => void;
	onReply: (id: string) => void;
}) {
	const { can } = useOrg();
	const editor = can("editor");
	const setStatus = useSetItemStatus();
	const hintId = useId();
	const listRef = useRef<HTMLUListElement>(null);
	const [selected, setSelected] = useState<Set<string>>(new Set());

	const allowed = VIEW_STATUSES[view];
	const items = (query.data?.pages.flatMap((p) => p.items) ?? []).filter((i) =>
		allowed.includes(i.status),
	);
	const ids = items.map((i) => i.id);
	const selectedIds = ids.filter((id) => selected.has(id));

	const rowButtons = useCallback(
		() => [...(listRef.current?.querySelectorAll<HTMLElement>("[data-inbox-row]") ?? [])],
		[],
	);

	/** The row shortcuts act on: the focused row, else the open one. */
	const currentId = useCallback(() => {
		const active = document.activeElement;
		const row = active instanceof HTMLElement ? active.closest<HTMLElement>("[data-row-id]") : null;
		return row?.dataset.rowId ?? openId;
	}, [openId]);

	const move = useCallback(
		(delta: number) => {
			const rows = rowButtons();
			if (!rows.length) return;
			const current = currentId();
			const index = rows.findIndex(
				(r) => r.closest<HTMLElement>("[data-row-id]")?.dataset.rowId === current,
			);
			const next = rows[Math.min(rows.length - 1, Math.max(0, index + delta))] ?? rows[0];
			next?.focus();
			next?.scrollIntoView({ block: "nearest" });
		},
		[rowButtons, currentId],
	);

	const archive = useCallback(
		(targetIds: string[], status: InboxItemStatus) => {
			if (!targetIds.length) return;
			// Archiving the open conversation moves on to the next one, like a mail client.
			if (openId && targetIds.includes(openId)) {
				const rest = ids.filter((id) => !targetIds.includes(id));
				const after = ids.slice(ids.indexOf(openId) + 1).find((id) => rest.includes(id));
				const nextId = after ?? rest.at(-1);
				if (nextId) onOpen(nextId);
			}
			setStatus.mutate({ ids: targetIds, status });
			setSelected((s) => new Set([...s].filter((id) => !targetIds.includes(id))));
		},
		[ids, openId, onOpen, setStatus],
	);

	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
			const inList = listRef.current?.contains(document.activeElement ?? null) ?? false;
			const key = e.key;
			if (key === "j" || (inList && key === "ArrowDown")) {
				e.preventDefault();
				move(1);
			} else if (key === "k" || (inList && key === "ArrowUp")) {
				e.preventDefault();
				move(-1);
			} else if (key === "e" && editor && view !== "archived") {
				const id = currentId();
				if (id) {
					e.preventDefault();
					archive([id], "archived");
				}
			} else if (key === "r" && editor) {
				const id = currentId();
				if (id) {
					e.preventDefault();
					onReply(id);
				}
			} else if (key === "x" && editor && inList) {
				const id = currentId();
				if (id) {
					e.preventDefault();
					setSelected((s) => {
						const next = new Set(s);
						if (next.has(id)) next.delete(id);
						else next.add(id);
						return next;
					});
				}
			}
		}
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [move, archive, currentId, editor, onReply, view]);

	if (query.isPending) {
		return (
			<div className="grid gap-2" aria-busy="true">
				{Array.from({ length: 6 }, (_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
					<div key={i} className="flex gap-3 rounded-lg border border-border p-3">
						<Skeleton className="size-7 rounded-full" />
						<div className="grid flex-1 gap-2">
							<Skeleton className="h-3 w-32" />
							<Skeleton className="h-3 w-full" />
							<Skeleton className="h-3 w-2/3" />
						</div>
					</div>
				))}
			</div>
		);
	}
	if (query.isError) {
		return (
			<LoadError
				compact
				title="Couldn't load the inbox"
				error={query.error}
				onRetry={() => void query.refetch()}
			/>
		);
	}
	if (items.length === 0) {
		return filtered ? (
			<EmptyState
				compact
				icon={SearchX}
				title="Nothing matches these filters"
				description="Try a lower relevance, another channel, or clear the search."
			/>
		) : view === "open" ? (
			<EmptyState
				compact
				icon={PartyPopper}
				title="Inbox zero"
				description="Everyone has been answered. New comments and mentions show up here as they arrive."
			/>
		) : view === "discussions" ? (
			<EmptyState
				compact
				icon={Inbox}
				title="No discussions yet"
				description="Add listening queries to find public conversations where your brand could help."
			/>
		) : (
			<EmptyState
				compact
				icon={Inbox}
				title={`Nothing ${view === "replied" ? "replied to" : `in ${view}`} yet`}
			/>
		);
	}

	const allSelected = selectedIds.length === ids.length;
	const inactive = view === "archived" || view === "spam";

	return (
		<div className="grid gap-2">
			{editor ? (
				<div
					className="flex min-h-8 flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-2 py-1"
					role="toolbar"
					aria-label="Bulk actions"
				>
					<Checkbox
						aria-label={allSelected ? "Deselect all" : "Select all"}
						checked={allSelected ? true : selectedIds.length ? "indeterminate" : false}
						onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(ids))}
					/>
					{selectedIds.length ? (
						<>
							<span className="text-muted-foreground text-xs tabular-nums">
								{selectedIds.length} selected
							</span>
							<div className="ml-auto flex flex-wrap gap-1">
								{inactive ? (
									<Button variant="ghost" size="xs" onClick={() => archive(selectedIds, "read")}>
										<Inbox />
										Move to inbox
									</Button>
								) : (
									<Button variant="ghost" size="xs" onClick={() => archive(selectedIds, "read")}>
										<MailOpen />
										Mark read
									</Button>
								)}
								{view !== "archived" ? (
									<Button
										variant="ghost"
										size="xs"
										onClick={() => archive(selectedIds, "archived")}
									>
										<Archive />
										Archive
									</Button>
								) : null}
								{view !== "spam" ? (
									<Button variant="ghost" size="xs" onClick={() => archive(selectedIds, "spam")}>
										<ShieldAlert />
										Spam
									</Button>
								) : null}
							</div>
						</>
					) : (
						<span className="text-muted-foreground text-xs">
							{pluralize(ids.length, "item")}
							{query.hasNextPage ? "+" : ""}
						</span>
					)}
				</div>
			) : null}

			<p id={hintId} className="hidden text-subtle-foreground text-xs lg:block">
				<kbd className="font-mono">j</kbd>/<kbd className="font-mono">k</kbd> move ·{" "}
				<kbd className="font-mono">Enter</kbd> open
				{editor ? (
					<>
						{" "}
						· <kbd className="font-mono">r</kbd> reply · <kbd className="font-mono">e</kbd> archive
						· <kbd className="font-mono">x</kbd> select
					</>
				) : null}
			</p>

			<ul ref={listRef} className="grid gap-1.5" aria-label="Inbox items" aria-describedby={hintId}>
				{items.map((item) => (
					<Row
						key={item.id}
						item={item}
						open={item.id === openId}
						selectable={editor}
						selected={selected.has(item.id)}
						onSelect={(on) =>
							setSelected((s) => {
								const next = new Set(s);
								if (on) next.add(item.id);
								else next.delete(item.id);
								return next;
							})
						}
						onOpen={() => onOpen(item.id)}
						shortcuts={editor ? "Enter r e x" : "Enter"}
					/>
				))}
			</ul>

			{query.hasNextPage ? (
				<Button
					variant="outline"
					size="sm"
					loading={query.isFetchingNextPage}
					onClick={() => void query.fetchNextPage()}
				>
					Load more
				</Button>
			) : null}
		</div>
	);
}

function Row({
	item,
	open,
	selectable,
	selected,
	onSelect,
	onOpen,
	shortcuts,
}: {
	item: InboxItem;
	open: boolean;
	selectable: boolean;
	selected: boolean;
	onSelect: (on: boolean) => void;
	onOpen: () => void;
	shortcuts: string;
}) {
	const unread = item.status === "new";
	const snippet = item.title ? `${item.title} — ${item.text}` : item.text;
	return (
		<li
			data-row-id={item.id}
			className={cn(
				"flex gap-2.5 rounded-lg border p-3 transition-colors",
				open
					? "border-primary/40 bg-primary-soft/40"
					: selected
						? "border-border-strong bg-muted/60"
						: "border-border bg-surface-raised hover:border-border-strong",
			)}
		>
			{selectable ? (
				<Checkbox
					className="mt-1.5"
					checked={selected}
					onCheckedChange={(v) => onSelect(v === true)}
					aria-label={`Select ${authorName(item.author)}'s ${KIND_LABEL[item.kind].toLowerCase()}`}
				/>
			) : null}
			<div className="grid min-w-0 flex-1 gap-1.5">
				<button
					type="button"
					data-inbox-row
					onClick={onOpen}
					aria-current={open ? "true" : undefined}
					aria-keyshortcuts={shortcuts}
					className="flex min-w-0 cursor-pointer gap-2.5 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4"
				>
					<AuthorAvatar item={item} />
					<span className="grid min-w-0 flex-1 gap-1">
						<span className="flex min-w-0 items-center gap-1.5">
							{unread ? (
								<span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
							) : null}
							<span className={cn("truncate text-sm", unread ? "font-semibold" : "font-medium")}>
								{authorName(item.author)}
							</span>
							<time
								dateTime={item.postedAt}
								title={formatDateTime(item.postedAt)}
								className="ml-auto shrink-0 text-subtle-foreground text-xs"
							>
								{formatRelative(item.postedAt)}
							</time>
						</span>
						<span
							className={cn(
								"line-clamp-2 text-sm leading-snug",
								unread ? "text-foreground" : "text-muted-foreground",
							)}
						>
							{snippet}
						</span>
						{unread ? <span className="sr-only">Unread.</span> : null}
					</span>
				</button>
				{/* Outside the button so the relevance tooltip can be focused on its own. */}
				<div className="flex min-w-0 flex-wrap items-center gap-1 pl-9.5">
					<span className="mr-auto truncate text-subtle-foreground text-xs">
						{KIND_LABEL[item.kind]} · {item.community ?? item.channel.name}
					</span>
					<ReplyIndicator reply={item.latestReply} />
					<SentimentBadge sentiment={item.sentiment} />
					<RelevanceChip relevance={item.relevance} reason={item.relevanceReason} />
				</div>
			</div>
		</li>
	);
}
