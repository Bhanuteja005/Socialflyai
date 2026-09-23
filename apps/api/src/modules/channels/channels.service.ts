import { apiEnv as env } from "@socialfly/config";
import type { TokenCipher } from "@socialfly/core/crypto";
import { AppError, badRequest, notFound } from "@socialfly/core/errors";
import type { Logger } from "@socialfly/core/logger";
import type { Redis } from "@socialfly/core/redis";
import { randomToken } from "@socialfly/core/security";
import { and, asc, type Database, eq, inArray, ne, schema, sql } from "@socialfly/db";
import {
	type DiscoveredAccount,
	isProviderError,
	type ProviderRegistry,
	type SocialProvider,
	type TokenSet,
} from "@socialfly/integrations";
import type { JobProducer } from "@socialfly/queue";

const { channels, postTargets } = schema;

const STATE_TTL_SECONDS = 10 * 60;
const SELECTION_TTL_SECONDS = 15 * 60;

type OAuthState = { orgId: string; userId: string; provider: string; codeVerifier?: string };

/** Held in Redis between the OAuth callback and the user choosing which pages to add. */
type PendingSelection = {
	orgId: string;
	userId: string;
	provider: string;
	/** Sealed with the token cipher — raw platform tokens never sit in Redis in clear text. */
	sealed: string;
};

type ChannelRow = typeof channels.$inferSelect;

export class ChannelsService {
	constructor(
		private readonly db: Database,
		private readonly redis: Redis,
		private readonly providers: ProviderRegistry,
		private readonly cipher: TokenCipher,
		private readonly jobs: JobProducer,
		private readonly logger: Logger,
	) {}

	/** Platforms the "connect" screen offers, with limits the composer validates against. */
	listProviders() {
		return this.providers.available().map((p) => ({
			id: p.id,
			name: p.displayName,
			capabilities: p.capabilities,
		}));
	}

	async list(orgId: string) {
		const rows = await this.db
			.select()
			.from(channels)
			.where(and(eq(channels.organizationId, orgId), ne(channels.status, "disconnected")))
			.orderBy(asc(channels.provider), asc(channels.name));
		return rows.map(toChannelDto);
	}

	// ── OAuth connect ──────────────────────────────────────────────────────────

	static callbackUrl(provider: string) {
		return `${env.API_URL.replace(/\/+$/, "")}/channels/callback/${provider}`;
	}

	async startConnect(orgId: string, userId: string, providerId: string) {
		const provider = this.configuredProvider(providerId);
		const state = randomToken(32);
		const auth = await provider.getAuthorizationUrl({
			redirectUri: ChannelsService.callbackUrl(provider.id),
			state,
		});
		const payload: OAuthState = {
			orgId,
			userId,
			provider: provider.id,
			codeVerifier: auth.codeVerifier,
		};
		await this.redis.set(`oauth:state:${state}`, JSON.stringify(payload), "EX", STATE_TTL_SECONDS);
		return { url: auth.url };
	}

	/**
	 * Handles the platform's redirect back. Returns where to send the browser.
	 * State is single-use (GETDEL): a replayed callback URL cannot connect twice.
	 */
	async completeConnect(
		providerId: string,
		query: { code?: string; state?: string; error?: string },
	): Promise<string> {
		const web = (path: string, params: Record<string, string>) => {
			const url = new URL(path, env.WEB_URL);
			for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
			return url.toString();
		};

		const raw = query.state ? await this.redis.getdel(`oauth:state:${query.state}`) : null;
		if (!raw) return web("/channels", { error: "connect_expired" });
		const state = JSON.parse(raw) as OAuthState;
		if (state.provider !== providerId) return web("/channels", { error: "connect_mismatch" });
		if (query.error || !query.code) return web("/channels", { error: "connect_denied" });

		try {
			const provider = this.configuredProvider(providerId);
			const result = await provider.exchangeCode({
				code: query.code,
				redirectUri: ChannelsService.callbackUrl(providerId),
				codeVerifier: state.codeVerifier,
			});
			if (result.accounts.length === 0)
				return web("/channels", { error: "no_accounts", provider: providerId });

			if (result.accounts.length === 1) {
				await this.upsertChannels(
					state.orgId,
					state.userId,
					provider,
					result.tokens,
					result.accounts,
				);
				return web("/channels", { connected: providerId });
			}

			const selectionId = randomToken(16);
			const pending: PendingSelection = {
				orgId: state.orgId,
				userId: state.userId,
				provider: providerId,
				sealed: this.cipher.encrypt(JSON.stringify(result)),
			};
			await this.redis.set(
				`oauth:selection:${selectionId}`,
				JSON.stringify(pending),
				"EX",
				SELECTION_TTL_SECONDS,
			);
			return web("/channels/select", { selection: selectionId });
		} catch (error) {
			this.logger.warn({ err: error, provider: providerId }, "channel connect failed");
			const code = isProviderError(error) ? `connect_${error.kind}` : "connect_failed";
			return web("/channels", { error: code, provider: providerId });
		}
	}

