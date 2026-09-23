import { sql } from "drizzle-orm";
import {
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { channels } from "./channels";
import { createdAt, id, timestamps } from "./columns";
import { mediaAssets } from "./media";
import { organizations } from "./organizations";

/**
 * A post is what the user writes once; a post TARGET is that post on one channel.
 * "Publish to LinkedIn + X + Instagram" = 1 post, 3 targets, each with its own
 * status, schedule, retry state and platform result. (The old schema had one row
 * per account, so a multi-platform post could not be edited or reported as one.)
 */
export const postStatus = pgEnum("post_status", [
	"draft",
	"pending_approval",
	"scheduled",
	/** Rolled up from targets: some in flight. */
	"publishing",
	"published",
	/** Some targets published, some failed. */
	"partially_published",
	"failed",
	"canceled",
]);

export const postSource = pgEnum("post_source", ["web", "api", "ai", "import"]);

export const posts = pgTable(
	"posts",
	{
		id: id(),
		organizationId: uuid()
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		authorId: uuid().references(() => users.id, { onDelete: "set null" }),
		/** Base copy; a target may override it per platform. */
		content: text().notNull().default(""),
		status: postStatus().notNull().default("draft"),
		/** Null = draft / publish-now. Targets inherit it unless they override. */
		scheduledAt: timestamp({ withTimezone: true }),
		source: postSource().notNull().default("web"),
		deletedAt: timestamp({ withTimezone: true }),
		...timestamps(),
	},
	(t) => [
		index("posts_org_scheduled_idx").on(t.organizationId, t.scheduledAt),
		index("posts_org_status_idx").on(t.organizationId, t.status),
	],
);

export const postMedia = pgTable(
	"post_media",
	{
		postId: uuid()
			.notNull()
			.references(() => posts.id, { onDelete: "cascade" }),
		mediaId: uuid()
			.notNull()
			.references(() => mediaAssets.id, { onDelete: "restrict" }),
		position: integer().notNull(),
	},
	(t) => [primaryKey({ columns: [t.postId, t.mediaId] })],
);

/**
 * Publishing state machine for one target. Transitions are enforced in
 * apps/worker/src/publishing (and only there):
 *
 *   draft → scheduled → queued → publishing → published
 *                                   ↘ processing → published     (async video: IG/Threads/YouTube)
 *                                   ↘ failed                      (platform said no — safe to show & retry manually)
 *                                   ↘ unconfirmed                 (request left us, outcome unknown)
 *   any non-terminal → canceled
 *
 * `unconfirmed` is never auto-retried: re-sending a publish whose first attempt may
 * have succeeded is how duplicate posts happen. The user checks the platform and
 * decides.
 */
export const targetStatus = pgEnum("target_status", [
	/** Part of a draft post: never picked up by the worker. */
	"draft",
	"scheduled",
	"queued",
	"publishing",
	"processing",
	"published",
	"failed",
	"unconfirmed",
	"canceled",
]);

export const postTargets = pgTable(
	"post_targets",
	{
		id: id(),
		organizationId: uuid()
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		postId: uuid()
			.notNull()
			.references(() => posts.id, { onDelete: "cascade" }),
		channelId: uuid()
			.notNull()
			.references(() => channels.id, { onDelete: "restrict" }),
		/** Per-platform copy; null = use posts.content. */
		contentOverride: text(),
		/** Platform options validated by the provider's settings schema (subreddit, title, first comment...). */
		settings: jsonb().$type<Record<string, unknown>>().notNull().default({}),
		status: targetStatus().notNull().default("draft"),
		scheduledAt: timestamp({ withTimezone: true }),
		/**
		 * Bumped on every (re)schedule. Part of the BullMQ job id, so a reschedule
		 * enqueues a fresh job and a stale job from the old schedule can recognise
		 * itself (its version no longer matches) and exit without publishing.
		 */
		scheduleVersion: integer().notNull().default(0),
		attempts: integer().notNull().default(0),
		/** Opaque provider state while `processing` (e.g. an IG container id). */
		pendingData: jsonb().$type<Record<string, unknown>>(),
		externalId: text(),
		externalUrl: text(),
		errorCode: text(),
		errorMessage: text(),
		publishedAt: timestamp({ withTimezone: true }),
		...timestamps(),
	},
	(t) => [
		uniqueIndex("post_targets_post_channel_uq").on(t.postId, t.channelId),
		// The scheduler's sweep for due work (safety net behind BullMQ delayed jobs).
		index("post_targets_due_idx")
			.on(t.scheduledAt)
			.where(sql`${t.status} in ('scheduled', 'queued')`),
		index("post_targets_channel_idx").on(t.channelId),
	],
);

/** Append-only timeline per target — what happened, when, and why. Shown in the UI and used for support. */
export const postTargetEvents = pgTable(
	"post_target_events",
	{
		id: id(),
		targetId: uuid()
			.notNull()
			.references(() => postTargets.id, { onDelete: "cascade" }),
		type: text().notNull(),
		message: text(),
		data: jsonb().$type<Record<string, unknown>>(),
		createdAt: createdAt(),
	},
	(t) => [index("post_target_events_target_idx").on(t.targetId, t.createdAt)],
);
