import { webEnv } from "@socialfly/config/web";
import { Toaster } from "@socialfly/ui/components/toast";
import type { Metadata, Viewport } from "next";
import { Onest } from "next/font/google";
import type { ReactNode } from "react";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingNavbar } from "@/components/marketing/marketing-navbar";
import "./globals.css";

const onest = Onest({ variable: "--font-onest", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
	metadataBase: new URL(webEnv.NEXT_PUBLIC_SITE_URL),
	title: {
		default: "SocialFly AI — Schedule, publish and manage social media",
		template: "%s | SocialFly AI",
	},
	description:
		"Plan, schedule and publish to every social network from one calendar. SocialFly AI keeps your team, content and channels in one place.",
	applicationName: "SocialFly AI",
	icons: {
		icon: "/assets/socialflyai_logo/socialflyailogo.png",
		apple: "/assets/socialflyai_logo/socialflyailogo.png",
	},
	openGraph: { type: "website", siteName: "SocialFly AI" },
	twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#000000", colorScheme: "dark" };

/**
 * The public site is always dark (black + brand green), independent of the product
 * app's light/dark preference — so `.dark` is fixed on <html> and there is no theme
 * script or ThemeProvider. Static pages only: no auth, no API client, no data fetching.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en" className={`dark ${onest.variable}`}>
			<body className="min-h-dvh">
				<div className="flex min-h-dvh flex-col overflow-x-clip bg-black font-sans text-white antialiased selection:bg-primary selection:text-black">
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
				<Toaster theme="dark" />
			</body>
		</html>
	);
}
