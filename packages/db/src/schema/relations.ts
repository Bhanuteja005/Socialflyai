import { relations } from "drizzle-orm";
import { users } from "./auth";
import { channels } from "./channels";
import { mediaAssets } from "./media";
import { memberships, organizations } from "./organizations";
import { postMedia, posts, postTargetEvents, postTargets } from "./posts";

export const organizationsRelations = relations(organizations, ({ many }) => ({
	memberships: many(memberships),
	channels: many(channels),
	posts: many(posts),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
	organization: one(organizations, {
		fields: [memberships.organizationId],
		references: [organizations.id],
	}),
	user: one(users, { fields: [memberships.userId], references: [users.id] }),
}));

export const postsRelations = relations(posts, ({ many, one }) => ({
	targets: many(postTargets),
	media: many(postMedia),
	author: one(users, { fields: [posts.authorId], references: [users.id] }),
}));

export const postTargetsRelations = relations(postTargets, ({ one, many }) => ({
	post: one(posts, { fields: [postTargets.postId], references: [posts.id] }),
	channel: one(channels, { fields: [postTargets.channelId], references: [channels.id] }),
	events: many(postTargetEvents),
}));

export const postTargetEventsRelations = relations(postTargetEvents, ({ one }) => ({
	target: one(postTargets, { fields: [postTargetEvents.targetId], references: [postTargets.id] }),
}));

export const postMediaRelations = relations(postMedia, ({ one }) => ({
	post: one(posts, { fields: [postMedia.postId], references: [posts.id] }),
	media: one(mediaAssets, { fields: [postMedia.mediaId], references: [mediaAssets.id] }),
}));