	async getSelection(orgId: string, selectionId: string) {
		const { pending, result } = await this.loadSelection(orgId, selectionId);
		const existing = await this.db
			.select({ externalId: channels.externalId })
			.from(channels)
			.where(
				and(
					eq(channels.organizationId, orgId),
					eq(channels.provider, pending.provider),
					ne(channels.status, "disconnected"),
				),
			);
		const connected = new Set(existing.map((e) => e.externalId));
		return {
			provider: pending.provider,
			accounts: result.accounts.map((a) => ({
				externalId: a.externalId,
				name: a.name,
				username: a.username ?? null,
				avatarUrl: a.avatarUrl ?? null,
				alreadyConnected: connected.has(a.externalId),
			})),
		};
	}

	async confirmSelection(orgId: string, selectionId: string, externalIds: string[]) {
		const { pending, result } = await this.loadSelection(orgId, selectionId);
		const chosen = result.accounts.filter((a) => externalIds.includes(a.externalId));
		if (chosen.length === 0) throw badRequest("Choose at least one account");
		const provider = this.configuredProvider(pending.provider);
		const created = await this.upsertChannels(
			orgId,
			pending.userId,
			provider,
			result.tokens,
			chosen,
		);
		await this.redis.del(`oauth:selection:${selectionId}`);
		return created;
	}

	/**
	 * Disconnect keeps the row (post history references it) but wipes the tokens
	 * and cancels anything still scheduled on it.
	 */
	async disconnect(orgId: string, channelId: string) {
		await this.db.transaction(async (tx) => {
			const [row] = await tx
				.update(channels)
				.set({
					status: "disconnected",
					accessTokenEnc: "",
					refreshTokenEnc: null,
					tokenExpiresAt: null,
				})
				.where(and(eq(channels.id, channelId), eq(channels.organizationId, orgId)))
				.returning({ id: channels.id });
			if (!row) throw notFound("Channel");
			await tx
				.update(postTargets)
				.set({
					status: "canceled",
					errorCode: "channel_disconnected",
					errorMessage: "The channel was disconnected",
				})
				.where(
					and(
						eq(postTargets.channelId, channelId),
						inArray(postTargets.status, ["scheduled", "queued"]),
					),
				);
		});
	}

	// ── internals ──────────────────────────────────────────────────────────────

	private configuredProvider(id: string): SocialProvider {
		const provider = this.providers.get(id);
		if (!provider?.isConfigured())
			throw new AppError(404, "provider_unavailable", `${id} is not available`);
		return provider;
	}

	private async loadSelection(orgId: string, selectionId: string) {
		const raw = await this.redis.get(`oauth:selection:${selectionId}`);
		if (!raw)
			throw new AppError(
				410,
				"selection_expired",
				"This connection expired — please connect again",
			);
		const pending = JSON.parse(raw) as PendingSelection;
		if (pending.orgId !== orgId) throw notFound("Selection");
		const result = JSON.parse(this.cipher.decrypt(pending.sealed)) as {
			tokens: TokenSet;
			accounts: DiscoveredAccount[];
		};
		return { pending, result };
	}

	private async upsertChannels(
		orgId: string,
		userId: string,
		provider: SocialProvider,
		connectionTokens: TokenSet,
		accounts: DiscoveredAccount[],
	) {
		const rows: ChannelRow[] = [];
		for (const account of accounts) {
			const tokens = account.tokens ?? connectionTokens;
			const expiresAt = tokens.expiresAt ? new Date(tokens.expiresAt) : null;
			const values = {
				name: account.name,
				username: account.username ?? null,
				avatarUrl: account.avatarUrl ?? null,
				profileUrl: account.profileUrl ?? null,
				accessTokenEnc: this.cipher.encrypt(tokens.accessToken),
				refreshTokenEnc: tokens.refreshToken ? this.cipher.encrypt(tokens.refreshToken) : null,
				tokenExpiresAt: expiresAt,
				scopes: tokens.scopes,
				status: "active" as const,
				metadata: account.metadata ?? {},
				lastError: null,
				connectedBy: userId,
			};
			const [row] = await this.db
				.insert(channels)
				.values({
					organizationId: orgId,
					provider: provider.id,
					externalId: account.externalId,
					...values,
				})
				.onConflictDoUpdate({
					target: [channels.organizationId, channels.provider, channels.externalId],
					set: { ...values, updatedAt: sql`now()` },
				})
				.returning();
			if (!row) continue;
			rows.push(row);
			if (row.refreshTokenEnc && expiresAt) {
				await this.jobs.scheduleTokenRefresh({ channelId: row.id }, expiresAt);
			}
		}
		return rows.map(toChannelDto);
	}
}

/** The only shape a channel leaves the API in — never with token columns. */
export const toChannelDto = (c: ChannelRow) => ({
	id: c.id,
	provider: c.provider,
	externalId: c.externalId,
	name: c.name,
	username: c.username,
	avatarUrl: c.avatarUrl,
	profileUrl: c.profileUrl,
	status: c.status,
	lastError: c.lastError,
	tokenExpiresAt: c.tokenExpiresAt?.toISOString() ?? null,
	createdAt: c.createdAt.toISOString(),
});
