"use client";

import { NavGroupLabel, navItemClass } from "@socialfly/ui/components/app-frame";
import { Button } from "@socialfly/ui/components/button";
import { Tooltip } from "@socialfly/ui/components/controls";
import { cn } from "@socialfly/ui/utils";
import { PenSquare, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useChannels } from "@/hooks/queries";
import { useAiCapabilities } from "@/hooks/use-ai";
import { useInboxCounts } from "@/hooks/use-inbox";
import { formatUsd } from "@/lib/format";
import { useOrg } from "../org-provider";
import { ChannelAvatar } from "../status-badge";
import { isActive, NAV, type NavEntry, SETTINGS_NAV } from "./nav";
import { OrgSwitcher } from "./org-switcher";
import { UserMenu } from "./user-menu";

type Badge = { count: number; label: string; tone: "primary" | "warning" };

function NavLink({
	item,
	badge,
	collapsed,
	onNavigate,
}: {
	item: NavEntry;
	badge?: Badge;
	collapsed: boolean;
	onNavigate?: () => void;
}) {
	const pathname = usePathname();
	const active = isActive(pathname, item.href);
	const Icon = item.icon;
	const count = badge?.count ? (badge.count > 99 ? "99+" : badge.count) : null;
	const link = (
		<Link
			href={item.href}
			onClick={onNavigate}
			aria-current={active ? "page" : undefined}
			aria-label={collapsed ? item.label : undefined}
			className={navItemClass({ active, collapsed })}
		>
			<Icon
				className={cn(
					"size-4 shrink-0",
					active ? "text-primary-text" : "text-subtle-foreground group-hover:text-foreground",
				)}
				aria-hidden="true"
			/>
			{collapsed ? (
				count ? (
					<span
						className={cn(
							"absolute top-1 right-1 size-2 rounded-full ring-2 ring-canvas",
							badge?.tone === "warning" ? "bg-warning" : "bg-primary",
						)}
						aria-hidden="true"
					/>
				) : null
			) : (
				<>
					<span className="flex-1 truncate">{item.label}</span>
					{count ? (
						<span
							className={cn(
								"min-w-5 rounded-full px-1.5 text-center font-mono text-[10px] tabular-nums leading-[18px]",
								badge?.tone === "warning"
									? "bg-warning-soft text-warning"
									: "bg-primary text-primary-foreground",
							)}
						>
							{count}
							<span className="sr-only"> {badge?.label}</span>
						</span>
					) : null}
				</>
			)}
		</Link>
	);
	return collapsed ? (
		<Tooltip content={item.label} side="right">
			{link}
		</Tooltip>
	) : (
		link
	);
}

/** Connected accounts, so the sidebar doubles as a status glance. */
function ChannelList({ onNavigate }: { onNavigate?: () => void }) {
	const { can } = useOrg();
	const { data: channels } = useChannels();
	if (!channels) return null;
	const shown = channels.slice(0, 5);
	return (
		<div className="grid gap-0.5">
			<NavGroupLabel>Channels</NavGroupLabel>
			{shown.map((c) => (
				<Link
					key={c.id}
					href="/channels"
					onClick={onNavigate}
					className="flex h-8 items-center gap-2.5 rounded-[10px] px-2 text-[13px] text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring dark:hover:bg-white/[0.05]"
				>
					<ChannelAvatar channel={c} size="xs" />
					<span className="flex-1 truncate">{c.name}</span>
					{c.status === "needs_reauth" ? (
						<span className="size-1.5 rounded-full bg-warning">
							<span className="sr-only">Needs reconnect</span>
						</span>
					) : null}
				</Link>
			))}
			{channels.length > shown.length ? (
				<Link
					href="/channels"
					onClick={onNavigate}
					className="px-2.5 py-1 font-mono text-muted-foreground text-xs hover:text-foreground"
				>
					+{channels.length - shown.length} more
				</Link>
			) : null}
			{can("admin") ? (
				<Link
					href="/channels#connect"
					onClick={onNavigate}
					className="flex h-8 items-center gap-2.5 rounded-[10px] px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring dark:hover:bg-white/[0.05]"
				>
					<Plus className="size-4 text-subtle-foreground" aria-hidden="true" />
					Connect channel
				</Link>
			) : null}
		</div>
	);
}

