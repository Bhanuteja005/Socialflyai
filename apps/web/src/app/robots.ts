import { webEnv } from "@socialfly/config/web";
import type { MetadataRoute } from "next";

/** Logged-in app, auth flows and API routes are kept out of search indexes. */
const PRIVATE_PATHS = [
	"/api/",
	"/dashboard",
	"/calendar",
	"/posts",
	"/compose",
	"/channels",
	"/media",
	"/settings",
	"/onboarding",
	"/invite",
	"/auth",
	"/forgot-password",
	"/reset-password",
];

export default function robots(): MetadataRoute.Robots {
	const base = webEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
	return {
		rules: [{ userAgent: "*", allow: "/", disallow: PRIVATE_PATHS }],
		sitemap: `${base}/sitemap.xml`,
		host: base,
	};
}
