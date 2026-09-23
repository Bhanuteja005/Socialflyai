import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	output: "standalone",
	// Trace from the monorepo root so the standalone bundle includes workspace packages.
	outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
	// Workspace packages ship TypeScript source, not a build.
	transpilePackages: ["@socialfly/config", "@socialfly/ui"],
	poweredByHeader: false,
};

export default nextConfig;
