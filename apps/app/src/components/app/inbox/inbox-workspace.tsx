"use client";

import { Button } from "@socialfly/ui/components/button";
import { cn } from "@socialfly/ui/utils";
import { ArrowLeft, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { useChannels } from "@/hooks/queries";
import { useInboxItems } from "@/hooks/use-inbox";
import type { InboxItemsQuery, InboxKind, InboxSentiment } from "@/lib/api-types";
import { Conversation } from "./conversation";
import { type InboxFilterState, InboxFilters } from "./inbox-filters";
import { InboxList } from "./inbox-list";
import { CONVERSATION_KINDS, KIND_LABEL, type ListView, SENTIMENT } from "./inbox-shared";

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

/** Filters | list | conversation. On narrow screens: one pane at a time. */
export function InboxWorkspace({
	view,
	params,
	update,
}: {
	view: ListView;
	params: URLSearchParams;
	update: (changes: Record<string, string | null>) => void;
}) {
	const channels = useChannels();
	const filters = readFilters(params, view);
	const query = toQuery(view, filters);
	const items = useInboxItems(query);
	const openId = params.get("item");
	const [showFilters, setShowFilters] = useState(false);
	/** "r" on a row: open it and put the cursor in the reply box (a counter so repeats refocus). */
	const [replyTarget, setReplyTarget] = useState<{ id: string; n: number } | null>(null);

	const activeFilters =
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

	return (
		<div className="grid gap-4 lg:grid-cols-[12.5rem_minmax(0,21rem)_minmax(0,1fr)] lg:items-start">
			<div className={cn(openId && "hidden lg:block")}>
				<Button
					variant="outline"
					size="sm"
					className="mb-3 lg:hidden"
					aria-expanded={showFilters}
					aria-controls="inbox-filters"
					onClick={() => setShowFilters((s) => !s)}
				>
					<SlidersHorizontal />
					Filters
					{activeFilters ? ` (${activeFilters})` : ""}
				</Button>
				<div id="inbox-filters" className={cn(!showFilters && "hidden lg:block")}>
					<InboxFilters
						view={view}
						channels={channels.data ?? []}
						value={filters}
						onChange={setFilters}
						activeCount={activeFilters}
					/>
				</div>
			</div>

			<div className={cn(openId && "hidden lg:block")}>
				<InboxList
					view={view}
					items={items}
					openId={openId}
					filtered={activeFilters > 0}
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
					"min-w-0 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto",
					!openId && "hidden lg:block",
				)}
			>
				{openId ? (
					<>
						<Button
							variant="ghost"
							size="sm"
							className="mb-2 lg:hidden"
							onClick={() => update({ item: null })}
						>
							<ArrowLeft />
							Back to list
						</Button>
						<Conversation
							key={openId}
							id={openId}
							focusComposer={replyTarget?.id === openId ? replyTarget.n : 0}
							onClose={() => update({ item: null })}
						/>
					</>
				) : (
					<div className="hidden rounded-lg border border-border border-dashed px-6 py-16 text-center text-muted-foreground text-sm lg:block">
						Select a conversation to read and reply.
						<p className="mt-2 text-xs">
							Tip: <kbd className="font-mono">j</kbd>/<kbd className="font-mono">k</kbd> to move,{" "}
							<kbd className="font-mono">Enter</kbd> to open.
						</p>
					</div>
				)}
			</section>
		</div>
	);
}
