"use client";

import { NavGroupLabel, navItemClass } from "@socialfly/ui/components/app-frame";
import { Tooltip } from "@socialfly/ui/components/controls";
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
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserMenu } from "./user-menu";

export type NavItem = { href: string; label: string; icon: LucideIcon; keywords?: string };
export type NavGroup = { title?: string; items: NavItem[] };

export const NAV: NavGroup[] = [
	{ items: [{ href: "/", label: "Overview", icon: Gauge, keywords: "home metrics" }] },
	{
		title: "Customers",
		items: [
			{
				href: "/organizations",
				label: "Organizations",
				icon: Building2,
				keywords: "workspaces tenants",
			},
			{ href: "/users", label: "Users", icon: Users, keywords: "accounts people" },
		],
	},
	{
		title: "Platform",
		items: [
			{ href: "/publishing", label: "Publishing", icon: Send, keywords: "targets failed posts" },
			{ href: "/ai", label: "AI usage", icon: Sparkles, keywords: "spend generations budget" },
			{ href: "/queues", label: "Queues", icon: Layers, keywords: "jobs workers bullmq" },
		],
	},
	{
		title: "Security",
		items: [{ href: "/audit", label: "Audit log", icon: ScrollText, keywords: "events history" }],
	},
];

export const isActive = (pathname: string, href: string) =>
	pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

function NavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
	const pathname = usePathname();
	const active = isActive(pathname, item.href);
	const Icon = item.icon;
	const link = (
		<Link
			href={item.href}
			aria-current={active ? "page" : undefined}
			aria-label={collapsed ? item.label : undefined}
			className={navItemClass({ active, collapsed })}
		>
			<Icon
				className={cn(
					"size-4 shrink-0",
					active ? "text-violet" : "text-subtle-foreground group-hover:text-foreground",
				)}
				aria-hidden="true"
			/>
			{collapsed ? null : <span className="flex-1 truncate">{item.label}</span>}
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

export function Sidebar({ collapsed = false }: { collapsed?: boolean }) {
	return (
		<nav
			aria-label="Admin"
			className={cn("flex h-full flex-col gap-3 py-3", collapsed ? "px-2" : "px-3")}
		>
			<Link
				href="/"
				aria-label="SocialFly Admin overview"
				className={cn(
					"flex items-center gap-2.5 rounded-[10px] p-1.5 focus-visible:outline-2 focus-visible:outline-ring",
					collapsed && "justify-center self-center",
				)}
			>
				<Image
					src="/assets/socialflyai_logo/socialflyailogo.png"
					alt=""
					width={28}
					height={28}
					className="rounded-lg"
				/>
				{collapsed ? null : (
					<span className="grid leading-tight">
						<span className="font-medium text-sm">SocialFly</span>
						<span className="font-mono text-[11px] text-violet">staff console</span>
					</span>
				)}
			</Link>
			<div className="scrollbar-thin -mx-1 flex flex-1 flex-col overflow-y-auto px-1">
				{NAV.map((group, gi) => (
					<div key={group.title ?? gi} className="grid gap-0.5">
						{group.title ? (
							<NavGroupLabel collapsed={collapsed}>{group.title}</NavGroupLabel>
						) : null}
						{group.items.map((item) => (
							<NavLink key={item.href} item={item} collapsed={collapsed} />
						))}
					</div>
				))}
			</div>
			<UserMenu collapsed={collapsed} />
		</nav>
	);
}
