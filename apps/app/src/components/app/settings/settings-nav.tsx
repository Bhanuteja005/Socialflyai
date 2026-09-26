"use client";

import { cn } from "@socialfly/ui/utils";
import { Building2, type LucideIcon, MessageSquareQuote, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: { href: string; label: string; description: string; icon: LucideIcon }[] = [
	{
		href: "/settings/organization",
		label: "Organization",
		description: "Name, time zone",
		icon: Building2,
	},
	{ href: "/settings/team", label: "Team", description: "Members and invites", icon: Users },
	{
		href: "/settings/brand",
		label: "Brand voice",
		description: "How AI writes for you",
		icon: MessageSquareQuote,
	},
	{
		href: "/settings/account",
		label: "Account",
		description: "Profile, password, sessions",
		icon: UserRound,
	},
];

/** Vertical section list on desktop; a scrollable tab row on small screens. */
export function SettingsNav() {
	const pathname = usePathname();
	return (
		<nav
			aria-label="Settings"
			className="scrollbar-thin -mx-4 flex gap-1 overflow-x-auto border-border border-b px-4 md:mx-0 md:flex-col md:gap-0.5 md:overflow-visible md:border-0 md:px-0"
		>
			{LINKS.map((l) => {
				const active = pathname === l.href;
				const Icon = l.icon;
				return (
					<Link
						key={l.href}
						href={l.href}
						aria-current={active ? "page" : undefined}
						className={cn(
							"group flex shrink-0 items-center gap-2.5 whitespace-nowrap font-medium text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-ring",
							// Mobile: underline tabs. Desktop: pill list.
							"-mb-px border-b-2 px-2 py-2 md:mb-0 md:rounded-lg md:border-0 md:px-2.5",
							active
								? "border-ink text-foreground md:bg-surface-raised md:shadow-xs md:ring-1 md:ring-border"
								: "border-transparent text-muted-foreground hover:text-foreground md:hover:bg-muted/70",
						)}
					>
						<Icon
							className={cn(
								"hidden size-4 shrink-0 md:block",
								active ? "text-primary-text" : "text-subtle-foreground",
							)}
							aria-hidden="true"
						/>
						<span className="grid">
							{l.label}
							<span className="hidden font-normal text-subtle-foreground text-xs md:block">
								{l.description}
							</span>
						</span>
					</Link>
				);
			})}
		</nav>
	);
}
