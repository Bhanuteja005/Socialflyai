import { AppError, unavailable, upstreamFailed } from "@socialfly/core/errors";
import { normalizeEmail } from "@socialfly/core/security";
import { and, type Database, eq, schema, sql } from "@socialfly/db";
import { audit, type RequestMeta } from "./audit";

const { users, authOauthAccounts } = schema;

type GoogleConfig = { clientId: string; clientSecret: string; redirectUri: string };

type GoogleIdClaims = {
	iss: string;
	aud: string;
	sub: string;
	email?: string;
	email_verified?: boolean;
	name?: string;
	picture?: string;
};

/**
 * "Sign in with Google" (OpenID Connect, authorization-code flow).
 *
 * The id_token is received directly from Google's token endpoint over TLS, which
 * OIDC Core §3.1.3.7 allows in place of verifying its signature; we still check
 * iss and aud so a token minted for another app is rejected.
 */
export class GoogleOAuthService {
	constructor(
		private readonly db: Database,
		private readonly config: GoogleConfig,
	) {}

	get enabled() {
		return Boolean(this.config.clientId && this.config.clientSecret);
	}

	authorizationUrl(state: string): string {
		if (!this.enabled) throw unavailable("Google sign-in is not configured");
		const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
		url.search = new URLSearchParams({
			client_id: this.config.clientId,
			redirect_uri: this.config.redirectUri,
			response_type: "code",
			scope: "openid email profile",
			state,
			prompt: "select_account",
		}).toString();
		return url.toString();
	}

	/** Returns the SocialFly user for this Google account, creating or linking it as needed. */
	async signIn(code: string, clientId: string, meta: RequestMeta) {
		const claims = await this.exchange(code);
		if (!claims.email || !claims.email_verified) {
			throw new AppError(
				400,
				"google_email_unverified",
				"Your Google account has no verified email address",
			);
		}

		const [linked] = await this.db
			.select({ user: users })
			.from(authOauthAccounts)
			.innerJoin(users, eq(users.id, authOauthAccounts.userId))
			.where(
				and(
					eq(authOauthAccounts.provider, "google"),
					eq(authOauthAccounts.providerSubject, claims.sub),
				),
			)
			.limit(1);
		if (linked) {
			if (linked.user.status !== "active")
				throw new AppError(403, "account_disabled", "This account is disabled");
			return linked.user;
		}

		// Linking by email is safe ONLY because Google verified the address; an
		// unverified match would let anyone take over an account by email alone.
		return this.db.transaction(async (tx) => {
			const emailNormalized = normalizeEmail(claims.email as string);
			const [existing] = await tx
				.select()
				.from(users)
				.where(eq(users.emailNormalized, emailNormalized))
				.limit(1);

			const user =
				existing ??
				(
					await tx
						.insert(users)
						.values({
							email: claims.email as string,
							emailNormalized,
							name: claims.name ?? null,
							avatarUrl: claims.picture ?? null,
							emailVerifiedAt: new Date(),
						})
						.returning()
				)[0];
			if (!user) throw new Error("user insert returned no row");
			if (existing && !existing.emailVerifiedAt) {
				await tx
					.update(users)
					.set({ emailVerifiedAt: sql`now()` })
					.where(eq(users.id, existing.id));
			}

			await tx.insert(authOauthAccounts).values({
				userId: user.id,
				provider: "google",
				providerSubject: claims.sub,
				email: claims.email,
				profile: { name: claims.name, picture: claims.picture },
			});
			await audit(this.db, existing ? "oauth_link" : "oauth_register", {
				...meta,
				userId: user.id,
				clientId,
				metadata: { provider: "google" },
			});
			return user;
		});
	}

	private async exchange(code: string): Promise<GoogleIdClaims> {
		const res = await fetch("https://oauth2.googleapis.com/token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				code,
				client_id: this.config.clientId,
				client_secret: this.config.clientSecret,
				redirect_uri: this.config.redirectUri,
				grant_type: "authorization_code",
			}),
			signal: AbortSignal.timeout(10_000),
		}).catch((error) => {
			throw upstreamFailed("Google", error);
		});
		if (!res.ok)
			throw new AppError(400, "google_exchange_failed", "Google sign-in failed, please try again");

		const { id_token } = (await res.json()) as { id_token?: string };
		const payload = id_token?.split(".")[1];
		if (!payload) throw upstreamFailed("Google");
		const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as GoogleIdClaims;

		const validIssuer =
			claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
		if (!validIssuer || claims.aud !== this.config.clientId) {
			throw new AppError(
				400,
				"google_token_invalid",
				"Google returned a token for a different application",
			);
		}
		return claims;
	}
}
