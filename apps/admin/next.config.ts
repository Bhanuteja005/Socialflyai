import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	output: "standalone",
	// Trace from the monorepo root so the standalone bundle includes workspace packages.
	outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
	// Workspace packages ship TypeScript source, not a build.
	transpilePackages: ["@socialfly/config", "@socialfly/ui"],
	poweredByHeader: false,
	async headers() {
		// Staff-only: belt and braces on top of robots.txt and the noindex metadata, and
		// never framed by another site (clickjacking the disable/budget buttons).
		return [
			{
				source: "/:path*",
				headers: [
					{ key: "X-Robots-Tag", value: "noindex, nofollow" },
					{ key: "X-Frame-Options", value: "DENY" },
					{ key: "Referrer-Policy", value: "same-origin" },
				],
			},
		];
	},
};

export default nextConfig;
