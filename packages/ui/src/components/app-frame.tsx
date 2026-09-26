"use client";

import { Menu, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { type ReactNode, useEffect, useState } from "react";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { Tooltip } from "./controls";

const COLLAPSE_KEY = "sf.sidebar.collapsed";

/**
 * The signed-in layout both frontends share: the sidebar sits on the canvas colour and the
 * page lives in an inset, rounded panel with its own top bar. Below `lg` the sidebar becomes
 * a drawer behind a hamburger. `sidebar` is a render prop so the drawer can close itself on
 * navigation and the rail can render icon-only when collapsed.
 */
export function AppFrame({
	sidebar,
	topbar,
	mobileBrand,
	banner,
	pathname,
	children,
	contentClassName,
}: {
	sidebar: (opts: { collapsed: boolean; onNavigate?: () => void }) => ReactNode;
	topbar?: ReactNode;
	mobileBrand: ReactNode;
	/** Full-width strip above the top bar inside the panel (e.g. the staff warning). */
	banner?: ReactNode;
	pathname: string;
	children: ReactNode;
	contentClassName?: string;
}) {
	const [drawer, setDrawer] = useState(false);
	const [collapsed, setCollapsed] = useState(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: close the drawer on every navigation
	useEffect(() => setDrawer(false), [pathname]);
	useEffect(() => {
		try {
			setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
		} catch {
			// Storage blocked: stay expanded.
		}
	}, []);
	const toggle = () =>
		setCollapsed((c) => {
			try {
				localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
			} catch {
				// Not persisted; the toggle still works for this visit.
			}
			return !c;
		});

	return (
		<div className="min-h-dvh bg-canvas">
			<a
				href="#main"
				className="sr-only z-50 rounded-full bg-ink px-3 py-2 text-ink-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
			>
				Skip to content
			</a>

			<aside
				className={cn(
					"fixed inset-y-0 left-0 z-30 hidden transition-[width] duration-200 lg:block",
					collapsed ? "w-[68px]" : "w-64",
				)}
			>
				{sidebar({ collapsed })}
			</aside>

			{/* Mobile top bar */}
			<header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-border border-b bg-canvas/90 px-3 backdrop-blur lg:hidden">
				<DialogPrimitive.Root open={drawer} onOpenChange={setDrawer}>
					<DialogPrimitive.Trigger asChild>
						<Button variant="ghost" size="icon-sm" aria-label="Open navigation">
							<Menu />
						</Button>
					</DialogPrimitive.Trigger>
					<DialogPrimitive.Portal>
						<DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-overlay data-[state=open]:animate-fade-in" />
						<DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 w-[min(18rem,85vw)] bg-canvas shadow-lg data-[state=open]:animate-slide-up">
							<DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
							<DialogPrimitive.Description className="sr-only">
								Move between sections
							</DialogPrimitive.Description>
							<DialogPrimitive.Close asChild>
								{/* Outside the panel's edge so it never covers the org switcher. */}
								<Button
									variant="outline"
									size="icon-sm"
									className="absolute top-3 -right-11 z-10"
									aria-label="Close navigation"
								>
									<X />
								</Button>
							</DialogPrimitive.Close>
							{sidebar({ collapsed: false, onNavigate: () => setDrawer(false) })}
						</DialogPrimitive.Content>
					</DialogPrimitive.Portal>
				</DialogPrimitive.Root>
				{mobileBrand}
			</header>

			<div
				className={cn(
					"transition-[padding] duration-200 lg:py-2 lg:pr-2",
					collapsed ? "lg:pl-[68px]" : "lg:pl-64",
				)}
			>
				{/* relative + clip: sr-only text inside scrolling children must not grow the page (clip,
				    unlike hidden, keeps the sticky top bar working). */}
				<div className="relative flex min-h-[calc(100dvh-3.5rem)] flex-col overflow-clip bg-surface-raised lg:min-h-[calc(100dvh-1rem)] lg:rounded-3xl lg:border lg:border-border">
					{/* Soft green light behind the top of the page (docs/design.md §4); decorative only. */}
					<div
						aria-hidden="true"
						className="pointer-events-none absolute inset-x-0 top-0 h-[440px]"
					>
						<div className="bg-glow absolute inset-0" />
					</div>
					{banner}
					{topbar ? (
						<div className="sticky top-0 z-10 hidden h-14 shrink-0 items-center gap-2 border-border border-b bg-surface-raised/80 px-4 backdrop-blur-[14px] lg:flex lg:rounded-t-3xl">
							<Tooltip content={collapsed ? "Expand sidebar" : "Collapse sidebar"} side="bottom">
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={toggle}
									aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
									aria-pressed={collapsed}
								>
									{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
								</Button>
							</Tooltip>
							<span className="h-5 w-px bg-border" aria-hidden="true" />
							{topbar}
						</div>
					) : null}
					<main id="main" className="relative flex-1">
						<div
							className={cn(
								"mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8",
								contentClassName,
							)}
						>
							{children}
						</div>
					</main>
				</div>
			</div>
		</div>
	);
}

/** The "Search… Ctrl K" pill in the top bar that opens the command palette. */
export function SearchTrigger({
	onClick,
	label = "Search",
}: {
	onClick: () => void;
	label?: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="flex h-8 w-full max-w-72 cursor-pointer items-center gap-2 rounded-full border border-border bg-surface-raised px-3 text-muted-foreground text-sm transition-colors hover:border-border-strong hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
		>
			<Search className="size-3.5 shrink-0" aria-hidden="true" />
			<span className="flex-1 truncate text-left text-[13px]">{label}…</span>
			<kbd className="hidden rounded-md border border-border px-1.5 font-mono text-[10px] sm:inline">
				Ctrl K
			</kbd>
		</button>
	);
}

/** Sidebar group heading; hidden (but kept for screen readers) when the rail is collapsed. */
export function NavGroupLabel({
	children,
	collapsed,
}: {
	children: ReactNode;
	collapsed?: boolean;
}) {
	if (collapsed) return <div className="mx-3 my-2 h-px bg-border" aria-hidden="true" />;
	return (
		<p className="px-2.5 pt-5 pb-1.5 font-mono text-[11px] text-subtle-foreground">{children}</p>
	);
}

/** One sidebar link: current page is a white pill with a hairline ring. */
export function navItemClass({ active, collapsed }: { active: boolean; collapsed?: boolean }) {
	return cn(
		"group relative flex h-8 items-center gap-2.5 rounded-[10px] font-medium text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-ring",
		collapsed ? "w-10 justify-center self-center px-0" : "px-2.5",
		active
			? "bg-surface-raised text-foreground ring-1 ring-border"
			: "text-muted-foreground hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.05]",
	);
}
