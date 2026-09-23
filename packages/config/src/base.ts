import { z } from "zod";
import { base64Key32, boolFlag, devDefault } from "./shared";

/** Every backend service (api, auth, worker) reads these. */
export const baseServerEnv = {
	NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
	LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

	// Data stores
	DATABASE_URL: devDefault(
		z.string().url(),
		"postgres://socialfly:socialfly@localhost:5434/socialfly",
	),
	DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
	REDIS_URL: devDefault(z.string().url(), "redis://localhost:6380"),

	// Auth — tokens are minted by apps/auth and verified by every other service.
	AUTH_ISSUER: devDefault(z.string().url(), "http://localhost:4800"),
	AUTH_AUDIENCE: z.string().default("socialfly-services"),
	AUTH_JWT_SECRET: devDefault(
		z.string().min(32, "AUTH_JWT_SECRET must be at least 32 characters"),
		"dev-only-jwt-secret-do-not-use-in-production",
	),
	AUTH_COOKIE_DOMAIN: z.string().default("localhost"),

	/**
	 * Key for platform OAuth tokens at rest (AES-256-GCM). The old system stored
	 * social tokens in plaintext; this is the fix. Rotation: set the new key here and
	 * move the old one to TOKEN_ENCRYPTION_KEY_PREVIOUS — reads try both, writes use
	 * the new one, and `bun run cli secrets reencrypt` rewrites stored rows.
	 */
	TOKEN_ENCRYPTION_KEY: devDefault(base64Key32, "ZGV2LW9ubHktdG9rZW4ta2V5LTMyLWJ5dGVzLWxvbmc="),
	TOKEN_ENCRYPTION_KEY_PREVIOUS: base64Key32.optional(),

	// URLs
	WEB_URL: devDefault(z.string().url(), "http://localhost:3000"),
	API_URL: devDefault(z.string().url(), "http://localhost:4400"),

	// Observability
	OTEL_SDK_DISABLED: boolFlag(false),
	OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().default("http://localhost:4318"),
	OTEL_EXPORTER_OTLP_HEADERS: z.string().default(""),
	SENTRY_DSN: z.string().default(""),
	SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
	APP_VERSION: z.string().default(process.env.npm_package_version ?? "dev"),
} as const;
