import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { aiEnv } from "./ai";
import { baseServerEnv } from "./base";
import { integrationsEnv } from "./integrations";
import { csv, port } from "./shared";
import { storageEnv } from "./storage";

export const apiEnv = createEnv({
	server: {
		...baseServerEnv,
		...integrationsEnv,
		...storageEnv,
		...aiEnv,
		PORT: port(4400),
		OTEL_SERVICE_NAME: z.string().default("socialfly-api"),
		CORS_ORIGINS: csv("http://localhost:3000"),

		MEDIA_MAX_UPLOAD_MB: z.coerce.number().int().positive().default(512),

		// Transactional mail (team invitations)
		SMTP_URL: z.string().default("smtp://localhost:1025"),
		MAIL_FROM: z.string().default("SocialFly <no-reply@socialfly.local>"),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});

export type ApiEnv = typeof apiEnv;
