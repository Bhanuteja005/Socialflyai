import { webEnv } from "@socialfly/config/web";
import { themeScript } from "@socialfly/ui/theme";
import type { Metadata, Viewport } from "next";
import { DM_Mono, Geist_Pixel, Google_Sans_Flex } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers/providers";
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
	metadataBase: new URL(webEnv.NEXT_PUBLIC_ADMIN_URL),
	title: { default: "SocialFly Admin", template: "%s · SocialFly Admin" },
	description: "Internal SocialFly staff console.",
	applicationName: "SocialFly Admin",
	// Staff-only: never indexed, never followed, never cached by search engines.
	robots: { index: false, follow: false, nocache: true },
	icons: {
		icon: "/assets/socialflyai_logo/socialflyailogo.png",
		apple: "/assets/socialflyai_logo/socialflyailogo.png",
	},
};

export const viewport: Viewport = {
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#ffffff" },
		{ media: "(prefers-color-scheme: dark)", color: "#09090b" },
	],
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning className={fontVars}>
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
