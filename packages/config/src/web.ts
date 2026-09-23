import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Browser-visible config for every Next.js frontend (site, app, admin). NEXT_PUBLIC_*
 * are inlined into the client bundle at BUILD time, so in CI they are docker build
 * args, not container env (see infra/docker/web.Dockerfile).
 *
 * The three frontends are separate deployments that link to each other, so each one
 * knows all three public URLs: the site's "Log in" goes to APP_URL/login, the app's
 * legal links go to SITE_URL, and so on.
 */
export const webEnv = createEnv({
	clientPrefix: "NEXT_PUBLIC_",
	client: {
		NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:4400"),
		NEXT_PUBLIC_AUTH_URL: z.string().url().default("http://localhost:4800"),
		NEXT_PUBLIC_AUTH_CLIENT_ID: z.string().default("socialfly-web"),
		/** The product app (apps/app). */
		NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:4700"),
		/** The public marketing site (apps/site). */
		NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:4701"),
		/** The internal admin console (apps/admin). */
		NEXT_PUBLIC_ADMIN_URL: z.string().url().default("http://localhost:4702"),
		NEXT_PUBLIC_SENTRY_DSN: z.string().default(""),
	},
	runtimeEnv: {
		NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
		NEXT_PUBLIC_AUTH_URL: process.env.NEXT_PUBLIC_AUTH_URL,
		NEXT_PUBLIC_AUTH_CLIENT_ID: process.env.NEXT_PUBLIC_AUTH_CLIENT_ID,
		NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
		NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
		NEXT_PUBLIC_ADMIN_URL: process.env.NEXT_PUBLIC_ADMIN_URL,
		NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
	},
	emptyStringAsUndefined: true,
});
