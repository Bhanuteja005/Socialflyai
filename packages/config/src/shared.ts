import { z } from "zod";

/**
 * Env helpers shared by every service schema.
 *
 * The rule that shapes this file: a value that is safe to default in development
 * (a localhost URL, a port) gets a default; a SECRET never does in production.
 * `devDefault` returns the fallback only outside production, so a missing secret
 * fails the boot with a readable error instead of silently running production on
 * a well-known dev key.
 */
export const isProduction = process.env.NODE_ENV === "production";

export function devDefault<T extends z.ZodType<string>>(schema: T, fallback: string) {
	return isProduction ? schema : schema.default(fallback as never);
}

/** "true"/"false"/"1"/"0" from the environment, parsed to a real boolean. */
export const boolFlag = (fallback: boolean) =>
	z
		.enum(["true", "false", "1", "0"])
		.default(fallback ? "true" : "false")
		.transform((v) => v === "true" || v === "1");

/** Comma-separated list → string[] (blank entries dropped). */
export const csv = (fallback = "") =>
	z
		.string()
		.default(fallback)
		.transform((v) =>
			v
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean),
		);

export const port = (fallback: number) =>
	z.coerce.number().int().min(1).max(65535).default(fallback);

/** A 32-byte key, base64-encoded (generate with `bun run cli secrets`). */
export const base64Key32 = z
	.string()
	.refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes, base64-encoded");
