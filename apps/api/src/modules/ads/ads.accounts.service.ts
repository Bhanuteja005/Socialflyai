import { apiEnv as env } from "@socialfly/config";
import type { TokenCipher } from "@socialfly/core/crypto";
import { AppError, badRequest, conflict, notFound } from "@socialfly/core/errors";
import type { Logger } from "@socialfly/core/logger";
import type { Redis } from "@socialfly/core/redis";
import { randomToken } from "@socialfly/core/security";
import { and, asc, type Database, eq, inArray, ne, schema, sql } from "@socialfly/db";
import {
	type AdAccount,
	type AdsContext,
	type AdsProvider,
	isProviderError,
	type TargetingOption,
	type TokenSet,
} from "@socialfly/integrations";
import {
	type AdsProviders,
	identityFields,
	identityMetadata,
	identityRequired,
} from "./ads.shared.ts";

const { adAccounts, adCampaigns, channels } = schema;

const STATE_TTL_SECONDS = 10 * 60;
const PENDING_TTL_SECONDS = 15 * 60;
/** Targeting searches per organization per minute: each is a platform read on the org's token. */
const TARGETING_PER_MINUTE = 30;
/** Refresh a token this close to expiry before using it for a read. */
const EXPIRY_MARGIN_MS = 60_000;
/** Campaigns in these states exist (or may exist) on the platform: the account cannot go. */
const LIVE_STATUSES = ["approved", "creating", "paused", "active", "unconfirmed"] as const;

type OAuthState = { orgId: string; userId: string; provider: string; codeVerifier?: string };
type Connected = { tokens: TokenSet & { tokenSecret?: string | null }; accounts: AdAccount[] };
/** Held in Redis between the callback and the admin choosing which ad accounts to add. */
type Pending = { orgId: string; userId: string; provider: string; sealed: string };

export type AdAccountRow = typeof adAccounts.$inferSelect;

/** The only shape an ad account leaves the API in — never with token columns. */
export const toAccountDto = (a: AdAccountRow) => ({
	id: a.id,
	provider: a.provider,
	name: a.name,
	currency: a.currency,
	timezone: a.timezone,
	status: a.status,
	metadata: identityMetadata(a.provider, a.metadata),
	lastError: a.lastError,
	identityRequired: identityRequired(a.provider, a.metadata),
	createdAt: a.createdAt.toISOString(),
});

/**
 * Ad account connections: OAuth (mirrors channels — single-use state in Redis, PKCE or
 * OAuth 1.0a request token carried as the verifier, tokens sealed with the token cipher
 * before they touch Redis or Postgres), choosing which ad accounts to add, the identity
 * each account's ads run as, and the targeting search.
 */
export class AdsAccountsService {
	constructor(
		private readonly db: Database,
		private readonly redis: Redis,
		/** Read at call time so tests can swap in a fake registry. */
		private readonly providers: () => AdsProviders,
		private readonly cipher: TokenCipher,
		private readonly logger: Logger,
	) {}

	listProviders() {
		return this.providers()
			.all()
			.map((p) => ({
				id: p.id,
				displayName: p.displayName,
				configured: p.isConfigured(),
				objectives: p.capabilities.objectives,
				formats: p.capabilities.formats,
				textLimits: p.capabilities.textLimits,
				minDailyBudgetUsd: p.capabilities.minDailyBudgetUsd,
			}));
	}

	private configured(id: string): AdsProvider {
		const provider = this.providers().get(id);
		if (!provider?.isConfigured())
			throw new AppError(404, "provider_unavailable", `${id} is not available`);
		return provider;
	}

	// ── OAuth connect ──────────────────────────────────────────────────────────

	static callbackUrl(provider: string) {
		return `${env.API_URL.replace(/\/+$/, "")}/ads/callback/${provider}`;
	}

	async startConnect(orgId: string, userId: string, providerId: string) {
		const provider = this.configured(providerId);
		const state = randomToken(32);
		const auth = await provider.getAuthorizationUrl({
			redirectUri: AdsAccountsService.callbackUrl(provider.id),
			state,
		});
		const payload: OAuthState = {
			orgId,
			userId,
			provider: provider.id,
			// PKCE verifier — or, for OAuth 1.0a (X Ads), the request token and its secret.
			codeVerifier: auth.codeVerifier,
		};
		await this.redis.set(
			`ads:oauth:state:${state}`,
			JSON.stringify(payload),
			"EX",
			STATE_TTL_SECONDS,
		);
		return { url: auth.url };
	}

