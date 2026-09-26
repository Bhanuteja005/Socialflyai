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
import { ChevronRight, Moon, ShieldAlert, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
import { StaffBadge } from "../common";
import { Logo } from "./logo";
import { isActive, NAV, Sidebar } from "./sidebar";

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

function Topbar({ onSearch }: { onSearch: () => void }) {
	const pathname = usePathname();
	const section = NAV.flatMap((g) => g.items).find((i) => isActive(pathname, i.href));
	const Icon = section?.icon;
	return (
		<>
			<nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
				<span className="truncate text-muted-foreground">Staff console</span>
				{section ? (
					<>
						<ChevronRight className="size-3.5 shrink-0 text-subtle-foreground" aria-hidden="true" />
						<Link
							href={section.href}
							className="flex items-center gap-1.5 truncate font-medium hover:underline"
						>
							{Icon ? <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" /> : null}
							{section.label}
						</Link>
					</>
				) : null}
			</nav>
			<div className="ml-auto flex flex-1 items-center justify-end gap-1.5">
				<SearchTrigger onClick={onSearch} label="Jump to" />
				<ThemeToggle />
				<StaffBadge className="ml-1" />
			</div>
		</>
	);
}

/**
 * Same frame as the product app, but visibly different: violet staff markers and a strip
 * on every page, so nobody mistakes the cross-tenant console for a customer's workspace.
 */
export function AdminShell({ children }: { children: ReactNode }) {
	const pathname = usePathname();
	const router = useRouter();
	const [palette, setPalette] = useState(false);
	useCommandShortcut(setPalette);
	const commands = useMemo<CommandItem[]>(
		() =>
			NAV.flatMap((g) =>
				g.items.map((i) => ({
					id: i.href,
					group: "Go to",
					label: i.label,
					icon: i.icon,
					hint: g.title,
					keywords: i.keywords,
					onSelect: () => router.push(i.href),
				})),
			),
		[router],
	);

	return (
		<>
			<AppFrame
				pathname={pathname}
				sidebar={({ collapsed }) => <Sidebar collapsed={collapsed} />}
				topbar={<Topbar onSearch={() => setPalette(true)} />}
				mobileBrand={
					<>
						<Logo />
						<StaffBadge className="ml-auto" />
					</>
				}
				banner={
					<div className="relative flex items-center gap-2 border-violet/15 border-b bg-violet-soft px-4 py-1.5 text-violet text-xs lg:rounded-t-3xl">
						<ShieldAlert className="size-3.5 shrink-0" aria-hidden="true" />
						<p>
							<span className="font-medium">Internal staff console.</span> You are viewing data
							across every customer. Changes take effect immediately and are audited.
						</p>
					</div>
				}
			>
				{children}
			</AppFrame>
			<CommandPalette open={palette} onOpenChange={setPalette} items={commands} />
		</>
	);
}
