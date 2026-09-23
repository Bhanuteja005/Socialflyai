import { schema } from "@socialfly/db";
import { z } from "zod";

export const ITEM_STATUSES = schema.engagementStatus.enumValues;
export const ITEM_KINDS = schema.engagementKind.enumValues;
export const SENTIMENTS = schema.engagementSentiment.enumValues;

/** Longest text a list row carries; the detail view has the full text. */
export const LIST_TEXT_MAX = 2000;
/** Active listening queries per organization: each one is a platform search every hour. */
export const MAX_ACTIVE_QUERIES = 10;

/** `a,b,c` → validated list; ids from another organization simply match nothing. */
const csv = <T extends z.ZodType<unknown, string>>(item: T, max: number) =>
	z
		.string()
		.max(4000)
		.optional()
		.transform((v) =>
			v
				? v
						.split(",")
						.map((s) => s.trim())
						.filter(Boolean)
				: undefined,
		)
		.pipe(z.array(item).max(max).optional());

export const listItemsQuery = z.object({
	/** `open` = new + read: what still needs a look. */
	status: z.enum([...ITEM_STATUSES, "open"]).default("open"),
	channelIds: csv(z.uuid(), 100),
	kinds: csv(z.enum(ITEM_KINDS), ITEM_KINDS.length),
	minRelevance: z.coerce.number().int().min(0).max(100).optional(),
	sentiment: z.enum(SENTIMENTS).optional(),
	q: z.string().trim().min(1).max(200).optional(),
	sort: z.enum(["newest", "relevance"]).default("newest"),
	/** Opaque cursor from the previous page's `nextCursor` (same sort). */
	before: z.string().max(300).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListItemsQuery = z.infer<typeof listItemsQuery>;

export const idParam = z.object({ id: z.uuid() });

export const bulkUpdateItemsBody = z.object({
	ids: z.array(z.uuid()).min(1).max(100),
	status: z.enum(ITEM_STATUSES),
});

export const updateItemBody = z
	.object({
		status: z.enum(ITEM_STATUSES).optional(),
		/** A member of the organization, or null to unassign. */
		assignedTo: z.uuid().nullable().optional(),
	})
	.refine((v) => v.status !== undefined || v.assignedTo !== undefined, {
		message: "Nothing to update",
	});
export type UpdateItemInput = z.infer<typeof updateItemBody>;

export const draftBody = z.object({
	tone: z.string().trim().min(1).max(100).optional(),
	instruction: z.string().trim().min(1).max(500).optional(),
});
export type DraftInput = z.infer<typeof draftBody>;

/** Upper bound for any platform; the provider's own limit is checked in the service. */
const replyText = z.string().trim().min(1).max(10_000);

export const createReplyBody = z.object({
	text: replyText,
	/** "ai" when the text is an unedited AI draft (reporting only). */
	source: z.enum(["ai", "human"]).default("human"),
	/** false = save as a draft; true = send (or ask for approval when required). */
	submit: z.boolean(),
});
export type CreateReplyInput = z.infer<typeof createReplyBody>;

export const updateReplyBody = z
	.object({ text: replyText.optional(), submit: z.boolean().optional() })
	.refine((v) => v.text !== undefined || v.submit !== undefined, { message: "Nothing to update" });
export type UpdateReplyInput = z.infer<typeof updateReplyBody>;

export const rejectReplyBody = z.object({ reason: z.string().trim().min(1).max(500) });

export const retryReplyBody = z.object({
	/**
	 * Required for `unconfirmed` replies: the user must check the platform first, because
	 * the original attempt may have gone through.
	 */
	confirmNotSent: z.boolean().default(false),
});

export const createQueryBody = z.object({
	query: z.string().trim().min(2).max(200),
	providers: z.array(z.string().trim().min(1).max(40)).min(1).max(10),
});
export type CreateQueryInput = z.infer<typeof createQueryBody>;

export const updateQueryBody = z
	.object({
		query: z.string().trim().min(2).max(200).optional(),
		providers: z.array(z.string().trim().min(1).max(40)).min(1).max(10).optional(),
		active: z.boolean().optional(),
	})
	.refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to update" });
export type UpdateQueryInput = z.infer<typeof updateQueryBody>;

export const updateSettingsBody = z.object({ replyApprovalRequired: z.boolean() });
