import { apiEnv as env } from "@socialfly/config";
import { signAccessJwt } from "@socialfly/core/auth";
import { createCsrfToken, normalizeEmail } from "@socialfly/core/security";
import { schema } from "@socialfly/db";
import { app } from "#src/app.ts";
import { db, tokenCipher } from "#src/infrastructure/index.ts";

/**
 * A signed-in test user without going through apps/auth: insert the user and a
 * session, and mint the same access JWT the auth service would. The API only
 * ever sees the token, so this exercises exactly the production auth path
 * (signature, issuer/audience, revocation lookup).
 */
export async function createUser(name = "Test User") {
	const email = `user-${crypto.randomUUID()}@example.test`;
	const [user] = await db
		.insert(schema.users)
		.values({ email, emailNormalized: normalizeEmail(email), name, emailVerifiedAt: new Date() })
		.returning();
	if (!user) throw new Error("no user");
	const [session] = await db
		.insert(schema.authSessions)
		.values({
			userId: user.id,
			clientId: "socialfly-web",
			refreshTokenHash: crypto.randomUUID(),
			expiresAt: new Date(Date.now() + 3600_000),
		})
		.returning();
	if (!session) throw new Error("no session");
	const token = await signAccessJwt(
		{ issuer: env.AUTH_ISSUER, audience: env.AUTH_AUDIENCE, secret: env.AUTH_JWT_SECRET },
		{
			sub: user.id,
			sid: session.id,
			cid: "socialfly-web",
			email,
			email_verified: true,
			token_version: user.tokenVersion,
			principal: "user",
		},
	);
	return { user, session, client: new ApiClient(token) };
}

/** Cookie-authenticated like the browser (so CSRF is exercised too). */
export class ApiClient {
	private readonly csrf = createCsrfToken();
	orgId?: string;

	constructor(readonly accessToken: string) {}

	async request(method: string, path: string, body?: unknown) {
		const res = await app.request(path, {
			method,
			headers: {
				Origin: "http://localhost:3000",
				Cookie: `sf_access=${this.accessToken}; sf_csrf=${this.csrf}`,
				"X-CSRF-Token": this.csrf,
				...(this.orgId ? { "X-Organization-Id": this.orgId } : {}),
				...(body !== undefined ? { "Content-Type": "application/json" } : {}),
			},
			body: body !== undefined ? JSON.stringify(body) : undefined,
		});
		const text = await res.text();
		// biome-ignore lint/suspicious/noExplicitAny: test helper — assertions narrow the shape.
		const json = (text ? JSON.parse(text) : null) as any;
		return { status: res.status, json };
	}
}

/** A connected channel, inserted directly (OAuth itself is exercised in the provider tests). */
export async function createChannel(
	orgId: string,
	provider = "linkedin",
	name = "Acme on LinkedIn",
) {
	const [channel] = await db
		.insert(schema.channels)
		.values({
			organizationId: orgId,
			provider,
			externalId: crypto.randomUUID(),
			name,
			accessTokenEnc: tokenCipher.encrypt("platform-access-token"),
			scopes: ["w_member_social"],
		})
		.returning();
	if (!channel) throw new Error("no channel");
	return channel;
}
