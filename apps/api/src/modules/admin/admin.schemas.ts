import { z } from "zod";
import { GENERATION_KINDS } from "#src/modules/ai/ai.schemas.ts";

const limit = z.coerce.number().int().min(1).max(100).default(25);

/** Keyset pagination on the time-ordered UUIDv7 id: `before` is the last id of the previous page. */
const page = { before: z.uuid().optional(), limit };

/** Free-text search; trimmed, and an empty string means "no filter". */
const search = z
	.string()
	.trim()
	.max(200)
	.optional()
	.transform((v) => v || undefined);

export const idParam = z.object({ id: z.uuid() });

export const listOrganizationsQuery = z.object({ q: search, ...page });
export const listUsersQuery = z.object({ q: search, ...page });
export const listAuditQuery = z.object(page);

export const updateOrganizationBody = z.object({
	/** Null clears the override (back to the server default); 0 = unlimited. */
	aiMonthlyBudgetUsd: z.number().min(0).max(1_000_000).nullable(),
});

export const updateUserBody = z.object({ status: z.enum(["active", "disabled"]) });

export const ADMIN_TARGET_STATUSES = ["failed", "unconfirmed"] as const;

export const listTargetsQuery = z.object({
	/** Omitted = both: the two states that need a human. */
	status: z.enum(ADMIN_TARGET_STATUSES).optional(),
	...page,
});

export const listGenerationsQuery = z.object({
	status: z.enum(["pending", "running", "succeeded", "failed"]).optional(),
	kind: z.enum(GENERATION_KINDS).optional(),
	...page,
});
