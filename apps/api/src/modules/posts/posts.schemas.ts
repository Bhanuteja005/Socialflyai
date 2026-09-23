import { z } from "zod";

const targetInput = z.object({
	channelId: z.uuid(),
	/** Platform-specific copy; omit to use the post's main content. */
	contentOverride: z.string().max(10_000).nullable().optional(),
	/** Validated against the channel's provider settings schema (subreddit, title...). */
	settings: z.record(z.string(), z.unknown()).default({}),
});

const postFields = {
	content: z.string().max(10_000).default(""),
	/** Ordered: the first is the cover / first carousel item. */
	mediaIds: z.array(z.uuid()).max(20).default([]),
	targets: z
		.array(targetInput)
		.min(1, "Pick at least one channel")
		.max(25)
		.refine(
			(t) => new Set(t.map((x) => x.channelId)).size === t.length,
			"Each channel can appear only once",
		),
	/** Null/absent with action "schedule" means "publish now". */
	scheduledAt: z.iso.datetime({ offset: true }).nullable().optional(),
};

export const createPostBody = z.object({
	...postFields,
	action: z.enum(["draft", "schedule"]).default("draft"),
});
export type CreatePostInput = z.infer<typeof createPostBody>;

export const updatePostBody = z.object(postFields);
export type UpdatePostInput = z.infer<typeof updatePostBody>;

export const scheduleBody = z.object({
	scheduledAt: z.iso.datetime({ offset: true }).nullable().optional(),
});

export const retryTargetBody = z.object({
	/**
	 * Required for `unconfirmed` targets: the user must check the platform first,
	 * because the original attempt may have gone through.
	 */
	confirmNotPublished: z.boolean().default(false),
});

export const listPostsQuery = z.object({
	from: z.iso.datetime({ offset: true }).optional(),
	to: z.iso.datetime({ offset: true }).optional(),
	status: z
		.enum([
			"draft",
			"pending_approval",
			"scheduled",
			"publishing",
			"published",
			"partially_published",
			"failed",
			"canceled",
		])
		.optional(),
	channelId: z.uuid().optional(),
	limit: z.coerce.number().int().min(1).max(500).default(200),
});

export const postIdParam = z.object({ id: z.uuid() });
export const targetParams = z.object({ id: z.uuid(), targetId: z.uuid() });
