"use client";

import { Button } from "@socialfly/ui/components/button";
import { EmptyState } from "@socialfly/ui/components/feedback";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@socialfly/ui/components/tabs";
import { cn } from "@socialfly/ui/utils";
import {
	Archive,
	ClipboardCheck,
	Ear,
	Inbox,
	MessagesSquare,
	Radio,
	RefreshCw,
	Reply,
	Settings2,
	ShieldAlert,
	SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useState } from "react";
import { useChannels } from "@/hooks/queries";
import { useInboxCounts, useSyncInbox } from "@/hooks/use-inbox";
import { useOrg } from "../org-provider";
import { PageHeader } from "../page-header";
import { ListSkeleton, LoadError } from "../research/research-shared";
import { ApprovalsView } from "./approvals-view";
import { InboxFilters } from "./inbox-filters";
import { InboxSettingsPanel } from "./inbox-settings";
import { isListView, VIEW_LABEL, VIEWS, type InboxView as View } from "./inbox-shared";
import { InboxWorkspace, useInboxFilters } from "./inbox-workspace";
import { ListeningPanel } from "./listening-panel";

const ICONS: Record<View, typeof Inbox> = {
	open: Inbox,
	approvals: ClipboardCheck,
	discussions: MessagesSquare,
	replied: Reply,
	archived: Archive,
	spam: ShieldAlert,
	listening: Ear,
	settings: Settings2,
};

function CountBadge({ count, label }: { count: number | undefined; label: string }) {
	if (!count) return null;
	return (
		<span className="font-mono text-[11px] tabular-nums opacity-70">
			{count > 99 ? "99+" : count}
			<span className="sr-only"> {label}</span>
		</span>
	);
}

export function InboxView() {
	const { can } = useOrg();
	const params = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();
	const channels = useChannels();
	const counts = useInboxCounts();
	const sync = useSyncInbox();
	const admin = can("admin");

	const visible = VIEWS.filter((v) => (v === "approvals" || v === "settings" ? admin : true));
	const raw = params.get("view");
	const view: View = visible.includes(raw as View) ? (raw as View) : "open";

	/** Views, filters and the open conversation live in the URL so they survive reloads and can be shared. */
	const update = (changes: Record<string, string | null>) => {
		const next = new URLSearchParams(params);
		for (const [k, v] of Object.entries(changes)) {
			if (v === null) next.delete(k);
			else next.set(k, v);
		}
		router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
	};
	const list = isListView(view) ? view : null;
	const filterState = useInboxFilters(list ?? "open", params, update);
	const [showFilters, setShowFilters] = useState(false);

	const header = (
		<PageHeader
			title="Inbox"
			description="Comments and mentions from every channel."
			actions={
				can("editor") && channels.data?.length ? (
					<Button
						variant="outline"
						size="sm"
						loading={sync.isPending}
						onClick={() => sync.mutate()}
					>
						{sync.isPending ? null : <RefreshCw />}
						Sync now
					</Button>
				) : null
			}
		/>
	);

	if (channels.isPending) {
		return (
			<>
				{header}
				<ListSkeleton rows={6} />
			</>
		);
	}
	if (channels.isError) {
		return (
			<>
				{header}
				<LoadError
					title="Couldn't load your channels"
					error={channels.error}
					onRetry={() => void channels.refetch()}
				/>
			</>
		);
	}
	if (channels.data.length === 0) {
		return (
			<>
				{header}
				<EmptyState
					icon={Radio}
					title="Connect a channel to start your inbox"
					description="Comments and mentions from your channels collect here."
					action={
						<Button asChild>
							<Link href="/channels">Connect a channel</Link>
						</Button>
					}
				/>
			</>
		);
	}

	const badge = (v: View) =>
		v === "open" ? (
			<CountBadge count={counts.data?.new} label="new" />
		) : v === "approvals" ? (
			<CountBadge count={counts.data?.needsApproval} label="waiting" />
		) : null;

	return (
		<>
			{header}
			<Tabs
				value={view}
				// The open conversation and selection belong to the view they were opened in.
				onValueChange={(v) => update({ view: v === "open" ? null : v, item: null })}
			>
				<div className="grid gap-4 xl:grid-cols-[12.5rem_minmax(0,1fr)] xl:gap-6">
					<aside
						className="scrollbar-thin grid min-w-0 content-start gap-3 xl:-mx-1 xl:max-h-[calc(100dvh-12.5rem)] xl:min-h-[34rem] xl:gap-7 xl:overflow-y-auto xl:px-1 xl:pb-2"
						aria-label="Inbox views and filters"
					>
						<div className="flex min-w-0 items-center gap-2">
							<TabsList
								aria-label="Inbox views"
								className="min-w-0 xl:flex xl:w-full xl:flex-col xl:items-stretch xl:gap-0.5 xl:overflow-visible xl:rounded-none xl:border-0 xl:bg-transparent xl:p-0"
							>
								{visible.map((v) => {
									const Icon = ICONS[v];
									return (
										<Fragment key={v}>
											{v === "listening" ? (
												<div
													aria-hidden="true"
													className="mx-2.5 my-2 hidden h-px bg-border xl:block"
												/>
											) : null}
											<TabsTrigger
												value={v}
												className="xl:h-8 xl:justify-start xl:gap-2.5 xl:px-3 xl:hover:bg-muted/70 xl:data-[state=active]:hover:bg-ink xl:[&_svg]:size-4"
											>
												<Icon />
												{VIEW_LABEL[v]}
												<span className="xl:ml-auto">{badge(v)}</span>
											</TabsTrigger>
										</Fragment>
									);
								})}
							</TabsList>
							{list ? (
								<Button
									variant="outline"
									size="sm"
									className="shrink-0 xl:hidden"
									aria-expanded={showFilters}
									aria-controls="inbox-filters"
									onClick={() => setShowFilters((s) => !s)}
								>
									<SlidersHorizontal />
									<span className="max-sm:sr-only">Filters</span>
									{filterState.activeCount ? (
										<span className="font-mono text-[11px] tabular-nums opacity-70">
											{filterState.activeCount}
										</span>
									) : null}
								</Button>
							) : null}
						</div>
						{list ? (
							<div
								id="inbox-filters"
								className={cn(
									"rounded-2xl border border-border bg-surface-raised p-4 xl:block xl:rounded-none xl:border-0 xl:bg-transparent xl:p-0",
									!showFilters && "hidden",
									params.get("item") && "max-lg:hidden",
								)}
							>
								<InboxFilters
									view={list}
									channels={channels.data}
									value={filterState.filters}
									onChange={filterState.setFilters}
									activeCount={filterState.activeCount}
								/>
							</div>
						) : null}
					</aside>

					<div className="min-w-0">
						{visible.map((v) => (
							<TabsContent key={v} value={v}>
								{v === view ? (
									list ? (
										<InboxWorkspace view={list} params={params} update={update} {...filterState} />
									) : v === "approvals" ? (
										<ApprovalsView onOpenItem={(id) => update({ view: null, item: id })} />
									) : v === "listening" ? (
										<ListeningPanel onShowDiscussions={() => update({ view: "discussions" })} />
									) : (
										<InboxSettingsPanel />
									)
								) : null}
							</TabsContent>
						))}
					</div>
				</div>
			</Tabs>
		</>
	);
}
