import {
	bigint,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { createdAt, id, updatedAt } from "./columns";
import { organizations } from "./organizations";

/**
 * How the organization sounds. Fed into every generation prompt so output is on
 * brand without the user re-explaining it each time. One row per organization,
 * created on first save.
 */
export const brandProfiles = pgTable("brand_profiles", {
	organizationId: uuid()
		.primaryKey()
		.references(() => organizations.id, { onDelete: "cascade" }),
	brandName: text().notNull().default(""),
	/** What the business does, in the user's words. */
	description: text().notNull().default(""),
	audience: text().notNull().default(""),
	/** e.g. "friendly, confident, no jargon". */
	voice: text().notNull().default(""),
	website: text(),
	/** Topics and terms to lean on. */
	keywords: text().array().notNull().default([]),
	/** Words, claims or topics never to use. */
	avoid: text().array().notNull().default([]),
	/** Past posts the user likes — the strongest style signal a model gets. */
	examplePosts: text().array().notNull().default([]),
	updatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
});

export const aiGenerationKind = pgEnum("ai_generation_kind", [
	"post",
	"rewrite",
	"hashtags",
	"carousel_outline",
	"image",
	"carousel",
	"video_script",
	"video",
	// Phase 5: ledger rows so research, AI-visibility and SEO spend count toward the same budget.
	"research",
	"visibility",
	"seo",
]);

export const aiGenerationStatus = pgEnum("ai_generation_status", [
	/** Media jobs only: enqueued, not picked up yet. */
	"pending",
	"running",
	"succeeded",
	"failed",
]);

/**
 * Every AI call, successful or not: the audit trail, the async job record for
 * media, and the ledger the monthly budget is enforced from (sum of cost_micros).
 */
export const aiGenerations = pgTable(
	"ai_generations",
	{
		id: id(),
		organizationId: uuid()
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		userId: uuid().references(() => users.id, { onDelete: "set null" }),
		kind: aiGenerationKind().notNull(),
		status: aiGenerationStatus().notNull().default("pending"),
		/** Provider-qualified model that served the request, e.g. "anthropic:claude-opus-5". */
		model: text(),
		/** The validated request (never secrets). */
		input: jsonb().$type<Record<string, unknown>>().notNull().default({}),
		output: jsonb().$type<Record<string, unknown>>(),
		/** Media produced (images, carousel slides), in order. */
		mediaIds: uuid().array().notNull().default([]),
		errorCode: text(),
		errorMessage: text(),
		inputTokens: integer().notNull().default(0),
		outputTokens: integer().notNull().default(0),
		/** Cost in millionths of a USD — integer money, no float drift in sums. */
		costMicros: bigint({ mode: "number" }).notNull().default(0),
		durationMs: integer(),
		createdAt: createdAt(),
		completedAt: timestamp({ withTimezone: true }),
	},
	(t) => [index("ai_generations_org_created_idx").on(t.organizationId, t.createdAt)],
);
