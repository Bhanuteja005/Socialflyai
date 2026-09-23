import { webEnv } from "@socialfly/config/web";
import type { MetadataRoute } from "next";

/**
 * Everything on the marketing site is public. The product app (sign-in, dashboard)
 * is a separate host with its own robots.txt that disallows indexing.
 */
export default function robots(): MetadataRoute.Robots {
	const base = webEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
	return {
		rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
		sitemap: `${base}/sitemap.xml`,
		host: base,
	};
}
