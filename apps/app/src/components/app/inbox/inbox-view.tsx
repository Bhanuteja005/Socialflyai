"use client";

import { Button } from "@socialfly/ui/components/button";
import { EmptyState } from "@socialfly/ui/components/feedback";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@socialfly/ui/components/tabs";
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
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useChannels } from "@/hooks/queries";
import { useInboxCounts, useSyncInbox } from "@/hooks/use-inbox";
import { useOrg } from "../org-provider";
import { PageHeader } from "../page-header";
import { ListSkeleton, LoadError } from "../research/research-shared";
import { ApprovalsView } from "./approvals-view";
import { InboxSettingsPanel } from "./inbox-settings";
import { isListView, VIEW_LABEL, VIEWS, type InboxView as View } from "./inbox-shared";
import { InboxWorkspace } from "./inbox-workspace";
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
		<span className="rounded-full bg-primary-soft px-1.5 font-semibold text-[10px] text-primary-text tabular-nums leading-4">
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

	const header = (
		<PageHeader
			title="Inbox"
			description="Comments, mentions and conversations worth joining, across every channel."
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
					description="Comments on your posts and mentions of your accounts will collect here, so your team can answer them in one place."
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
				<TabsList className="mb-4" aria-label="Inbox views">
					{visible.map((v) => {
						const Icon = ICONS[v];
						return (
							<TabsTrigger key={v} value={v}>
								<Icon />
								{VIEW_LABEL[v]}
								{badge(v)}
							</TabsTrigger>
						);
					})}
				</TabsList>
				{visible.map((v) => (
					<TabsContent key={v} value={v}>
						{v === view ? (
							isListView(v) ? (
								<InboxWorkspace view={v} params={params} update={update} />
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
			</Tabs>
		</>
	);
}
