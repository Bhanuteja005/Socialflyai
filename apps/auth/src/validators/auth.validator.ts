import { PASSWORD_RULES } from "@socialfly/core/security";
import { z } from "zod";

const email = z.string().trim().email("Enter a valid email address").max(320);
const newPassword = z.string().min(10, `Password needs ${PASSWORD_RULES}`).max(256);
const clientId = z.string().min(1).max(100);

export const clientQuery = z.object({ client_id: clientId });

export const registerBody = z.object({
	client_id: clientId,
	email,
	password: newPassword,
	name: z.string().trim().min(1).max(120).optional(),
});

export const loginBody = z.object({
	client_id: clientId,
	email,
	password: z.string().min(1).max(256),
});

export const emailRequestBody = z.object({ client_id: clientId, email });
export const tokenBody = z.object({ token: z.string().min(1).max(200) });
export const recoveryConfirmBody = z.object({
	token: z.string().min(1).max(200),
	password: newPassword,
});

export const profileBody = z
	.object({
		name: z.string().trim().min(1).max(120).optional(),
		avatarUrl: z.string().url().max(2048).nullable().optional(),
	})
	.refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const passwordChangeBody = z.object({
	currentPassword: z.string().min(1).max(256),
	newPassword,
});

export const googleStartQuery = z.object({
	client_id: clientId,
	redirect_uri: z.string().url().optional(),
});

export const sessionIdParam = z.object({ id: z.uuid() });

// ── response shapes (documented in OpenAPI) ──
export const publicUserSchema = z.object({
	id: z.string(),
	email: z.string(),
	emailVerified: z.boolean(),
	name: z.string().nullable(),
	avatarUrl: z.string().nullable(),
});

export const sessionSchema = z.object({
	id: z.string(),
	clientId: z.string(),
	expiresAt: z.string(),
	authenticatedAt: z.string(),
});

export const authResultSchema = z.object({ user: publicUserSchema, session: sessionSchema });
export const okSchema = z.object({ ok: z.literal(true) });
