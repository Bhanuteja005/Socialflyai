import { webEnv } from "@socialfly/config/web";
import { themeScript } from "@socialfly/ui/theme";
import type { Metadata, Viewport } from "next";
import { Onest } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers/providers";
import "./globals.css";

const onest = Onest({ variable: "--font-onest", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
	metadataBase: new URL(webEnv.NEXT_PUBLIC_APP_URL),
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

export const viewport: Viewport = {
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#ffffff" },
		{ media: "(prefers-color-scheme: dark)", color: "#09090b" },
	],
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning className={onest.variable}>
			<head>
				{/* biome-ignore lint/security/noDangerouslySetInnerHtml: static theme bootstrap, no user input */}
				<script dangerouslySetInnerHTML={{ __html: themeScript }} />
			</head>
			<body className="min-h-dvh">
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
