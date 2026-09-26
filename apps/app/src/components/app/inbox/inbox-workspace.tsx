"use client";

import { Button } from "@socialfly/ui/components/button";
import { cn } from "@socialfly/ui/utils";
import { ArrowLeft, MessagesSquare } from "lucide-react";
import { useState } from "react";
import { useInboxItems } from "@/hooks/use-inbox";
import type { InboxItemsQuery, InboxKind, InboxSentiment } from "@/lib/api-types";
import { Conversation } from "./conversation";
import type { InboxFilterState } from "./inbox-filters";
import { InboxList } from "./inbox-list";
import { CONVERSATION_KINDS, Kbd, KIND_LABEL, type ListView, SENTIMENT } from "./inbox-shared";

const csv = (value: string | null) => (value ? value.split(",").filter(Boolean) : []);

function readFilters(params: URLSearchParams, view: ListView): InboxFilterState {
	const kinds = csv(params.get("kinds")).filter(
		(k): k is InboxKind => k in KIND_LABEL && k !== "discussion",
	);
	const sentiment = params.get("sentiment");
	const min = Number(params.get("min"));
	return {
		channelIds: csv(params.get("ch")),
		kinds: view === "discussions" ? [] : kinds,
		sentiment: sentiment && sentiment in SENTIMENT ? (sentiment as InboxSentiment) : null,
		minRelevance: Number.isFinite(min) && min > 0 && min <= 100 ? Math.round(min) : 0,
		q: params.get("q") ?? "",
		sort: params.get("sort") === "relevance" ? "relevance" : "newest",
	};
}

function toQuery(view: ListView, f: InboxFilterState): Omit<InboxItemsQuery, "before" | "limit"> {
	const status =
		view === "open" || view === "discussions" ? "open" : (view as "replied" | "archived" | "spam");
	const kinds =
		view === "discussions"
			? ["discussion"]
			: f.kinds.length
				? f.kinds
				: // Open shows what was said to us; discussions have their own tab.
					view === "open"
					? CONVERSATION_KINDS
					: [];
	return {
		status,
		channelIds: f.channelIds.length ? f.channelIds.join(",") : undefined,
		kinds: kinds.length ? kinds.join(",") : undefined,
		sentiment: f.sentiment ?? undefined,
		minRelevance: f.minRelevance ? String(f.minRelevance) : undefined,
		q: f.q.trim() || undefined,
		sort: f.sort,
	};
}

/** Filters live in the URL; the rail edits them and the list reads them. */
export function useInboxFilters(
	view: ListView,
	params: URLSearchParams,
	update: (changes: Record<string, string | null>) => void,
) {
	const filters = readFilters(params, view);
	const activeCount =
		filters.channelIds.length +
		filters.kinds.length +
		(filters.sentiment ? 1 : 0) +
		(filters.minRelevance ? 1 : 0) +
		(filters.q ? 1 : 0);

	const setFilters = (next: Partial<InboxFilterState>) => {
		const f = { ...filters, ...next };
		update({
			ch: f.channelIds.length ? f.channelIds.join(",") : null,
			kinds: f.kinds.length ? f.kinds.join(",") : null,
			sentiment: f.sentiment,
			min: f.minRelevance ? String(f.minRelevance) : null,
			q: f.q.trim() ? f.q : null,
			sort: f.sort === "relevance" ? "relevance" : null,
		});
	};
	return { filters, setFilters, activeCount };
}

/**
 * List | conversation in one bordered frame. On wide screens both panes scroll on their own
 * and the reply box stays pinned; on narrow screens only one pane shows at a time.
 */
export function InboxWorkspace({
	view,
	params,
	update,
	filters,
	setFilters,
	activeCount,
}: {
	view: ListView;
	params: URLSearchParams;
	update: (changes: Record<string, string | null>) => void;
} & ReturnType<typeof useInboxFilters>) {
	const items = useInboxItems(toQuery(view, filters));
	const openId = params.get("item");
	/** "r" on a row: open it and put the cursor in the reply box (a counter so repeats refocus). */
	const [replyTarget, setReplyTarget] = useState<{ id: string; n: number } | null>(null);

	return (
		<div className="grid overflow-hidden rounded-3xl border border-border bg-surface-raised lg:h-[calc(100dvh-16rem)] lg:min-h-[34rem] xl:h-[calc(100dvh-12.5rem)] lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]">
			<div
				className={cn("min-h-0 lg:border-border lg:border-r", openId ? "hidden lg:flex" : "flex")}
			>
				<InboxList
					view={view}
					items={items}
					openId={openId}
					filtered={activeCount > 0}
					search={filters.q}
					onSearch={(q) => setFilters({ q })}
					onOpen={(id) => {
						setReplyTarget(null);
						update({ item: id });
					}}
					onReply={(id) => {
						setReplyTarget((t) => ({ id, n: (t?.n ?? 0) + 1 }));
						update({ item: id });
					}}
				/>
			</div>

			<section
				aria-label="Conversation"
				className={cn(
					"min-h-0 min-w-0 flex-col bg-surface-raised",
					openId ? "flex" : "hidden lg:flex",
				)}
			>
				{openId ? (
					<>
						<div className="border-border border-b px-3 py-2 lg:hidden">
							<Button variant="ghost" size="sm" onClick={() => update({ item: null })}>
								<ArrowLeft />
								Back to list
							</Button>
						</div>
						<Conversation
							key={openId}
							id={openId}
							focusComposer={replyTarget?.id === openId ? replyTarget.n : 0}
							onClose={() => update({ item: null })}
						/>
					</>
				) : (
					<NoConversation />
				)}
			</section>
		</div>
	);
}

function NoConversation() {
	return (
		<div className="relative flex flex-1 flex-col items-center justify-center gap-4 overflow-hidden bg-surface px-6 py-16 text-center">
			<MessagesSquare className="relative size-5 text-subtle-foreground" aria-hidden="true" />
			<div className="relative grid max-w-xs gap-1">
				<p className="font-medium text-[15px]">Select a conversation</p>
				<p className="text-muted-foreground text-sm">
					Read the thread, see why it was flagged and reply.
				</p>
			</div>
			<dl className="relative mt-2 grid grid-cols-[auto_auto] items-center gap-x-3 gap-y-2 rounded-xl bg-surface-raised px-4 py-3 text-left text-muted-foreground text-xs">
				<dt className="flex gap-1">
					<Kbd>j</Kbd>
					<Kbd>k</Kbd>
				</dt>
				<dd>Move up and down</dd>
				<dt>
					<Kbd>Enter</Kbd>
				</dt>
				<dd>Open conversation</dd>
				<dt>
					<Kbd>r</Kbd>
				</dt>
				<dd>Reply</dd>
				<dt>
					<Kbd>e</Kbd>
				</dt>
				<dd>Archive</dd>
				<dt>
					<Kbd>x</Kbd>
				</dt>
				<dd>Select</dd>
			</dl>
		</div>
	);
}
