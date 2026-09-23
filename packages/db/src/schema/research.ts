import { sql } from "drizzle-orm";
import {
	boolean,
	date,
	index,
	integer,
	jsonb,
	numeric,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { createdAt, id, timestamps } from "./columns";
import { organizations } from "./organizations";

export const researchStatus = pgEnum("research_status", [
	"pending",
	"crawling",
	"analyzing",
	"succeeded",
	"failed",
]);

/**
 * One website research run: crawl the brand's site, then have the model turn the
 * pages into a brand brief. Status is written only by the worker's research
 * processor (the API inserts `pending` and enqueues).
 */
export const researchRuns = pgTable(
	"research_runs",
	{
		id: id(),
		organizationId: uuid()
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		requestedBy: uuid().references(() => users.id, { onDelete: "set null" }),
		startUrl: text().notNull(),
		status: researchStatus().notNull().default("pending"),
		pagesFound: integer().notNull().default(0),
		pagesCrawled: integer().notNull().default(0),
		/**
		 * The brief: { summary, audience, valueProposition, topics[], buyerQuestions[],
		 * competitors[], contentGaps[], contentIdeas[] } — see packages/research.
		 */
		insights: jsonb().$type<Record<string, unknown>>(),
		model: text(),
		costMicros: integer().notNull().default(0),
		errorCode: text(),
		errorMessage: text(),
		createdAt: createdAt(),
		startedAt: timestamp({ withTimezone: true }),
		completedAt: timestamp({ withTimezone: true }),
	},
	(t) => [
		index("research_runs_org_idx").on(t.organizationId, t.createdAt),
		// The one-active-run check and the stuck-run sweep only ever look at unfinished runs.
		index("research_runs_active_idx")
			.on(t.organizationId, t.createdAt)
			.where(sql`${t.status} in ('pending', 'crawling', 'analyzing')`),
	],
);

/** Pages captured by a run. Text is capped; this is research input, not an archive. */
export const researchPages = pgTable(
	"research_pages",
	{
		id: id(),
		runId: uuid()
			.notNull()
			.references(() => researchRuns.id, { onDelete: "cascade" }),
		organizationId: uuid()
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		url: text().notNull(),
		statusCode: integer(),
		title: text(),
		description: text(),
		headings: jsonb().$type<string[]>().notNull().default([]),
		text: text().notNull().default(""),
		wordCount: integer().notNull().default(0),
		createdAt: createdAt(),
	},
	(t) => [uniqueIndex("research_pages_run_url_uq").on(t.runId, t.url)],
);

export const competitorSource = pgEnum("competitor_source", ["user", "ai"]);

export const competitors = pgTable(
	"competitors",
	{
		id: id(),
		organizationId: uuid()
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		name: text().notNull(),
		/** Bare domain (example.com): used to recognise citations of their site. */
		domain: text(),
		/** Extra spellings to detect in AI answers ("Acme", "Acme Inc."). */
		aliases: text().array().notNull().default([]),
		source: competitorSource().notNull().default("user"),
		...timestamps(),
	},
	// Case-insensitive: "Acme" and "acme" are the same competitor, and the database (not
	// only the app) must say so or two concurrent adds both succeed.
	(t) => [uniqueIndex("competitors_org_name_uq").on(t.organizationId, sql`lower(${t.name})`)],
);

// ── SEO (DataForSEO, optional) ───────────────────────────────────────────────

export const keywords = pgTable(
	"keywords",
	{
		id: id(),
		organizationId: uuid()
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		keyword: text().notNull(),
		/** Location/language the volume and rankings are for, e.g. 2840 / "en" (US, English). */
		locationCode: integer().notNull().default(2840),
		languageCode: text().notNull().default("en"),
		/** Track Google rank of the brand's domain for this keyword weekly. */
		tracked: boolean().notNull().default(false),
		searchVolume: integer(),
		/** 0–100, provider's keyword difficulty. */
		difficulty: integer(),
		cpcUsd: numeric({ precision: 10, scale: 2, mode: "number" }),
		metricsUpdatedAt: timestamp({ withTimezone: true }),
		...timestamps(),
	},
	(t) => [
		uniqueIndex("keywords_org_kw_uq").on(
			t.organizationId,
			t.keyword,
			t.locationCode,
			t.languageCode,
		),
	],
);

export const keywordRankings = pgTable(
	"keyword_rankings",
	{
		keywordId: uuid()
			.notNull()
			.references(() => keywords.id, { onDelete: "cascade" }),
		day: date({ mode: "string" }).notNull(),
		/** Best organic position of the brand's domain; null = not in the top results checked. */
		position: integer(),
		url: text(),
		createdAt: createdAt(),
	},
	(t) => [primaryKey({ columns: [t.keywordId, t.day] })],
);

// ── AI visibility (AEO) ──────────────────────────────────────────────────────

/** A question buyers ask AI assistants, checked on a schedule across engines. */
export const visibilityPrompts = pgTable(
	"visibility_prompts",
	{
		id: id(),
		organizationId: uuid()
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		prompt: text().notNull(),
		active: boolean().notNull().default(true),
		...timestamps(),
	},
	(t) => [index("visibility_prompts_org_idx").on(t.organizationId)],
);

export const visibilitySentiment = pgEnum("visibility_sentiment", [
	"positive",
	"neutral",
	"negative",
]);

/** One engine's answer to one prompt at one point in time. */
export const visibilityChecks = pgTable(
	"visibility_checks",
	{
		id: id(),
		organizationId: uuid()
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		promptId: uuid()
			.notNull()
			.references(() => visibilityPrompts.id, { onDelete: "cascade" }),
		/** claude | chatgpt | gemini | perplexity */
		engine: text().notNull(),
		model: text().notNull(),
		checkedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
		/** Answer text, capped. */
		answer: text().notNull(),
		brandMentioned: boolean().notNull(),
		/** 1 = first brand named in the answer; null when not mentioned. */
		brandRank: integer(),
		sentiment: visibilitySentiment(),
		/** [{ url, domain, own: boolean, competitorId?: string }] */
		citations: jsonb()
			.$type<{ url: string; domain: string; own: boolean; competitorId?: string }[]>()
			.notNull()
			.default([]),
		competitorsMentioned: uuid().array().notNull().default([]),
		costMicros: integer().notNull().default(0),
		errorCode: text(),
	},
	(t) => [
		index("visibility_checks_org_idx").on(t.organizationId, t.checkedAt),
		index("visibility_checks_prompt_idx").on(t.promptId, t.checkedAt),
	],
);
