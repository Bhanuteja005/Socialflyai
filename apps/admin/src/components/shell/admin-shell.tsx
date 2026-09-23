"use client";

import { Button } from "@socialfly/ui/components/button";
import { Menu, ShieldAlert, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { type ReactNode, useEffect, useState } from "react";
import { StaffBadge } from "../common";
import { Logo } from "./logo";
import { Sidebar } from "./sidebar";

/**
 * Sidebar layout like the product app, but visibly different: a violet staff strip on
 * every page, so nobody mistakes the cross-tenant console for a customer's workspace.
 */
export function AdminShell({ children }: { children: ReactNode }) {
	const [open, setOpen] = useState(false);
	const pathname = usePathname();

	// biome-ignore lint/correctness/useExhaustiveDependencies: close the drawer on every navigation
	useEffect(() => setOpen(false), [pathname]);

	return (
		<div className="min-h-dvh bg-surface">
			<a
				href="#main"
				className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
			>
				Skip to content
			</a>

			<aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-border border-r bg-background lg:block">
				<Sidebar />
			</aside>

			<header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-border border-b bg-background/85 px-3 backdrop-blur lg:hidden">
				<DialogPrimitive.Root open={open} onOpenChange={setOpen}>
					<DialogPrimitive.Trigger asChild>
						<Button variant="ghost" size="icon-sm" aria-label="Open navigation">
							<Menu />
						</Button>
					</DialogPrimitive.Trigger>
					<DialogPrimitive.Portal>
						<DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-overlay data-[state=open]:animate-fade-in" />
						<DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 w-[min(18rem,85vw)] border-border border-r bg-background shadow-lg data-[state=open]:animate-slide-up">
							<DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
							<DialogPrimitive.Description className="sr-only">
								Move between sections of the admin console
							</DialogPrimitive.Description>
							<DialogPrimitive.Close asChild>
								<Button
									variant="ghost"
									size="icon-xs"
									className="absolute top-4 right-3 z-10"
									aria-label="Close navigation"
								>
									<X />
								</Button>
							</DialogPrimitive.Close>
							<Sidebar />
						</DialogPrimitive.Content>
					</DialogPrimitive.Portal>
				</DialogPrimitive.Root>
				<Logo />
				<StaffBadge className="ml-auto" />
			</header>

			<main id="main" className="lg:pl-60">
				<div className="flex items-center gap-2 border-violet/20 border-b bg-violet-soft px-4 py-1.5 text-violet text-xs sm:px-6 lg:px-8">
					<ShieldAlert className="size-3.5 shrink-0" aria-hidden="true" />
					<p>
						<span className="font-semibold">Internal staff console.</span> You are viewing data
						across every customer. Changes take effect immediately and are audited.
					</p>
				</div>
				<div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
			</main>
		</div>
	);
}
