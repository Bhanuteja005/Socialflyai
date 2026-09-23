"use client";

import { Button } from "@socialfly/ui/components/button";
import { cn } from "@socialfly/ui/utils";
import {
	Building2,
	CalendarDays,
	Images,
	LayoutDashboard,
	type LucideIcon,
	Megaphone,
	PenSquare,
	Radio,
	Rows3,
	Sparkles,
	UserRound,
	Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useChannels } from "@/hooks/queries";
import { useOrg } from "../org-provider";
import { OrgSwitcher } from "./org-switcher";
import { UserMenu } from "./user-menu";

type NavItem = { href: string; label: string; icon: LucideIcon; badge?: number };

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
	const pathname = usePathname();
	const active =
		pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
	const Icon = item.icon;
	return (
		<Link
			href={item.href}
			onClick={onNavigate}
			aria-current={active ? "page" : undefined}
			className={cn(
				"group flex h-8 items-center gap-2.5 rounded-md px-2 font-medium text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring",
				active
					? "bg-muted text-foreground"
					: "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
			)}
		>
			<Icon
				className={cn(
					"size-4 shrink-0",
					active ? "text-primary-text" : "text-subtle-foreground group-hover:text-foreground",
				)}
				aria-hidden="true"
			/>
			<span className="flex-1 truncate">{item.label}</span>
			{item.badge ? (
				<span className="rounded-full bg-warning-soft px-1.5 font-semibold text-[10px] text-warning leading-4">
					{item.badge}
					<span className="sr-only"> need attention</span>
				</span>
			) : null}
		</Link>
	);
}

function NavSection({
	title,
	items,
	onNavigate,
}: {
	title?: string;
	items: NavItem[];
	onNavigate?: () => void;
}) {
	return (
		<div className="grid gap-0.5">
			{title ? (
				<p className="px-2 pt-4 pb-1 font-medium text-[11px] text-subtle-foreground uppercase tracking-wider">
					{title}
				</p>
			) : null}
			{items.map((item) => (
				<NavLink key={item.href} item={item} onNavigate={onNavigate} />
			))}
		</div>
	);
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
	const { can } = useOrg();
	const { data: channels } = useChannels();
	const needsReauth = channels?.filter((c) => c.status === "needs_reauth").length ?? 0;

	const main: NavItem[] = [
		{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
		{ href: "/calendar", label: "Calendar", icon: CalendarDays },
		{ href: "/posts", label: "Posts", icon: Rows3 },
		{ href: "/create", label: "Create", icon: Sparkles },
		{ href: "/media", label: "Media", icon: Images },
		{ href: "/channels", label: "Channels", icon: Radio, badge: needsReauth },
	];
	const settings: NavItem[] = [
		{ href: "/settings/organization", label: "Organization", icon: Building2 },
		{ href: "/settings/team", label: "Team", icon: Users },
		{ href: "/settings/brand", label: "Brand voice", icon: Megaphone },
		{ href: "/settings/account", label: "Account", icon: UserRound },
	];

	return (
		<nav aria-label="Main" className="flex h-full flex-col gap-3 p-3">
			<OrgSwitcher />
			{can("editor") ? (
				<Button asChild className="w-full justify-start" size="sm">
					<Link href="/compose" onClick={onNavigate}>
						<PenSquare />
						Create post
					</Link>
				</Button>
			) : null}
			<div className="scrollbar-thin -mx-1 flex-1 overflow-y-auto px-1">
				<NavSection items={main} onNavigate={onNavigate} />
				<NavSection title="Settings" items={settings} onNavigate={onNavigate} />
			</div>
			<div className="border-border border-t pt-2">
				<UserMenu />
			</div>
		</nav>
	);
}