	/**
	 * The platform's redirect back; returns where to send the browser. State is single-use
	 * (GETDEL): a replayed callback URL cannot connect twice. Accounts always go through the
	 * selection screen — one login often manages many ad accounts, and adding one that
	 * spends money should be a choice.
	 */
	async completeConnect(
		providerId: string,
		query: { code?: string; state?: string; error?: string; oauth_verifier?: string },
	): Promise<string> {
		const web = (params: Record<string, string>) => {
			const url = new URL("/ads/connect", env.WEB_URL);
			for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
			return url.toString();
		};
		const raw = query.state ? await this.redis.getdel(`ads:oauth:state:${query.state}`) : null;
		if (!raw) return web({ error: "connect_expired" });
		const state = JSON.parse(raw) as OAuthState;
		if (state.provider !== providerId) return web({ error: "connect_mismatch" });
		// OAuth 1.0a answers with oauth_verifier instead of code.
		const code = query.code ?? query.oauth_verifier;
		if (query.error || !code) return web({ error: "connect_denied", provider: providerId });

		try {
			const provider = this.configured(providerId);
			const result = await provider.exchangeCode({
				code,
				redirectUri: AdsAccountsService.callbackUrl(providerId),
				codeVerifier: state.codeVerifier,
			});
			if (result.accounts.length === 0) return web({ error: "no_accounts", provider: providerId });
			const key = randomToken(16);
			const pending: Pending = {
				orgId: state.orgId,
				userId: state.userId,
				provider: providerId,
				sealed: this.cipher.encrypt(JSON.stringify(result satisfies Connected)),
			};
			await this.redis.set(
				`ads:pending:${key}`,
				JSON.stringify(pending),
				"EX",
				PENDING_TTL_SECONDS,
			);
			return web({ pending: key, provider: providerId });
		} catch (error) {
			this.logger.warn({ err: error, provider: providerId }, "ad account connect failed");
			const code = isProviderError(error) ? `connect_${error.kind}` : "connect_failed";
			return web({ error: code, provider: providerId });
		}
	}

	private async loadPending(orgId: string, key: string) {
		const raw = await this.redis.get(`ads:pending:${key}`);
		if (!raw)
			throw new AppError(410, "connect_expired", "This connection expired — please connect again");
		const pending = JSON.parse(raw) as Pending;
		if (pending.orgId !== orgId) throw notFound("Connection");
		const result = JSON.parse(this.cipher.decrypt(pending.sealed)) as Connected;
		return { pending, result };
	}

	async getPending(orgId: string, key: string) {
		const { pending, result } = await this.loadPending(orgId, key);
		const existing = await this.db
			.select({ externalId: adAccounts.externalId })
			.from(adAccounts)
			.where(
				and(
					eq(adAccounts.organizationId, orgId),
					eq(adAccounts.provider, pending.provider),
					ne(adAccounts.status, "disconnected"),
				),
			);
		const connected = new Set(existing.map((e) => e.externalId));
		return {
			provider: pending.provider,
			accounts: result.accounts.map((a) => ({
				externalId: a.externalId,
				name: a.name,
				currency: a.currency,
				timezone: a.timezone,
				status: a.status,
				alreadyConnected: connected.has(a.externalId),
			})),
		};
	}

	async confirmAccounts(orgId: string, key: string, externalIds: string[]) {
		const { pending, result } = await this.loadPending(orgId, key);
		const chosen = result.accounts.filter((a) => externalIds.includes(a.externalId));
		if (chosen.length === 0) throw badRequest("Choose at least one ad account");
		const { tokens } = result;
		const expiresAt = tokens.expiresAt ? new Date(tokens.expiresAt) : null;
		const rows: AdAccountRow[] = [];
		for (const account of chosen) {
			const values = {
				name: account.name.slice(0, 200),
				currency: account.currency.toUpperCase(),
				timezone: account.timezone,
				status: account.status,
				accessTokenEnc: this.cipher.encrypt(tokens.accessToken),
				tokenSecretEnc: tokens.tokenSecret ? this.cipher.encrypt(tokens.tokenSecret) : null,
				refreshTokenEnc: tokens.refreshToken ? this.cipher.encrypt(tokens.refreshToken) : null,
				tokenExpiresAt: expiresAt,
				scopes: tokens.scopes,
				lastError: null,
				connectedBy: pending.userId,
			};
			const [row] = await this.db
				.insert(adAccounts)
				.values({
					organizationId: orgId,
					provider: pending.provider,
					externalId: account.externalId,
					metadata: account.metadata ?? {},
					...values,
				})
				.onConflictDoUpdate({
					target: [adAccounts.organizationId, adAccounts.provider, adAccounts.externalId],
					// Reconnecting refreshes what the platform reports but keeps the identity the
					// admin chose (a key the platform sends again wins, as it is current).
					set: {
						...values,
						metadata: sql`${adAccounts.metadata} || excluded.metadata`,
						updatedAt: sql`now()`,
					},
				})
				.returning();
			if (row) rows.push(row);
		}
		await this.redis.del(`ads:pending:${key}`);
		return rows.map(toAccountDto);
	}

