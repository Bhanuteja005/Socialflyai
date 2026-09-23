import type { ValidationTargets } from "hono";
import { resolver, validator } from "hono-openapi";
import type { z } from "zod";
import { validationFailed } from "../errors";

type Issue = { path?: ReadonlyArray<PropertyKey | { key: PropertyKey }>; message: string };

/** Schema issues → 422 AppError with a `fields` map the web forms render inline. */
export const validationHook = (result: { success: boolean; error?: ReadonlyArray<Issue> }) => {
	if (result.success) return;
	const fields: Record<string, string> = {};
	for (const issue of result.error ?? []) {
		const key =
			issue.path
				?.map((p) => (typeof p === "object" && p !== null && "key" in p ? p.key : p))
				.map(String)
				.join(".") || "_";
		fields[key] ??= issue.message;
	}
	throw validationFailed({ fields });
};

/**
 * Validate a request part and document it in the OpenAPI spec, in one step.
 * Handlers read the parsed value with `ctx.req.valid(target)` and never parse
 * again (the reference repo validated bodies twice).
 */
export const validate = <T extends z.ZodType, Target extends keyof ValidationTargets>(
	target: Target,
	schema: T,
) => validator(target, schema, validationHook);

/** `responses` entry for describeRoute: `200: jsonResponse(postSchema, "The post")`. */
export const jsonResponse = (schema: z.ZodType, description: string) => ({
	description,
	content: { "application/json": { schema: resolver(schema) } },
});
