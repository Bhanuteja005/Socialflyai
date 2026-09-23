import { z } from "zod";

/**
 * Object storage — S3-compatible: RustFS locally, R2/S3 in production. Shared by
 * the API (presigned browser uploads) and the worker (writes AI-generated media),
 * so both must point at the same bucket.
 */
export const storageEnv = {
	S3_ENDPOINT: z.string().default("http://localhost:9000"),
	S3_REGION: z.string().default("auto"),
	S3_BUCKET: z.string().default("socialfly-media"),
	S3_ACCESS_KEY_ID: z.string().default("socialfly"),
	S3_SECRET_ACCESS_KEY: z.string().default("socialfly-dev-secret"),
	/** Public base URL platforms fetch media from (IG/Threads require a public URL). */
	S3_PUBLIC_URL: z.string().default("http://localhost:9000/socialfly-media"),
} as const;