	// ── accounts ────────────────────────────────────────────────────────────────

	async list(orgId: string) {
		const rows = await this.db
			.select()
			.from(adAccounts)
			.where(and(eq(adAccounts.organizationId, orgId), ne(adAccounts.status, "disconnected")))
			.orderBy(asc(adAccounts.provider), asc(adAccounts.name), asc(adAccounts.id));
		return rows.map(toAccountDto);
	}

	/** An ad account of the organization that is still connected; 404 otherwise. */
	async row(orgId: string, id: string): Promise<AdAccountRow> {
		const [row] = await this.db
			.select()
			.from(adAccounts)
			.where(
				and(
					eq(adAccounts.id, id),
					eq(adAccounts.organizationId, orgId),
					ne(adAccounts.status, "disconnected"),
				),
			)
			.limit(1);
		if (!row) throw notFound("Ad account");
		return row;
	}

	async updateMetadata(orgId: string, id: string, input: Record<string, string | null>) {
		const account = await this.row(orgId, id);
		const fields = new Map(identityFields(account.provider).map((f) => [f.key, f]));
		const invalid: string[] = [];
		const next: Record<string, unknown> = { ...account.metadata };
		for (const [key, value] of Object.entries(input)) {
			const field = fields.get(key);
			if (!field) {
				invalid.push(`${key} cannot be set for this platform`);
				continue;
			}
			if (value === null || value === "") {
				delete next[key];
				continue;
			}
			if (
				(field.pattern && !field.pattern.test(value)) ||
				(field.values && !field.values.includes(value))
			) {
				invalid.push(`${field.label}: "${value}" is not a valid value`);
				continue;
			}
			next[key] = value;
		}
		if (invalid.length)
			throw new AppError(422, "invalid_metadata", "Some fields could not be saved", {
				problems: invalid,
			});
		const [row] = await this.db
			.update(adAccounts)
			.set({ metadata: next })
			.where(eq(adAccounts.id, account.id))
			.returning();
		return toAccountDto(row as AdAccountRow);
	}

	/**
	 * Disconnect keeps the row (campaign history references it) but wipes the tokens. Not
	 * while a campaign on it exists or may exist on the platform: that campaign could be
	 * spending, and without the connection SocialFly could no longer pause it.
	 */
	async disconnect(orgId: string, id: string) {
		const account = await this.row(orgId, id);
		const [live] = await this.db
			.select({ id: adCampaigns.id })
			.from(adCampaigns)
			.where(
				and(
					eq(adCampaigns.adAccountId, account.id),
					inArray(adCampaigns.status, [...LIVE_STATUSES]),
				),
			)
			.limit(1);
		if (live)
			throw conflict(
				"This ad account has campaigns that were created on the platform — archive them first",
				"ad_account_in_use",
			);
		await this.db
			.update(adAccounts)
			.set({
				status: "disconnected",
				accessTokenEnc: "",
				tokenSecretEnc: null,
				refreshTokenEnc: null,
				tokenExpiresAt: null,
			})
			.where(eq(adAccounts.id, account.id));
	}

	// ── identities & targeting ──────────────────────────────────────────────────

	/**
	 * Choices for each identity field. Meta pages and Instagram accounts come from what the
	 * platform listed at connect time plus the organization's connected Facebook/Instagram
	 * channels; LinkedIn company pages from its linkedin_page channels. Everything else is
	 * entered by hand (`options: null`): the ads contract has no identity listing call, and
	 * those ids are shown in each platform's ads manager.
	 */
	async identities(orgId: string, id: string) {
		const account = await this.row(orgId, id);
		const current = identityMetadata(account.provider, account.metadata);
		const orgChannels = await this.db
			.select({ provider: channels.provider, externalId: channels.externalId, name: channels.name })
			.from(channels)
			.where(and(eq(channels.organizationId, orgId), ne(channels.status, "disconnected")))
			.orderBy(asc(channels.name));
		const fromPlatform = Array.isArray(account.metadata.availablePages)
			? (account.metadata.availablePages as {
					id?: unknown;
					name?: unknown;
					instagramUserId?: unknown;
				}[])
			: [];

		const options = (key: string): { value: string; label: string }[] | null => {
			const seen = new Map<string, string>();
			const add = (value: unknown, label: unknown) => {
				if (typeof value === "string" && value && !seen.has(value))
					seen.set(value, typeof label === "string" && label ? label : value);
			};
			if (account.provider === "meta_ads" && key === "pageId") {
				for (const p of fromPlatform) add(p.id, p.name);
				for (const c of orgChannels) if (c.provider === "facebook") add(c.externalId, c.name);
			} else if (account.provider === "meta_ads" && key === "instagramUserId") {
				for (const p of fromPlatform)
					add(p.instagramUserId, typeof p.name === "string" ? `Instagram of ${p.name}` : null);
				for (const c of orgChannels) if (c.provider === "instagram") add(c.externalId, c.name);
			} else if (account.provider === "linkedin_ads" && key === "organizationUrn") {
				for (const c of orgChannels)
					if (c.provider === "linkedin_page") add(`urn:li:organization:${c.externalId}`, c.name);
			} else {
				return null;
			}
			return [...seen].map(([value, label]) => ({ value, label }));
		};

		return {
			fields: identityFields(account.provider).map((f) => ({
				key: f.key,
				label: f.label,
				required: f.required,
				hint: f.hint ?? null,
				value: current[f.key] ?? null,
				options: f.values ? f.values.map((v) => ({ value: v, label: v })) : options(f.key),
			})),
		};
	}

