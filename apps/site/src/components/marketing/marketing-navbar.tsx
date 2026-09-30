"use client";

import { cn } from "@socialfly/ui/utils";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LOGIN_URL, SIGNUP_URL } from "@/components/marketing/app-links";
import { MobileNav } from "./mobile-nav";
import { NavMenus } from "./nav-menus";
import { focusRing } from "./primitives";
import { ThemeToggle } from "./theme-toggle";

export function MarketingNavbar() {
	// Over the hero the bar stays light so the glow shows through; once content scrolls under it,
	// it firms up into a raised pill so links stay legible over busy sections.
	const [scrolled, setScrolled] = useState(false);

	useEffect(() => {
		const onScroll = () => setScrolled(window.scrollY > 8);
		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, []);

	return (
		<header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-4">
			<div
				className={cn(
					"relative mx-auto flex h-14 w-full max-w-[1200px] items-center justify-between gap-3 rounded-full border pr-2 pl-4 backdrop-blur-xl transition-[background-color,border-color,box-shadow] duration-200 ease-[cubic-bezier(.22,1,.36,1)]",
					scrolled
						? "border-border bg-surface-raised/85 shadow-panel"
						: "border-border/60 bg-canvas/60 shadow-none",
				)}
			>
				<Link
					href="/"
					aria-label="SocialFly AI home"
					className={`flex shrink-0 items-center gap-2 rounded-full ${focusRing}`}
				>
					<Image
						src="/assets/socialflyai_logo/socialflyailogo.png"
						alt=""
						width={26}
						height={26}
						priority
						className="size-[26px]"
					/>
					<span className="font-medium text-[15px] text-foreground tracking-tight">SocialFly</span>
				</Link>

				{/* Centred on the bar, not between the logo and actions, so it doesn't drift with their widths. */}
				<div className="absolute left-1/2 -translate-x-1/2">
					<NavMenus />
				</div>

				<div className="flex items-center gap-1">
					<ThemeToggle />
					<span aria-hidden="true" className="mx-1 hidden h-5 w-px bg-border sm:block" />
					<Link
						href={LOGIN_URL}
						className={`hidden h-9 items-center rounded-full px-3.5 font-medium text-muted-foreground text-sm transition-colors duration-150 hover:text-foreground sm:inline-flex ${focusRing}`}
					>
						Log in
					</Link>
					<Link
						href={SIGNUP_URL}
						className={`group inline-flex h-10 items-center gap-1.5 rounded-full bg-brand pr-3.5 pl-4 font-medium text-brand-foreground text-sm shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_1px_2px_rgb(0_0_0/0.08)] transition-colors duration-150 hover:bg-brand-hover ${focusRing}`}
					>
						Start free
						<ArrowRight
							className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
							aria-hidden="true"
						/>
					</Link>
					<MobileNav />
				</div>
			</div>
		</header>
	);
}
