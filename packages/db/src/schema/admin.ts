import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { createdAt, id } from "./columns";

/**
 * Append-only record of every change made from the internal admin console. Staff act
 * across tenants, so "who changed this org's budget / disabled this user, and when" must
 * be answerable without trawling logs. Written in the same transaction as the change it
 * describes, so a change can never exist without its audit row.
 */
export const adminAuditEvents = pgTable(
	"admin_audit_events",
	{
		id: id(),
		// set null (not cascade): deleting a staff account must not erase what they did.
		actorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
		/** Dotted verb, e.g. "user.disable", "organization.ai_budget.update". */
		action: text().notNull(),
		targetType: text().notNull(),
		targetId: text().notNull(),
		/** Before/after values — never secrets. */
		data: jsonb().$type<Record<string, unknown>>().notNull().default({}),
		createdAt: createdAt(),
	},
	(t) => [
		index("admin_audit_events_actor_idx").on(t.actorUserId),
		index("admin_audit_events_target_idx").on(t.targetType, t.targetId),
	],
);
