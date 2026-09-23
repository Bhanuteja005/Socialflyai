import type { MetadataRoute } from "next";

/**
 * The product app has nothing to index: every page is behind sign-in or is an auth
 * flow. Public, indexable pages live on the marketing site (apps/site).
 */
export default function robots(): MetadataRoute.Robots {
	return { rules: [{ userAgent: "*", disallow: "/" }] };
}
