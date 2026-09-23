import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { channels } from "./channels";
import { createdAt, id, timestamps } from "./columns";
import { organizations } from "./organizations";
import { postTargets } from "./posts";

/**
 * The engagement inbox: comments on our posts, replies in their threads, public
 * mentions, and discussions found by keyword listening — one row per platform
 * item, deduplicated per channel.
 */
export const engagementKind = pgEnum("engagement_kind", [
	"comment",
	"reply",
	"mention",
	"discussion",
]);

export const engagementStatus = pgEnum("engagement_status", [
	"new",
	"read",
	/** A reply of ours was sent (or is pending). */
	"replied",
	"archived",
	"spam",
]);

export const engagementSentiment = pgEnum("engagement_sentiment", [
	"positive",
	"neutral",
	"negative",
	"question",
]);

export const engagementItems = pgTable(
	"engagement_items",
	{
		id: id(),
		organizationId: uuid()
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		channelId: uuid()
			.notNull()
			.references(() => channels.id, { onDelete: "cascade" }),
		provider: text().notNull(),
		kind: engagementKind().notNull(),
		externalId: text().notNull(),
		/** Our post this belongs to (comments/replies), when we published it. */
		postTargetId: uuid().references(() => postTargets.id, { onDelete: "set null" }),
		postExternalId: text(),
		parentExternalId: text(),
		/** Listening query that surfaced a discussion. */
		listeningQueryId: uuid(),
		author: jsonb()
			.$type<{
				externalId: string | null;
				name: string | null;
				handle: string | null;
				avatarUrl: string | null;
				profileUrl: string | null;
			}>()
			.notNull(),
		/** Our own replies are stored for thread context but never land in "new". */
		fromSelf: boolean().notNull().default(false),
		title: text(),
		text: text().notNull(),
		url: text(),
		community: text(),
		/** When it was said on the platform. */
		postedAt: timestamp({ withTimezone: true }).notNull(),
		status: engagementStatus().notNull().default("new"),
		/** AI triage: 0–100 how much this deserves a response; null until triaged. */
		relevance: integer(),
		relevanceReason: text(),
		sentiment: engagementSentiment(),
		triagedAt: timestamp({ withTimezone: true }),
		assignedTo: uuid().references(() => users.id, { onDelete: "set null" }),
		...timestamps(),
	},
	(t) => [
		uniqueIndex("engagement_items_channel_ext_uq").on(t.channelId, t.externalId),
		index("engagement_items_inbox_idx").on(t.organizationId, t.status, t.postedAt),
		index("engagement_items_untriaged_idx")
			.on(t.organizationId, t.createdAt)
			.where(sql`${t.triagedAt} is null and ${t.fromSelf} = false`),
		// Thread view and reply context: everything said under one post on one channel.
		index("engagement_items_thread_idx").on(t.channelId, t.postExternalId),
	],
);

/**
 * Our answers. Sending one creates a visible public post, so it follows the same
 * rules as publishing: one attempt per approval, an unknown outcome is
 * `unconfirmed` and never retried automatically. Status is written only by the
 * API's inbox service (draft → pending_approval → approved → queued) and the
 * worker's reply sender (queued → sending → sent | failed | unconfirmed).
 */
export const engagementReplyStatus = pgEnum("engagement_reply_status", [
	"draft",
	"pending_approval",
	"approved",
	"rejected",
	"queued",
	"sending",
	"sent",
	"failed",
	"unconfirmed",
]);

export const engagementReplies = pgTable(
	"engagement_replies",
	{
		id: id(),
		organizationId: uuid()
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		itemId: uuid()
			.notNull()
			.references(() => engagementItems.id, { onDelete: "cascade" }),
		text: text().notNull(),
		status: engagementReplyStatus().notNull().default("draft"),
		/**
		 * Send attempts claimed so far. Doubles as the job version (like
		 * post_targets.schedule_version): the job id carries it and the claim requires it,
		 * so a stale or duplicate job can never send.
		 */
		attempts: integer().notNull().default(0),
		/** "ai" when the text is an unedited AI draft. */
		source: text().notNull().default("human"),
		createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
		approvedBy: uuid().references(() => users.id, { onDelete: "set null" }),
		approvedAt: timestamp({ withTimezone: true }),
		rejectionReason: text(),
		externalId: text(),
		externalUrl: text(),
		errorCode: text(),
		errorMessage: text(),
		sentAt: timestamp({ withTimezone: true }),
		...timestamps(),
	},
	(t) => [
		index("engagement_replies_item_idx").on(t.itemId),
		index("engagement_replies_queue_idx").on(t.organizationId, t.status),
		// Maintenance: replies whose sender died mid-call (see recover-stuck-targets).
		index("engagement_replies_sending_idx").on(t.updatedAt).where(sql`${t.status} = 'sending'`),
	],
);

/** Keyword listening: find public discussions worth joining. */
export const listeningQueries = pgTable(
	"listening_queries",
	{
		id: id(),
		organizationId: uuid()
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		query: text().notNull(),
		/** Providers to search, e.g. ["reddit", "x"]. */
		providers: text().array().notNull().default([]),
		active: boolean().notNull().default(true),
		lastRunAt: timestamp({ withTimezone: true }),
		...timestamps(),
	},
	(t) => [index("listening_queries_org_idx").on(t.organizationId)],
);

/** Per channel: where the last sync stopped, so each run only asks for newer items. */
export const engagementCursors = pgTable("engagement_cursors", {
	channelId: uuid()
		.primaryKey()
		.references(() => channels.id, { onDelete: "cascade" }),
	commentsSince: timestamp({ withTimezone: true }),
	mentionsSince: timestamp({ withTimezone: true }),
	lastSyncedAt: timestamp({ withTimezone: true }),
	lastError: text(),
	updatedAt: createdAt(),
});