function AiBudgetMeter() {
	const { data } = useAiCapabilities();
	const b = data?.budget;
	if (!b?.limitUsd) return null;
	const ratio = Math.min(1, b.usedUsd / b.limitUsd);
	return (
		<Link
			href="/create"
			className="mb-1 grid gap-2 rounded-2xl border border-border bg-surface-raised p-3 transition-colors hover:border-border-strong"
		>
			<span className="flex items-center justify-between text-xs">
				<span className="font-medium">AI credits</span>
				<span className="font-mono text-muted-foreground tabular-nums">
					{formatUsd(b.usedUsd)} / {formatUsd(b.limitUsd)}
				</span>
			</span>
			<span
				className="h-1 overflow-hidden rounded-full bg-muted"
				role="progressbar"
				aria-label="AI budget used this month"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={Math.round(ratio * 100)}
			>
				<span
					className={cn(
						"block h-full rounded-full",
						ratio >= 1 ? "bg-danger" : ratio > 0.8 ? "bg-warning" : "bg-primary",
					)}
					style={{ width: `${Math.max(ratio * 100, 2)}%` }}
				/>
			</span>
		</Link>
	);
}

export function Sidebar({
	collapsed = false,
	onNavigate,
}: {
	collapsed?: boolean;
	onNavigate?: () => void;
}) {
	const { can } = useOrg();
	const { data: channels } = useChannels();
	const { data: inboxCounts } = useInboxCounts();
	const needsReauth = channels?.filter((c) => c.status === "needs_reauth").length ?? 0;

	const badges: Record<string, Badge | undefined> = {
		"/inbox": inboxCounts?.new
			? { count: inboxCounts.new, label: "unread", tone: "primary" }
			: undefined,
		"/channels": needsReauth
			? { count: needsReauth, label: "need reconnecting", tone: "warning" }
			: undefined,
	};

	let createButton: ReactNode = null;
	if (can("editor")) {
		createButton = collapsed ? (
			<Tooltip content="New post" side="right">
				<Button asChild variant="brand" size="icon" className="self-center">
					<Link href="/compose" onClick={onNavigate} aria-label="New post">
						<PenSquare />
					</Link>
				</Button>
			</Tooltip>
		) : (
			<Button asChild variant="brand" className="w-full">
				<Link href="/compose" onClick={onNavigate}>
					<PenSquare />
					New post
				</Link>
			</Button>
		);
	}

	return (
		<nav
			aria-label="Main"
			className={cn("flex h-full flex-col gap-3 py-3", collapsed ? "px-2" : "px-3")}
		>
			<OrgSwitcher collapsed={collapsed} />
			{createButton}
			<div
				className={cn(
					"scrollbar-thin -mx-1 flex flex-1 flex-col overflow-y-auto px-1",
					collapsed && "items-stretch",
				)}
			>
				{NAV.map((group, gi) => (
					<div key={group.title ?? gi} className="grid gap-0.5">
						{group.title ? (
							<NavGroupLabel collapsed={collapsed}>{group.title}</NavGroupLabel>
						) : null}
						{group.items.map((item) => (
							<NavLink
								key={item.href}
								item={item}
								badge={badges[item.href]}
								collapsed={collapsed}
								onNavigate={onNavigate}
							/>
						))}
					</div>
				))}
				{collapsed ? null : <ChannelList onNavigate={onNavigate} />}
			</div>
			<div className="grid gap-0.5">
				{collapsed ? null : <AiBudgetMeter />}
				<NavLink item={SETTINGS_NAV} collapsed={collapsed} onNavigate={onNavigate} />
				<UserMenu collapsed={collapsed} />
			</div>
		</nav>
	);
}
