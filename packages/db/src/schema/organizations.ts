import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { createdAt, id, timestamps } from "./columns";

/** Every tenant-owned row carries organization_id; every query filters on it. */
export const organizations = pgTable(
	"organizations",
	{
		id: id(),
		name: text().notNull(),
		slug: text().notNull(),
		/** IANA zone used for the calendar and "best time" defaults. */
		timezone: text().notNull().default("UTC"),
		createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
		deletedAt: timestamp({ withTimezone: true }),
		...timestamps(),
	},
	(t) => [uniqueIndex("organizations_slug_uq").on(t.slug)],
);

/**
 * owner  — everything, incl. billing and deleting the organization
 * admin  — members, channels, settings
 * editor — create/schedule/publish content
 * viewer — read-only
 */
export const memberRole = pgEnum("member_role", ["owner", "admin", "editor", "viewer"]);

export const memberships = pgTable(
	"memberships",
	{
		id: id(),
		organizationId: uuid()
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		userId: uuid()
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		role: memberRole().notNull(),
		...timestamps(),
	},
	(t) => [
		uniqueIndex("memberships_org_user_uq").on(t.organizationId, t.userId),
		index("memberships_user_idx").on(t.userId),
	],
);

export const invitations = pgTable(
	"invitations",
	{
		id: id(),
		organizationId: uuid()
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		emailNormalized: text().notNull(),
		role: memberRole().notNull(),
		tokenHash: text().notNull(),
		invitedBy: uuid().references(() => users.id, { onDelete: "set null" }),
		expiresAt: timestamp({ withTimezone: true }).notNull(),
		acceptedAt: timestamp({ withTimezone: true }),
		revokedAt: timestamp({ withTimezone: true }),
		createdAt: createdAt(),
	},
	(t) => [
		uniqueIndex("invitations_token_hash_uq").on(t.tokenHash),
		// One open invitation per email per organization.
		uniqueIndex("invitations_open_uq")
			.on(t.organizationId, t.emailNormalized)
			.where(sql`${t.acceptedAt} is null and ${t.revokedAt} is null`),
	],
);
