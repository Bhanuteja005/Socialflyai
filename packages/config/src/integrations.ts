import { z } from "zod";

/**
 * Platform app credentials. Empty = platform disabled: the integration registry
 * hides any provider whose credentials are missing instead of failing the boot, so
 * a partially configured environment still runs.
 */
export const integrationsEnv = {
	LINKEDIN_CLIENT_ID: z.string().default(""),
	LINKEDIN_CLIENT_SECRET: z.string().default(""),
	/** LinkedIn versioned REST API header (YYYYMM). */
	LINKEDIN_API_VERSION: z.string().default("202509"),

	/** One Meta app serves Facebook Pages and Instagram (via Facebook Login). */
	META_APP_ID: z.string().default(""),
	META_APP_SECRET: z.string().default(""),
	META_GRAPH_VERSION: z.string().default("v24.0"),

	THREADS_APP_ID: z.string().default(""),
	THREADS_APP_SECRET: z.string().default(""),

	X_CLIENT_ID: z.string().default(""),
	X_CLIENT_SECRET: z.string().default(""),

	REDDIT_CLIENT_ID: z.string().default(""),
	REDDIT_CLIENT_SECRET: z.string().default(""),
	REDDIT_USER_AGENT: z.string().default("web:socialfly:v1.0 (by /u/socialfly)"),

	YOUTUBE_CLIENT_ID: z.string().default(""),
	YOUTUBE_CLIENT_SECRET: z.string().default(""),
} as const;
