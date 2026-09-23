import { z } from "zod";

const timezone = z
	.string()
	.refine(
		(tz) => Intl.supportedValuesOf("timeZone").includes(tz) || tz === "UTC",
		"Unknown time zone",
	);

export const createOrganizationBody = z.object({
	name: z.string().trim().min(2).max(80),
	timezone: timezone.default("UTC"),
});

export const updateOrganizationBody = z
	.object({ name: z.string().trim().min(2).max(80).optional(), timezone: timezone.optional() })
	.refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const roleSchema = z.enum(["owner", "admin", "editor", "viewer"]);

export const organizationSchema = z.object({
	id: z.string(),
	name: z.string(),
	slug: z.string(),
	timezone: z.string(),
	role: roleSchema,
	createdAt: z.string(),
});

export const memberSchema = z.object({
	userId: z.string(),
	email: z.string(),
	name: z.string().nullable(),
	avatarUrl: z.string().nullable(),
	role: roleSchema,
	joinedAt: z.string(),
});

export const userIdParam = z.object({ userId: z.uuid() });
export const idParam = z.object({ id: z.uuid() });
export const updateMemberBody = z.object({ role: roleSchema });

export const createInvitationBody = z.object({
	email: z.string().trim().email().max(320),
	role: roleSchema.exclude(["owner"]).default("editor"),
});
export const acceptInvitationBody = z.object({ token: z.string().min(1).max(200) });
