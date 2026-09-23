"use client";

import { cn } from "@socialfly/ui/utils";
import {
	Building2,
	Gauge,
	Layers,
	type LucideIcon,
	ScrollText,
	Send,
	Sparkles,
	Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { StaffBadge } from "../common";
import { Logo } from "./logo";
import { UserMenu } from "./user-menu";

type NavItem = { href: string; label: string; icon: LucideIcon };

const ITEMS: NavItem[] = [
	{ href: "/", label: "Overview", icon: Gauge },
	{ href: "/organizations", label: "Organizations", icon: Building2 },
	{ href: "/users", label: "Users", icon: Users },
	{ href: "/publishing", label: "Publishing", icon: Send },
	{ href: "/ai", label: "AI usage", icon: Sparkles },
	{ href: "/queues", label: "Queues", icon: Layers },
	{ href: "/audit", label: "Audit log", icon: ScrollText },
];

function NavLink({ item }: { item: NavItem }) {
	const pathname = usePathname();
	const active =
		pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
	const Icon = item.icon;
	return (
		<Link
			href={item.href}
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
					active ? "text-violet" : "text-subtle-foreground group-hover:text-foreground",
				)}
				aria-hidden="true"
			/>
			<span className="flex-1 truncate">{item.label}</span>
		</Link>
	);
}

export function Sidebar() {
	return (
		<nav aria-label="Admin" className="flex h-full flex-col gap-3 p-3">
			<div className="grid gap-2 border-border border-b px-1 pt-1 pb-3">
				<Logo />
				<StaffBadge className="justify-self-start" />
			</div>
			<div className="scrollbar-thin -mx-1 grid flex-1 content-start gap-0.5 overflow-y-auto px-1">
				{ITEMS.map((item) => (
					<NavLink key={item.href} item={item} />
				))}
			</div>
			<div className="border-border border-t pt-2">
				<UserMenu />
			</div>
		</nav>
	);
}
