"use client";

import { AppFrame, SearchTrigger } from "@socialfly/ui/components/app-frame";
import { Button } from "@socialfly/ui/components/button";
import {
	type CommandItem,
	CommandPalette,
	useCommandShortcut,
} from "@socialfly/ui/components/command-palette";
import { Tooltip } from "@socialfly/ui/components/controls";
import { useTheme } from "@socialfly/ui/theme-provider";
import {
	Building2,
	ChevronRight,
	LifeBuoy,
	MessageSquareQuote,
	Moon,
	PenSquare,
	Plus,
	Sun,
	UserRound,
	Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
import { useOrg } from "../org-provider";
import { NAV, sectionFor } from "./nav";
import { Sidebar } from "./sidebar";

export function Logo({ className }: { className?: string }) {
	return (
		<Link href="/dashboard" className={className} aria-label="SocialFly home">
			<span className="flex items-center gap-2 font-medium text-[15px]">
				<Image
					src="/assets/socialflyai_logo/socialflyailogo.png"
					alt=""
					width={22}
					height={22}
					className="rounded-[6px]"
				/>
				SocialFly
			</span>
		</Link>
	);
}

function ThemeToggle() {
	const { resolvedTheme, setTheme } = useTheme();
	const dark = resolvedTheme === "dark";
	return (
		<Tooltip content={dark ? "Light mode" : "Dark mode"} side="bottom">
			<Button
				variant="ghost"
				size="icon-sm"
				onClick={() => setTheme(dark ? "light" : "dark")}
				aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
			>
				{dark ? <Sun /> : <Moon />}
			</Button>
		</Tooltip>
	);
}

function useCommands(): CommandItem[] {
	const router = useRouter();
	const { can } = useOrg();
	return useMemo(() => {
		const go = (href: string) => () => router.push(href);
		const actions: CommandItem[] = [];
		if (can("editor")) {
			actions.push({
				id: "new-post",
				group: "Actions",
				label: "Create a post",
				icon: PenSquare,
				keywords: "new compose write",
				onSelect: go("/compose"),
			});
		}
		if (can("admin")) {
			actions.push({
				id: "connect",
				group: "Actions",
				label: "Connect a channel",
				icon: Plus,
				keywords: "add account",
				onSelect: go("/channels#connect"),
			});
		}
		const pages: CommandItem[] = NAV.flatMap((g) =>
			g.items.map((i) => ({
				id: i.href,
				group: "Go to",
				label: i.label,
				icon: i.icon,
				hint: g.title,
				keywords: i.keywords,
				onSelect: go(i.href),
			})),
		);
		const settings: CommandItem[] = [
			{
				id: "s-org",
				label: "Organization",
				icon: Building2,
				keywords: "timezone name",
				href: "/settings/organization",
			},
			{
				id: "s-team",
				label: "Team",
				icon: Users,
				keywords: "members invite roles",
				href: "/settings/team",
			},
			{
				id: "s-brand",
				label: "Brand voice",
				icon: MessageSquareQuote,
				keywords: "tone ai",
				href: "/settings/brand",
			},
			{
				id: "s-account",
				label: "Account",
				icon: UserRound,
				keywords: "profile password sessions",
				href: "/settings/account",
			},
		].map(({ href, ...rest }) => ({ ...rest, group: "Settings", onSelect: go(href) }));
		return [...actions, ...pages, ...settings];
	}, [router, can]);
}

function Topbar({ onSearch }: { onSearch: () => void }) {
	const pathname = usePathname();
	const { org } = useOrg();
	const section = sectionFor(pathname);
	const Icon = section?.icon;
	return (
		<>
			<nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
				<span className="truncate text-muted-foreground">{org.name}</span>
				{section ? (
					<>
						<ChevronRight className="size-3.5 shrink-0 text-subtle-foreground" aria-hidden="true" />
						<Link
							href={section.href}
							className="flex items-center gap-1.5 truncate font-medium text-foreground hover:underline"
						>
							{Icon ? <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" /> : null}
							{section.label}
						</Link>
					</>
				) : null}
			</nav>
			<div className="ml-auto flex flex-1 items-center justify-end gap-1.5">
				<SearchTrigger onClick={onSearch} label="Search or jump to" />
				<Tooltip content="Help center" side="bottom">
					<Button variant="ghost" size="icon-sm" asChild>
						<a href="mailto:support@socialfly.ai" aria-label="Contact support">
							<LifeBuoy />
						</a>
					</Button>
				</Tooltip>
				<ThemeToggle />
			</div>
		</>
	);
}

/** Canvas + grouped sidebar + inset panel with a top bar and a ⌘K command palette. */
export function AppShell({ children }: { children: ReactNode }) {
	const pathname = usePathname();
	const [palette, setPalette] = useState(false);
	useCommandShortcut(setPalette);
	const commands = useCommands();

	return (
		<>
			<AppFrame
				pathname={pathname}
				sidebar={({ collapsed, onNavigate }) => (
					<Sidebar collapsed={collapsed} onNavigate={onNavigate} />
				)}
				topbar={<Topbar onSearch={() => setPalette(true)} />}
				mobileBrand={<Logo />}
			>
				{children}
			</AppFrame>
			<CommandPalette open={palette} onOpenChange={setPalette} items={commands} />
		</>
	);
}
