import type { AccessClaims } from "@socialfly/core/auth";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { DbOrTx } from "../client";
import { authSessions, serviceClients, users } from "../schema";

/**
 * True when a VALID-signature access token must still be refused: its session was
 * revoked (logout, reuse detection), the user was disabled, the password changed
 * (token_version bumped), or the service client was disabled.
 *
 * One indexed primary-key lookup per request. Every service that accepts access
 * tokens passes this to `requireAuth({ isRevoked })`, so a logout or password
 * reset takes effect immediately instead of after the token's 15-minute expiry.
 */
export async function isAccessRevoked(db: DbOrTx, claims: AccessClaims): Promise<boolean> {
	if (claims.principal === "service") {
		const [client] = await db
			.select({ id: serviceClients.id })
			.from(serviceClients)
			.where(and(eq(serviceClients.clientId, claims.cid), isNull(serviceClients.disabledAt)))
			.limit(1);
		return !client;
	}

	const [row] = await db
		.select({ tokenVersion: users.tokenVersion })
		.from(authSessions)
		.innerJoin(users, eq(users.id, authSessions.userId))
		.where(
			and(
				eq(authSessions.id, claims.sid),
				eq(authSessions.userId, claims.sub),
				isNull(authSessions.revokedAt),
				gt(authSessions.expiresAt, new Date()),
				eq(users.status, "active"),
			),
		)
		.limit(1);
	return !row || row.tokenVersion !== claims.token_version;
}