	/** Interest / location / job-title search for the targeting picker. Rate limited per org. */
	async searchTargeting(
		orgId: string,
		id: string,
		input: { type: TargetingOption["type"]; q: string },
	): Promise<TargetingOption[]> {
		const account = await this.row(orgId, id);
		const provider = this.configured(account.provider);
		if (!provider.searchTargeting) return [];
		const window = Math.floor(Date.now() / 60_000);
		const key = `ads:targeting:${orgId}:${window}`;
		const count = await this.redis.incr(key);
		if (count === 1) await this.redis.expire(key, 60);
		if (count > TARGETING_PER_MINUTE) {
			throw new AppError(429, "rate_limited", "Too many targeting searches — wait a moment", {
				retryAfterSeconds: 60 - Math.floor((Date.now() / 1000) % 60),
			});
		}
		const search = provider.searchTargeting.bind(provider);
		try {
			const ctx = await this.context(account, provider);
			return await search(ctx, { type: input.type, query: input.q, limit: 25 });
		} catch (error) {
			throw toAdsAppError(error);
		}
	}

	/**
	 * A context for a read made on the request path. A token about to expire is refreshed
	 * under a row lock, the same rule as the worker's AdTokens (platforms that rotate refresh
	 * tokens would otherwise race).
	 */
	private async context(account: AdAccountRow, provider: AdsProvider): Promise<AdsContext> {
		if (account.status !== "active")
			throw new AppError(409, "ad_account_unavailable", `The ad account is ${account.status}`);
		const token = await this.db.transaction(async (tx) => {
			const [row] = await tx
				.select()
				.from(adAccounts)
				.where(eq(adAccounts.id, account.id))
				.for("update");
			if (!row) throw notFound("Ad account");
			const expiring =
				row.tokenExpiresAt !== null && row.tokenExpiresAt.getTime() - Date.now() < EXPIRY_MARGIN_MS;
			if (!expiring || !row.refreshTokenEnc || !provider.refreshTokens)
				return this.cipher.decrypt(row.accessTokenEnc);
			const tokens = await provider.refreshTokens(this.cipher.decrypt(row.refreshTokenEnc));
			await tx
				.update(adAccounts)
				.set({
					accessTokenEnc: this.cipher.encrypt(tokens.accessToken),
					refreshTokenEnc: tokens.refreshToken
						? this.cipher.encrypt(tokens.refreshToken)
						: row.refreshTokenEnc,
					tokenExpiresAt: tokens.expiresAt ? new Date(tokens.expiresAt) : null,
				})
				.where(eq(adAccounts.id, row.id));
			return tokens.accessToken;
		});
		return {
			accountExternalId: account.externalId,
			accessToken: token,
			accessTokenSecret: account.tokenSecretEnc
				? this.cipher.decrypt(account.tokenSecretEnc)
				: null,
			currency: account.currency,
			metadata: account.metadata,
			logger: this.logger.child({ adAccountId: account.id }),
		};
	}
}

/** Platform errors on a read the user is waiting for → what the UI can act on. */
export function toAdsAppError(error: unknown): unknown {
	if (!isProviderError(error)) return error;
	switch (error.kind) {
		case "auth":
			return new AppError(
				409,
				"ad_account_needs_reauth",
				"The platform refused access — reconnect the ad account",
			);
		case "rate_limited":
			return new AppError(429, "rate_limited", "The platform is busy — try again in a minute", {
				retryAfterSeconds: Math.ceil((error.details.retryAfterMs ?? 60_000) / 1000),
			});
		case "invalid_request":
			return new AppError(422, "provider_rejected", error.message);
		default:
			return new AppError(502, "provider_error", "The platform did not answer — try again");
	}
}
