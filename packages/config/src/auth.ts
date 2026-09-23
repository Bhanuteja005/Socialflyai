import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { baseServerEnv } from "./base";
import { boolFlag, csv, port } from "./shared";

export const authEnv = createEnv({
	server: {
		...baseServerEnv,
		PORT: port(4800),
		OTEL_SERVICE_NAME: z.string().default("socialfly-auth"),
		// The product app and the admin console both sign users in.
		CORS_ORIGINS: csv("http://localhost:4700,http://localhost:4702"),
		AUTH_COOKIE_SECURE: boolFlag(process.env.NODE_ENV === "production"),
		/** JSON array overriding the first-party client registry (apps/auth/src/config/clients.ts). */
		AUTH_CLIENTS_JSON: z.string().optional(),
		GOOGLE_CLIENT_ID: z.string().default(""),
		GOOGLE_CLIENT_SECRET: z.string().default(""),
		GOOGLE_REDIRECT_URI: z
			.string()
			.url()
			.default("http://localhost:4800/auth/oauth/google/callback"),

		// Transactional mail (Mailpit locally — inbox at http://localhost:8025)
		SMTP_URL: z.string().default("smtp://localhost:1025"),
		MAIL_FROM: z.string().default("SocialFly <no-reply@socialfly.local>"),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});

export type AuthEnv = typeof authEnv;
