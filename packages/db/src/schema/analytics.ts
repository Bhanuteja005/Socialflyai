import { date, index, integer, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { channels } from "./channels";
import { id } from "./columns";
import { organizations } from "./organizations";
import { postTargets } from "./posts";

/**
 * Engagement snapshots for a published target, appended by the worker's analytics
 * collector. Snapshots rather than one mutable row: growth curves ("how fast did
 * this post take off") need the history, and the latest value is one DISTINCT ON
 * away. Null = the platform does not report that metric (not zero).
 */
export const postTargetMetrics = pgTable(
	"post_target_metrics",
	{
		id: id(),
		organizationId: uuid()
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		targetId: uuid()
			.notNull()
			.references(() => postTargets.id, { onDelete: "cascade" }),
		capturedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		impressions: integer(),
		reach: integer(),
		likes: integer(),
		comments: integer(),
		shares: integer(),
		saves: integer(),
		clicks: integer(),
		videoViews: integer(),
	},
	(t) => [
		index("post_target_metrics_target_idx").on(t.targetId, t.capturedAt),
		index("post_target_metrics_org_idx").on(t.organizationId, t.capturedAt),
	],
);

/** Account-level numbers per channel per UTC day. Re-collecting a day overwrites it. */
export const channelMetricsDaily = pgTable(
	"channel_metrics_daily",
	{
		channelId: uuid()
			.notNull()
			.references(() => channels.id, { onDelete: "cascade" }),
		organizationId: uuid()
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		day: date({ mode: "string" }).notNull(),
		followers: integer(),
		impressions: integer(),
		reach: integer(),
		profileViews: integer(),
		updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		primaryKey({ columns: [t.channelId, t.day] }),
		index("channel_metrics_daily_org_idx").on(t.organizationId, t.day),
	],
);
