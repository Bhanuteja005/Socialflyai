import type { MetadataRoute } from "next";

/**
 * The admin console is staff-only: nothing here may ever be indexed or even hinted at
 * to crawlers (see also the X-Robots-Tag header in next.config.ts).
 */
export default function robots(): MetadataRoute.Robots {
	return { rules: [{ userAgent: "*", disallow: "/" }] };
}
