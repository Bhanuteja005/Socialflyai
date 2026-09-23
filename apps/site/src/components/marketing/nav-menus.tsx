"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { NavigationMenu as Nav } from "radix-ui";
import { focusRing } from "./primitives";
import { NAV_GROUPS, NAV_LINKS } from "./site-config";

const itemClass = `rounded-full px-3 py-2 text-sm text-white/70 transition-colors hover:text-white data-[state=open]:text-white ${focusRing}`;

/**
 * Desktop top-bar menus. Radix NavigationMenu gives the keyboard and screen-reader
 * behaviour (arrow keys, Escape, aria-expanded) that hand-rolled hover menus miss.
 */
export function NavMenus() {
	return (
		<Nav.Root className="relative hidden lg:block" aria-label="Main">
			<Nav.List className="flex items-center gap-1">
				{NAV_GROUPS.map((group) => (
					<Nav.Item key={group.label}>
						<Nav.Trigger className={`group inline-flex items-center gap-1 ${itemClass}`}>
							{group.label}
							<ChevronDown
								className="size-3.5 transition-transform group-data-[state=open]:rotate-180"
								aria-hidden="true"
							/>
						</Nav.Trigger>
						<Nav.Content className="absolute top-full left-1/2 mt-3 -translate-x-1/2">
							<div className="rounded-3xl border border-white/10 bg-black/95 p-3 shadow-2xl backdrop-blur-md">
								<ul
									className={`grid gap-1 ${group.links.length > 8 ? "w-[520px] grid-cols-2" : "w-64 grid-cols-1"}`}
								>
									{group.links.map((link) => (
										<li key={link.href}>
											<Nav.Link asChild>
												<Link
													href={link.href}
													className={`block rounded-2xl px-3 py-2 text-sm text-white/75 hover:bg-white/5 hover:text-white ${focusRing}`}
												>
													{link.label}
												</Link>
											</Nav.Link>
										</li>
									))}
								</ul>
								{group.href && (
									<Nav.Link asChild>
										<Link
											href={group.href}
											className={`mt-2 block rounded-2xl border-white/10 border-t px-3 pt-3 pb-1 font-medium text-primary text-sm ${focusRing}`}
										>
											See all {group.label.toLowerCase()} →
										</Link>
									</Nav.Link>
								)}
							</div>
						</Nav.Content>
					</Nav.Item>
				))}
				{NAV_LINKS.map((link) => (
					<Nav.Item key={link.href}>
						<Nav.Link asChild>
							<Link href={link.href} className={itemClass}>
								{link.label}
							</Link>
						</Nav.Link>
					</Nav.Item>
				))}
			</Nav.List>
		</Nav.Root>
	);
}
