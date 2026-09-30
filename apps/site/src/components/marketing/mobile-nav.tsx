"use client";

import { ChevronDown, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { LOGIN_URL } from "@/components/marketing/app-links";
import { focusRing } from "./primitives";
import { NAV_GROUPS, NAV_LINKS, type NavLink } from "./site-config";

/** Hamburger menu shown below the `lg` breakpoint. */
export function MobileNav() {
	const [open, setOpen] = useState(false);
	const panelId = useId();
	const close = () => setOpen(false);

	useEffect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpen(false);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open]);

	return (
		<div className="lg:hidden">
			<button
				type="button"
				aria-expanded={open}
				aria-controls={panelId}
				aria-label={open ? "Close menu" : "Open menu"}
				onClick={() => setOpen((value) => !value)}
				className={`flex size-10 items-center justify-center rounded-full text-foreground hover:bg-muted hover:text-foreground ${focusRing}`}
			>
				{open ? (
					<X className="size-5" aria-hidden="true" />
				) : (
					<Menu className="size-5" aria-hidden="true" />
				)}
			</button>
			<div
				id={panelId}
				hidden={!open}
				className="absolute inset-x-0 top-[calc(100%+0.5rem)] max-h-[80dvh] overflow-y-auto rounded-3xl border border-border bg-surface-raised p-2 shadow-lg"
			>
				<ul className="flex flex-col">
					{NAV_GROUPS.map((group) => (
						<li key={group.label}>
							{/* Native disclosure: keyboard and screen-reader support for free. */}
							<details className="group">
								<summary
									className={`flex cursor-pointer list-none items-center justify-between rounded-xl px-4 py-3 text-base text-foreground hover:bg-muted hover:text-foreground ${focusRing}`}
								>
									{group.label}
									<ChevronDown
										className="size-4 transition-transform group-open:rotate-180"
										aria-hidden="true"
									/>
								</summary>
								{group.sections ? (
									<div className="flex flex-col gap-3 pt-1 pb-3 pl-3">
										{group.sections.map((section) => (
											<div key={section.title}>
												<p className="px-4 pb-1 font-medium text-subtle-foreground text-xs">
													{section.title}
												</p>
												<MobileLinks
													links={section.more ? [...section.links, section.more] : section.links}
													onNavigate={close}
												/>
											</div>
										))}
									</div>
								) : (
									<div className="pb-2 pl-3">
										<MobileLinks
											links={[
												...(group.href
													? [{ label: `All ${group.label.toLowerCase()}`, href: group.href }]
													: []),
												...group.links,
											]}
											onNavigate={close}
										/>
									</div>
								)}
							</details>
						</li>
					))}
					{NAV_LINKS.map((link) => (
						<li key={link.href}>
							<Link
								href={link.href}
								onClick={close}
								className={`block rounded-xl px-4 py-3 text-base text-foreground hover:bg-muted hover:text-foreground ${focusRing}`}
							>
								{link.label}
							</Link>
						</li>
					))}
					<li className="mt-2 border-border border-t pt-2">
						<Link
							href={LOGIN_URL}
							onClick={close}
							className={`block rounded-xl px-4 py-3 text-base text-foreground hover:bg-muted hover:text-foreground ${focusRing}`}
						>
							Log in
						</Link>
					</li>
				</ul>
			</div>
		</div>
	);
}

function MobileLinks({ links, onNavigate }: { links: NavLink[]; onNavigate: () => void }) {
	return (
		<ul>
			{links.map((link) => (
				<li key={link.href}>
					<Link
						href={link.href}
						onClick={onNavigate}
						className={`block rounded-xl px-4 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground ${focusRing}`}
					>
						{link.label}
					</Link>
				</li>
			))}
		</ul>
	);
}
