import { type JwtConfig, signAccessJwt } from "@socialfly/core/auth";
import { forbidden, unauthorized } from "@socialfly/core/errors";
import { hashToken, safeEqual } from "@socialfly/core/security";
import { and, type Database, eq, isNull, schema } from "@socialfly/db";
import { audit } from "./audit";

const TTL_SECONDS = 5 * 60;

/**
 * OAuth2 client-credentials grant for machine clients (worker → API, CLI, future
 * integrations). Secrets are 256-bit random values stored as SHA-256 hashes —
 * a slow hash is unnecessary for secrets with that much entropy.
 *
 * Unlike the reference auth, there is no user impersonation: a service acts as
 * itself with explicit scopes, and anything user-scoped goes through the user's
 * own session.
 */
export class ServiceTokenService {
	constructor(
		private readonly db: Database,
		private readonly jwt: JwtConfig,
	) {}

	async issue(clientId: string, clientSecret: string, requestedScope?: string) {
		const [client] = await this.db
			.select()
			.from(schema.serviceClients)
			.where(
				and(eq(schema.serviceClients.clientId, clientId), isNull(schema.serviceClients.disabledAt)),
			)
			.limit(1);
		if (!client || !safeEqual(hashToken(clientSecret), client.secretHash)) {
			throw unauthorized("Invalid client credentials");
		}

		const requested = requestedScope?.split(" ").filter(Boolean) ?? client.scopes;
		const denied = requested.filter((s) => !client.scopes.includes(s));
		if (denied.length > 0) throw forbidden(`Client is not allowed scope(s): ${denied.join(", ")}`);

		const scope = requested.join(" ");
		const accessToken = await signAccessJwt(
			this.jwt,
			{
				sub: client.clientId,
				sid: "",
				cid: client.clientId,
				email: "",
				email_verified: false,
				token_version: 0,
				principal: "service",
				scope,
			},
			TTL_SECONDS,
		);
		await audit(this.db, "service_token_issued", {
			clientId: client.clientId,
			metadata: { scope },
		});
		return {
			access_token: accessToken,
			token_type: "Bearer" as const,
			expires_in: TTL_SECONDS,
			scope,
		};
	}
}
