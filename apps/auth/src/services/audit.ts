import type { Database } from "@socialfly/db";
import { schema } from "@socialfly/db";

export type AuditEvent =
	| "register"
	| "login"
	| "login_failed"
	| "logout"
	| "refresh_reuse_detected"
	| "password_changed"
	| "password_reset"
	| "email_verified"
	| "oauth_register"
	| "oauth_link"
	| "session_revoked"
	| "service_token_issued";

export type RequestMeta = { ip?: string; userAgent?: string };

/**
 * Security audit trail. Best effort: an audit write failure is logged by the
 * caller's error path but never blocks the auth flow itself.
 */
export async function audit(
	db: Database,
	event: AuditEvent,
	input: RequestMeta & { userId?: string; clientId?: string; metadata?: Record<string, unknown> },
) {
	await db
		.insert(schema.authAuditEvents)
		.values({
			event,
			userId: input.userId,
			clientId: input.clientId,
			ip: input.ip,
			userAgent: input.userAgent,
			metadata: input.metadata,
		})
		.catch(() => {});
}
