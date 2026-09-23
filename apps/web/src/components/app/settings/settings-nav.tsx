"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
	{ href: "/settings/organization", label: "Organization" },
	{ href: "/settings/team", label: "Team" },
	{ href: "/settings/account", label: "Account" },
];

export function SettingsNav() {
	const pathname = usePathname();
	return (
		<nav
			aria-label="Settings"
			className="scrollbar-thin mb-6 flex gap-1 overflow-x-auto border-border border-b"
		>
			{LINKS.map((l) => {
				const active = pathname === l.href;
				return (
					<Link
						key={l.href}
						href={l.href}
						aria-current={active ? "page" : undefined}
						className={cn(
							"-mb-px whitespace-nowrap border-b-2 px-3 py-2 font-medium text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring",
							active
								? "border-primary text-foreground"
								: "border-transparent text-muted-foreground hover:text-foreground",
						)}
					>
						{l.label}
					</Link>
				);
			})}
		</nav>
	);
}
