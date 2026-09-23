import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { MobileNav } from "./mobile-nav";
import { NavMenus } from "./nav-menus";
import { focusRing } from "./primitives";

export function MarketingNavbar() {
	return (
		<header className="fixed inset-x-0 top-0 z-50 flex justify-center px-3 py-3 sm:px-4 sm:py-4 lg:px-10">
			<div className="relative flex h-14 w-full max-w-[1160px] items-center justify-between gap-4 rounded-full border border-white/15 bg-black/70 pr-1.5 pl-5 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-md sm:h-16 sm:pr-2 sm:pl-8">
				<Link href="/" className={`shrink-0 rounded-md ${focusRing}`}>
					<Image
						src="/assets/socialflyai_logo/socialflyai.svg"
						alt="SocialFly AI home"
						width={196}
						height={36}
						priority
						className="h-6 w-auto sm:h-7"
					/>
				</Link>

				<NavMenus />

				<div className="flex items-center gap-1 sm:gap-2">
					<Link
						href="/login"
						className={`hidden rounded-full px-4 py-2 font-medium text-sm text-white/80 transition-colors hover:text-white sm:inline-flex ${focusRing}`}
					>
						Log in
					</Link>
					<Link
						href="/signup"
						className={`inline-flex items-center gap-2 rounded-full bg-primary py-1.5 pr-1.5 pl-4 font-semibold text-primary-foreground text-xs transition-transform hover:scale-[1.03] active:scale-95 sm:pl-5 sm:text-sm ${focusRing}`}
					>
						<span>Get Started</span>
						<span className="flex size-7 items-center justify-center rounded-full bg-black text-white sm:size-8">
							<ArrowRight className="size-3.5" aria-hidden="true" />
						</span>
					</Link>
					<MobileNav />
				</div>
			</div>
		</header>
	);
}
