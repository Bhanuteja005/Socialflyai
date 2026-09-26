"use client";

import { cn } from "@socialfly/ui/utils";
import {
	ArrowRight,
	Briefcase,
	CalendarClock,
	CalendarDays,
	ChartColumn,
	ChevronDown,
	Clock,
	GraduationCap,
	HeartHandshake,
	type LucideIcon,
	MessagesSquare,
	PenLine,
	Reply,
	Sparkles,
	Store,
	UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavigationMenu as Nav } from "radix-ui";
import { focusRing } from "./primitives";
import { NAV_GROUPS, NAV_LINKS, type NavGroup, type NavLink } from "./site-config";

// Icons live here rather than in site-config so the footer and sitemap keep importing plain data.
const ICONS: Record<string, LucideIcon> = {
	"/features/ai-assistant": Sparkles,
	"/features/calendar-planner": CalendarDays,
	"/features/best-time": Clock,
	"/features/scheduling": CalendarClock,
	"/features/ai-reply": Reply,
	"/features/ai-caption-generator": PenLine,
	"/features/comment-management": MessagesSquare,
	"/features/analytics": ChartColumn,
	"/features/agency": Briefcase,
	"/solutions/creators": UserRound,
	"/solutions/smb": Store,
	"/solutions/agencies": Briefcase,
	"/solutions/non-profits": HeartHandshake,
	"/solutions/higher-education": GraduationCap,
};

const pillClass = `inline-flex h-8 items-center gap-1 rounded-full px-3 text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground data-[active=true]:text-foreground ${focusRing}`;

const isActive = (pathname: string, href: string) =>
	pathname === href || pathname.startsWith(`${href}/`);

/**
 * Desktop top-bar menus. Radix NavigationMenu gives the keyboard and screen-reader
 * behaviour (arrow keys, Escape, aria-expanded) that hand-rolled hover menus miss; its shared
 * Viewport morphs between panels instead of flashing one closed and the next open.
 */
export function NavMenus() {
	const pathname = usePathname();

	return (
		<Nav.Root className="relative hidden lg:block" aria-label="Main" delayDuration={80}>
			<Nav.List className="flex items-center gap-0.5">
				{NAV_GROUPS.map((group) => {
					const active =
						(group.href !== undefined && isActive(pathname, group.href)) ||
						group.links.some((link) => isActive(pathname, link.href));
					return (
						<Nav.Item key={group.label}>
							<Nav.Trigger data-active={active} className={`group ${pillClass}`}>
								{group.label}
								<ChevronDown
									className="size-3.5 opacity-60 transition-transform duration-200 group-data-[state=open]:rotate-180"
									aria-hidden="true"
								/>
							</Nav.Trigger>
							<Nav.Content className="nav-panel-content absolute top-0 left-0">
								<GroupPanel group={group} />
							</Nav.Content>
						</Nav.Item>
					);
				})}
				{NAV_LINKS.map((link) => {
					const active = isActive(pathname, link.href);
					return (
						<Nav.Item key={link.href}>
							<Nav.Link asChild active={active}>
								<Link
									href={link.href}
									data-active={active}
									aria-current={active ? "page" : undefined}
									className={pillClass}
								>
									{link.label}
								</Link>
							</Nav.Link>
						</Nav.Item>
					);
				})}
			</Nav.List>

			<div className="absolute top-full left-1/2 flex -translate-x-1/2 justify-center pt-3">
				<Nav.Viewport className="nav-viewport relative h-(--radix-navigation-menu-viewport-height) w-(--radix-navigation-menu-viewport-width) origin-top overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-lg transition-[width,height] duration-200 ease-[cubic-bezier(.22,1,.36,1)]" />
			</div>
		</Nav.Root>
	);
}

