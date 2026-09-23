import type { TokenCipher } from "@socialfly/core/crypto";
import type { Logger } from "@socialfly/core/logger";
import { type Database, eq, schema } from "@socialfly/db";
import { isProviderError, type ProviderRegistry } from "@socialfly/integrations";

const { channels } = schema;

/** Refresh when the token has less than this left, so it cannot expire mid-upload. */
const EXPIRY_MARGIN_MS = 5 * 60_000;

export class ChannelNeedsReauthError extends Error {
	override readonly name = "ChannelNeedsReauthError";
}

type Outcome = { token: string } | { reauth: string };

/**
 * Hands out a usable access token for a channel, refreshing it when needed.
 *
 * Refresh runs under a row lock (SELECT ... FOR UPDATE). Several platforms rotate
 * refresh tokens (X invalidates the old one on use): two workers refreshing the
 * same channel concurrently would leave one holding a dead token and could get
 * the grant revoked. The lock makes the second caller wait, then reuse the fresh
 * token the first one stored.
 */
export class ChannelTokens {
	constructor(
		private readonly db: Database,
		private readonly providers: ProviderRegistry,
		private readonly cipher: TokenCipher,
		private readonly logger: Logger,
	) {}

	async getAccessToken(channelId: string, opts: { forceRefresh?: boolean } = {}): Promise<string> {
		// The transaction RETURNS the outcome rather than throwing: a throw would roll
		// back a successful refresh, and "needs reauth" must be recorded after commit.
		const outcome = await this.db.transaction(async (tx): Promise<Outcome> => {
			const [channel] = await tx
				.select()
				.from(channels)
				.where(eq(channels.id, channelId))
				.for("update");
			if (!channel) return { reauth: "Channel no longer exists" };
			if (channel.status !== "active") return { reauth: `Channel is ${channel.status}` };

			const expiring =
				channel.tokenExpiresAt !== null &&
				channel.tokenExpiresAt.getTime() - Date.now() < EXPIRY_MARGIN_MS;
			if (!opts.forceRefresh && !expiring)
				return { token: this.cipher.decrypt(channel.accessTokenEnc) };

			const provider = this.providers.require(channel.provider);
			if (!channel.refreshTokenEnc || !provider.refreshTokens) {
				return expiring
					? {
							reauth:
								"Access expired and this platform does not support refresh — reconnect the channel",
						}
					: { token: this.cipher.decrypt(channel.accessTokenEnc) };
			}

			try {
				const tokens = await provider.refreshTokens(this.cipher.decrypt(channel.refreshTokenEnc));
				await tx
					.update(channels)
					.set({
						accessTokenEnc: this.cipher.encrypt(tokens.accessToken),
						// Keep the old refresh token when the platform doesn't rotate it.
						refreshTokenEnc: tokens.refreshToken
							? this.cipher.encrypt(tokens.refreshToken)
							: channel.refreshTokenEnc,
						tokenExpiresAt: tokens.expiresAt ? new Date(tokens.expiresAt) : null,
						lastError: null,
					})
					.where(eq(channels.id, channelId));
				this.logger.info({ channelId, provider: channel.provider }, "channel token refreshed");
				return { token: tokens.accessToken };
			} catch (error) {
				if (isProviderError(error) && error.kind === "auth") {
					return { reauth: "The platform revoked access — reconnect this channel" };
				}
				throw error; // transient: the caller's retry policy decides
			}
		});

		if ("token" in outcome) return outcome.token;
		await this.markNeedsReauth(channelId, outcome.reauth);
		throw new ChannelNeedsReauthError(outcome.reauth);
	}

	async markNeedsReauth(channelId: string, reason: string) {
		await this.db
			.update(channels)
			.set({ status: "needs_reauth", lastError: reason })
			.where(eq(channels.id, channelId));
	}
}
