import { sql } from "drizzle-orm";
import {
	index,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { id, timestamps } from "./columns";
import { organizations } from "./organizations";

/**
 * A channel is one connected publishing destination: a LinkedIn profile, a
 * LinkedIn page, a Facebook page, an Instagram business account, a subreddit
 * identity, a YouTube channel...
 *
 * `provider` is free text validated against the integration registry rather than a
 * Postgres enum, so adding a platform is a code change, not a migration.
 */
export const channelStatus = pgEnum("channel_status", [
	"active",
	/** Token expired/revoked or scopes missing — the user must reconnect. */
	"needs_reauth",
	/** Removed by the user; kept for post history. */
	"disconnected",
]);

export const channels = pgTable(
	"channels",
	{
		id: id(),
		organizationId: uuid()
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		provider: text().notNull(),
		/** The platform's id for this account/page. */
		externalId: text().notNull(),
		name: text().notNull(),
		username: text(),
		avatarUrl: text(),
		profileUrl: text(),
		/** AES-256-GCM sealed (see @socialfly/core/crypto). Never select into API responses. */
		accessTokenEnc: text().notNull(),
		refreshTokenEnc: text(),
		tokenExpiresAt: timestamp({ withTimezone: true }),
		scopes: text().array().notNull().default(sql`'{}'::text[]`),
		status: channelStatus().notNull().default("active"),
		/** Provider-specific extras (e.g. the parent page id of an IG account). */
		metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
		lastError: text(),
		connectedBy: uuid().references(() => users.id, { onDelete: "set null" }),
		...timestamps(),
	},
	(t) => [
		uniqueIndex("channels_org_provider_external_uq").on(t.organizationId, t.provider, t.externalId),
		index("channels_token_expiry_idx")
			.on(t.tokenExpiresAt)
			.where(sql`${t.status} = 'active' and ${t.refreshTokenEnc} is not null`),
	],
);
