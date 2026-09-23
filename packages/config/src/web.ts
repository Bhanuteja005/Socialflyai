import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Browser-visible config. NEXT_PUBLIC_* are inlined into the client bundle at
 * BUILD time, so in CI they are docker build args, not container env (see deploy.yml).
 */
export const webEnv = createEnv({
	clientPrefix: "NEXT_PUBLIC_",
	client: {
		NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:4400"),
		NEXT_PUBLIC_AUTH_URL: z.string().url().default("http://localhost:4800"),
		NEXT_PUBLIC_AUTH_CLIENT_ID: z.string().default("socialfly-web"),
		NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
		NEXT_PUBLIC_SENTRY_DSN: z.string().default(""),
	},
	runtimeEnv: {
		NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
		NEXT_PUBLIC_AUTH_URL: process.env.NEXT_PUBLIC_AUTH_URL,
		NEXT_PUBLIC_AUTH_CLIENT_ID: process.env.NEXT_PUBLIC_AUTH_CLIENT_ID,
		NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
		NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
	},
	emptyStringAsUndefined: true,
});
