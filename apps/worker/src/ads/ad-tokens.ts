import type { TokenCipher } from "@socialfly/core/crypto";
import type { Logger } from "@socialfly/core/logger";
import { type Database, eq, schema } from "@socialfly/db";
import { type AdsContext, isProviderError } from "@socialfly/integrations";
import type { AdsProviders } from "./providers.ts";

const { adAccounts } = schema;

/** Refresh when the token has less than this left, so it cannot expire mid-creation. */
const EXPIRY_MARGIN_MS = 5 * 60_000;

/** The platform revoked access (or it expired without a refresh token): the user reconnects. */
export class AdAccountNeedsReauthError extends Error {
	override readonly name = "AdAccountNeedsReauthError";
}

/** The account is disconnected, disabled or pending on the platform: nothing to refresh. */
export class AdAccountUnavailableError extends Error {
	override readonly name = "AdAccountUnavailableError";
}

type Outcome = { ctx: Omit<AdsContext, "logger"> } | { reauth: string } | { unavailable: string };

/**
 * Hands out an AdsContext (identity + fresh token) for an ad account — ChannelTokens for
 * ad accounts. Refresh runs under a row lock (SELECT … FOR UPDATE) for the same reason:
 * platforms that rotate refresh tokens would leave a concurrent refresher holding a dead
 * one. The second caller waits, then reuses the token the first one stored.
 */
export class AdTokens {
	constructor(
		private readonly db: Database,
		private readonly providers: AdsProviders,
		private readonly cipher: TokenCipher,
		private readonly logger: Logger,
	) {}

	async context(adAccountId: string, opts: { forceRefresh?: boolean } = {}): Promise<AdsContext> {
		// Returns rather than throws inside the transaction: a throw would roll back a
		// successful refresh, and "needs reauth" is recorded after commit.
		const outcome = await this.db.transaction(async (tx): Promise<Outcome> => {
			const [account] = await tx
				.select()
				.from(adAccounts)
				.where(eq(adAccounts.id, adAccountId))
				.for("update");
			if (!account) return { unavailable: "The ad account no longer exists" };
			if (account.status === "needs_reauth")
				return { unavailable: "The ad account needs to be reconnected" };
			if (account.status !== "active")
				return { unavailable: `The ad account is ${account.status}` };

			const base = {
				accountExternalId: account.externalId,
				accessTokenSecret: account.tokenSecretEnc
					? this.cipher.decrypt(account.tokenSecretEnc)
					: null,
				currency: account.currency,
				metadata: account.metadata,
			};
			const expiring =
				account.tokenExpiresAt !== null &&
				account.tokenExpiresAt.getTime() - Date.now() < EXPIRY_MARGIN_MS;
			if (!opts.forceRefresh && !expiring)
				return { ctx: { ...base, accessToken: this.cipher.decrypt(account.accessTokenEnc) } };

			const provider = this.providers.get(account.provider);
			if (!account.refreshTokenEnc || !provider?.refreshTokens) {
				return expiring
					? { reauth: "Access to the ad account expired — reconnect it" }
					: { ctx: { ...base, accessToken: this.cipher.decrypt(account.accessTokenEnc) } };
			}

			try {
				const tokens = await provider.refreshTokens(this.cipher.decrypt(account.refreshTokenEnc));
				await tx
					.update(adAccounts)
					.set({
						accessTokenEnc: this.cipher.encrypt(tokens.accessToken),
						// Keep the old refresh token when the platform does not rotate it.
						refreshTokenEnc: tokens.refreshToken
							? this.cipher.encrypt(tokens.refreshToken)
							: account.refreshTokenEnc,
						tokenExpiresAt: tokens.expiresAt ? new Date(tokens.expiresAt) : null,
						lastError: null,
					})
					.where(eq(adAccounts.id, adAccountId));
				this.logger.info({ adAccountId, provider: account.provider }, "ad account token refreshed");
				return { ctx: { ...base, accessToken: tokens.accessToken } };
			} catch (error) {
				if (isProviderError(error) && error.kind === "auth")
					return { reauth: "The platform revoked access — reconnect this ad account" };
				throw error; // transient: the caller's retry policy decides
			}
		});

		if ("ctx" in outcome) return { ...outcome.ctx, logger: this.logger.child({ adAccountId }) };
		if ("unavailable" in outcome) throw new AdAccountUnavailableError(outcome.unavailable);
		await this.db
			.update(adAccounts)
			.set({ status: "needs_reauth", lastError: outcome.reauth })
			.where(eq(adAccounts.id, adAccountId));
		throw new AdAccountNeedsReauthError(outcome.reauth);
	}
}
