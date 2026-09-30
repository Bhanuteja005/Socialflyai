import { webEnv } from "@socialfly/config/web";
import { Toaster } from "@socialfly/ui/components/toast";
import type { Metadata, Viewport } from "next";
import { DM_Mono, Geist_Pixel, Google_Sans_Flex } from "next/font/google";
import type { ReactNode } from "react";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingNavbar } from "@/components/marketing/marketing-navbar";
import { siteThemeScript } from "@/components/marketing/site-theme";
import "./globals.css";

// Type roles (docs/design.md): Google Sans Flex for text, Geist Pixel for titles, DM Mono for numbers.
const sans = Google_Sans_Flex({
	variable: "--font-sans-flex",
	subsets: ["latin"],
	display: "swap",
});
const pixel = Geist_Pixel({ variable: "--font-geist-pixel", subsets: ["latin"], display: "swap" });
const mono = DM_Mono({
	variable: "--font-dm-mono",
	subsets: ["latin"],
	weight: ["400", "500"],
	display: "swap",
});
const fontVars = `${sans.variable} ${pixel.variable} ${mono.variable}`;

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

export const viewport: Viewport = { themeColor: "#000000" };

/**
 * Dark by default (the brand look) with a light/dark toggle in the nav. The choice is kept under
 * the site's own storage key and applied before first paint. Static pages only: no auth, no
 * API client, no data fetching.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning className={`dark ${fontVars}`}>
			<head>
				{/* biome-ignore lint/security/noDangerouslySetInnerHtml: static theme bootstrap, no user input */}
				<script dangerouslySetInnerHTML={{ __html: siteThemeScript }} />
			</head>
			<body className="min-h-dvh">
				<div className="flex min-h-dvh flex-col overflow-x-clip bg-canvas font-sans text-foreground antialiased">
					<a
						href="#main-content"
						className="sr-only z-[60] rounded-full bg-ink px-4 py-2 font-medium text-ink-foreground focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
					>
						Skip to content
					</a>
					<MarketingNavbar />
					<main id="main-content" className="relative flex-1">
						{children}
					</main>
					<MarketingFooter />
				</div>
				<Toaster />
			</body>
		</html>
	);
}
