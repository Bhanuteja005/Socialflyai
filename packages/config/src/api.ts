import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { baseServerEnv } from "./base";
import { integrationsEnv } from "./integrations";
import { csv, port } from "./shared";

export const apiEnv = createEnv({
	server: {
		...baseServerEnv,
		...integrationsEnv,
		PORT: port(4400),
		OTEL_SERVICE_NAME: z.string().default("socialfly-api"),
		CORS_ORIGINS: csv("http://localhost:3000"),

		// Object storage — S3-compatible: MinIO locally, R2/S3 in production.
		S3_ENDPOINT: z.string().default("http://localhost:9000"),
		S3_REGION: z.string().default("auto"),
		S3_BUCKET: z.string().default("socialfly-media"),
		S3_ACCESS_KEY_ID: z.string().default("socialfly"),
		S3_SECRET_ACCESS_KEY: z.string().default("socialfly-dev-secret"),
		/** Public base URL platforms fetch media from (IG/Threads require a public URL). */
		S3_PUBLIC_URL: z.string().default("http://localhost:9000/socialfly-media"),
		MEDIA_MAX_UPLOAD_MB: z.coerce.number().int().positive().default(512),

		// Transactional mail (team invitations)
		SMTP_URL: z.string().default("smtp://localhost:1025"),
		MAIL_FROM: z.string().default("SocialFly <no-reply@socialfly.local>"),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});

export type ApiEnv = typeof apiEnv;
