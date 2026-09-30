import {
	BarChart3,
	CalendarDays,
	Images,
	Inbox,
	LayoutDashboard,
	type LucideIcon,
	Megaphone,
	PenSquare,
	Radio,
	Rows3,
	Settings,
	Sparkles,
	Telescope,
} from "lucide-react";

export type NavEntry = {
	href: string;
	label: string;
	icon: LucideIcon;
	/** Words the command palette should also match. */
	keywords?: string;
};

export type NavGroup = { title?: string; items: NavEntry[] };

/** Sidebar structure, grouped by job: publish → create → grow. */
export const NAV: NavGroup[] = [
	{
		items: [
			{ href: "/dashboard", label: "Home", icon: LayoutDashboard, keywords: "dashboard overview" },
			{
				href: "/inbox",
				label: "Inbox",
				icon: Inbox,
				keywords: "comments mentions replies approvals",
			},
		],
	},
	{
		title: "Publish",
		items: [
			{ href: "/calendar", label: "Calendar", icon: CalendarDays, keywords: "schedule planner" },
			{ href: "/posts", label: "Posts", icon: Rows3, keywords: "drafts queue published" },
			{ href: "/channels", label: "Channels", icon: Radio, keywords: "accounts connect social" },
		],
	},
	{
		title: "Create",
		items: [
			{
				href: "/create",
				label: "AI Studio",
				icon: Sparkles,
				keywords: "generate image video carousel",
			},
			{ href: "/media", label: "Media library", icon: Images, keywords: "uploads assets photos" },
		],
	},
	{
		title: "Grow",
		items: [
			{
				href: "/analytics",
				label: "Analytics",
				icon: BarChart3,
				keywords: "insights reports metrics",
			},
			{
				href: "/research",
				label: "Research",
				icon: Telescope,
				keywords: "brand seo keywords competitors visibility",
			},
			{ href: "/ads", label: "Ads", icon: Megaphone, keywords: "campaigns paid advertising" },
		],
	},
];

export const SETTINGS_NAV: NavEntry = {
	href: "/settings/organization",
	label: "Settings",
	icon: Settings,
	keywords: "organization team brand voice account",
};

export function isActive(pathname: string, href: string) {
	if (href.startsWith("/settings")) return pathname.startsWith("/settings");
	return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

/** The nav entry that owns a path, for the top-bar breadcrumb. */
export function sectionFor(pathname: string): NavEntry | undefined {
	if (pathname.startsWith("/settings")) return SETTINGS_NAV;
	if (pathname.startsWith("/compose"))
		return { href: "/compose", label: "New post", icon: PenSquare };
	for (const group of NAV) {
		const hit = group.items.find((i) => isActive(pathname, i.href));
		if (hit) return hit;
	}
	return undefined;
}
