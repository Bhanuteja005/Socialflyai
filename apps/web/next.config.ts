import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	output: "standalone",
	// Trace from the monorepo root so the standalone bundle includes workspace packages.
	outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
	transpilePackages: ["@socialfly/config"],
	poweredByHeader: false,
	images: {
		remotePatterns: [
			// Local object storage (MinIO) in development.
			{ protocol: "http", hostname: "localhost", port: "9000" },
			// Platform avatars / CDNs.
			{ protocol: "https", hostname: "pbs.twimg.com" },
			{ protocol: "https", hostname: "abs.twimg.com" },
			{ protocol: "https", hostname: "media.licdn.com" },
			{ protocol: "https", hostname: "**.fbcdn.net" },
			{ protocol: "https", hostname: "**.cdninstagram.com" },
			{ protocol: "https", hostname: "yt3.ggpht.com" },
			{ protocol: "https", hostname: "**.googleusercontent.com" },
			{ protocol: "https", hostname: "styles.redditmedia.com" },
			{ protocol: "https", hostname: "**.redd.it" },
		],
	},
};

export default nextConfig;
