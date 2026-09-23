import type { ReactNode } from "react";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingNavbar } from "@/components/marketing/marketing-navbar";

/**
 * Marketing shell. The public site is always dark (black + brand green) independent of the
 * app theme, so the wrapper carries the `.dark` class to resolve design tokens to their dark
 * values for everything rendered inside it.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
	return (
		<div className="dark flex min-h-dvh flex-col overflow-x-clip bg-black font-sans text-white antialiased selection:bg-primary selection:text-black">
			<a
				href="#main-content"
				className="sr-only z-[60] rounded-full bg-primary px-4 py-2 font-semibold text-black focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
			>
				Skip to content
			</a>
			<MarketingNavbar />
			<main id="main-content" className="relative flex-1">
				{children}
			</main>
			<MarketingFooter />
		</div>
	);
}