function GroupPanel({ group }: { group: NavGroup }) {
	const rich = group.links.every((link) => link.description);

	if (rich && group.links.length > 6) {
		// Features: two columns of described items + a featured card.
		return (
			<div className="flex w-[760px] gap-2 p-2">
				<ul className="grid flex-1 grid-cols-2 gap-0.5">
					{group.links.map((link) => (
						<li key={link.href}>
							<RichItem link={link} />
						</li>
					))}
				</ul>
				{group.href && <FeaturedCard href={group.href} />}
			</div>
		);
	}

	if (rich) {
		return (
			<ul className="grid w-[380px] gap-0.5 p-2">
				{group.links.map((link) => (
					<li key={link.href}>
						<RichItem link={link} />
					</li>
				))}
			</ul>
		);
	}

	// Resources: labelled columns of plain links, each with an optional "All …" link.
	return (
		<div className="grid w-[700px] grid-cols-[1.4fr_1fr_1fr] gap-2 p-2">
			{(group.sections ?? []).map((section) => (
				<div key={section.title} className="flex flex-col rounded-xl p-2">
					<p className="px-2 pb-2 font-medium text-subtle-foreground text-xs">{section.title}</p>
					<ul className="flex flex-col gap-px">
						{section.links.map((link) => (
							<li key={link.href}>
								<Nav.Link asChild>
									<Link
										href={link.href}
										className={`block truncate rounded-lg px-2 py-1.5 text-muted-foreground text-sm transition-colors duration-150 hover:bg-muted hover:text-foreground ${focusRing}`}
									>
										{link.label}
									</Link>
								</Nav.Link>
							</li>
						))}
					</ul>
					{section.more && (
						<Nav.Link asChild>
							<Link
								href={section.more.href}
								className={`group/all mt-1 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-medium text-brand-text text-sm ${focusRing}`}
							>
								{section.more.label}
								<ArrowRight
									className="size-3.5 transition-transform duration-150 group-hover/all:translate-x-0.5"
									aria-hidden="true"
								/>
							</Link>
						</Nav.Link>
					)}
				</div>
			))}
		</div>
	);
}

function RichItem({ link }: { link: NavLink }) {
	const Icon = ICONS[link.href];
	return (
		<Nav.Link asChild>
			<Link
				href={link.href}
				className={`group/item flex items-start gap-3 rounded-xl p-2.5 transition-colors duration-150 hover:bg-muted ${focusRing}`}
			>
				{Icon && (
					<span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-canvas text-muted-foreground transition-colors duration-150 group-hover/item:border-brand/40 group-hover/item:text-brand-text">
						<Icon className="size-4" aria-hidden="true" />
					</span>
				)}
				<span className="min-w-0">
					<span className="block font-medium text-foreground text-sm leading-5">{link.label}</span>
					<span className="block text-[12.5px] text-muted-foreground leading-[18px]">
						{link.description}
					</span>
				</span>
			</Link>
		</Nav.Link>
	);
}

function FeaturedCard({ href }: { href: string }) {
	return (
		<Nav.Link asChild>
			<Link
				href={href}
				className={cn(
					"group/card relative flex w-[220px] shrink-0 flex-col justify-between overflow-hidden rounded-xl border border-border bg-surface p-4",
					focusRing,
				)}
			>
				<div
					aria-hidden="true"
					className="bg-glow pointer-events-none absolute inset-0 opacity-90"
				/>
				<div className="relative">
					<span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-text">
						<span className="size-1.5 rounded-full bg-brand" />
						All-in-one
					</span>
					<p className="mt-3 font-medium text-[20px] text-foreground leading-[1.2] tracking-tight">
						Plan, post and reply in one place
					</p>
				</div>
				<span className="relative mt-6 inline-flex items-center gap-1.5 font-medium text-foreground text-sm">
					See all features
					<ArrowRight
						className="size-3.5 transition-transform duration-150 group-hover/card:translate-x-0.5"
						aria-hidden="true"
					/>
				</span>
			</Link>
		</Nav.Link>
	);
}
