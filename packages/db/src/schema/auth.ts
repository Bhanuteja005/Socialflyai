import { sql } from "drizzle-orm";
import {
	index,
	inet,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, timestamps } from "./columns";

// Identity tables, owned by apps/auth. Other services read `users` for display
// data but never write here.

export const userStatus = pgEnum("user_status", ["active", "disabled"]);

/**
 * SocialFly staff access to the internal admin console (apps/admin). Separate from
 * organization roles: a platform admin sees across tenants, an org owner never does.
 * Granted only from the CLI (`bun run cli admin grant <email>`), never via the API.
 */
export const platformRole = pgEnum("platform_role", ["user", "admin"]);

export const users = pgTable(
	"users",
	{
		id: id(),
		email: text().notNull(),
		emailNormalized: text().notNull(),
		/** Null for accounts that only ever signed in with Google. */
		passwordHash: text(),
		name: text(),
		avatarUrl: text(),
		emailVerifiedAt: timestamp({ withTimezone: true }),
		status: userStatus().notNull().default("active"),
		/** Bumped on password change/reset: every outstanding access token becomes invalid. */
		tokenVersion: integer().notNull().default(1),
		platformRole: platformRole().notNull().default("user"),
		lastLoginAt: timestamp({ withTimezone: true }),
		...timestamps(),
	},
	(t) => [uniqueIndex("users_email_normalized_uq").on(t.emailNormalized)],
);

export const authSessions = pgTable(
	"auth_sessions",
	{
		id: id(),
		userId: uuid()
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		clientId: text().notNull(),
		refreshTokenHash: text().notNull(),
		/**
		 * The hash this session's refresh token had BEFORE its last rotation. If a
		 * request ever presents it again, the token was stolen and replayed (the
		 * legitimate client already holds the newer one) — every session of the user
		 * is revoked. This is the refresh-token reuse detection the reference auth lacked.
		 */
		previousRefreshTokenHash: text(),
		userAgent: text(),
		ip: inet(),
		expiresAt: timestamp({ withTimezone: true }).notNull(),
		lastUsedAt: timestamp({ withTimezone: true }),
		revokedAt: timestamp({ withTimezone: true }),
		revokedReason: text(),
		...timestamps(),
	},
	(t) => [
		uniqueIndex("auth_sessions_refresh_hash_uq").on(t.refreshTokenHash),
		index("auth_sessions_prev_refresh_hash_idx")
			.on(t.previousRefreshTokenHash)
			.where(sql`${t.previousRefreshTokenHash} is not null`),
		index("auth_sessions_user_idx").on(t.userId),
	],
);

export const authOauthAccounts = pgTable(
	"auth_oauth_accounts",
	{
		id: id(),
		userId: uuid()
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		provider: text().notNull(),
		providerSubject: text().notNull(),
		email: text(),
		profile: jsonb().$type<Record<string, unknown>>(),
		...timestamps(),
	},
	(t) => [uniqueIndex("auth_oauth_provider_subject_uq").on(t.provider, t.providerSubject)],
);

export const emailTokenType = pgEnum("email_token_type", ["verification", "recovery"]);

export const authEmailTokens = pgTable(
	"auth_email_tokens",
	{
		id: id(),
		userId: uuid()
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		type: emailTokenType().notNull(),
		tokenHash: text().notNull(),
		expiresAt: timestamp({ withTimezone: true }).notNull(),
		usedAt: timestamp({ withTimezone: true }),
		createdAt: createdAt(),
	},
	(t) => [uniqueIndex("auth_email_tokens_hash_uq").on(t.tokenHash)],
);

/** Machine clients (worker, CLI, integrations) using the client-credentials grant. */
export const serviceClients = pgTable(
	"service_clients",
	{
		id: id(),
		clientId: text().notNull(),
		name: text().notNull(),
		secretHash: text().notNull(),
		scopes: text().array().notNull().default(sql`'{}'::text[]`),
		disabledAt: timestamp({ withTimezone: true }),
		...timestamps(),
	},
	(t) => [uniqueIndex("service_clients_client_id_uq").on(t.clientId)],
);

export const authAuditEvents = pgTable(
	"auth_audit_events",
	{
		id: id(),
		userId: uuid().references(() => users.id, { onDelete: "set null" }),
		clientId: text(),
		event: text().notNull(),
		ip: inet(),
		userAgent: text(),
		metadata: jsonb().$type<Record<string, unknown>>(),
		createdAt: createdAt(),
	},
	(t) => [index("auth_audit_user_created_idx").on(t.userId, t.createdAt)],
);
