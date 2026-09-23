import {
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
import { id, timestamps } from "./columns";
import { organizations } from "./organizations";
import { posts } from "./posts";

export const adAccountStatus = pgEnum("ad_account_status", [
	"active",
	"disabled",
	"pending",
	"needs_reauth",
	"disconnected",
]);

/**
 * A connected advertising account (Meta ad account, Google Ads customer, LinkedIn
 * ad account…). Separate from `channels`: different permissions, often a
 * different app approval, and one login can manage many ad accounts.
 */
export const adAccounts = pgTable(
	"ad_accounts",
	{
		id: id(),
		organizationId: uuid()
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		/** meta_ads | google_ads | linkedin_ads | tiktok_ads | pinterest_ads | x_ads */
		provider: text().notNull(),
		externalId: text().notNull(),
		name: text().notNull(),
		/** ISO 4217: budgets and spend for this account are in this currency. */
		currency: text().notNull(),
		timezone: text(),
		status: adAccountStatus().notNull().default("active"),
		/** AES-256-GCM sealed like channel tokens. Never select into API responses. */
		accessTokenEnc: text().notNull(),
		/** OAuth 1.0a token secret (X Ads). */
		tokenSecretEnc: text(),
		refreshTokenEnc: text(),
		tokenExpiresAt: timestamp({ withTimezone: true }),
		scopes: text().array().notNull().default([]),
		/**
		 * Platform identity ads run as, chosen after connecting: { pageId, instagramActorId }
		 * (Meta), { organizationUrn } (LinkedIn), { identityId, identityType } (TikTok),
		 * { boardId } (Pinterest), { fundingInstrumentId } (X).
		 */
		metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
		lastError: text(),
		connectedBy: uuid().references(() => users.id, { onDelete: "set null" }),
		...timestamps(),
	},
	(t) => [
		uniqueIndex("ad_accounts_org_provider_ext_uq").on(t.organizationId, t.provider, t.externalId),
	],
);

/**
 * Campaign lifecycle. Written only by the API's ads service (draft →
 * pending_approval → approved/rejected, activation requests) and the worker's
 * ads processor (creating → paused | failed | unconfirmed, status sync).
 *
 *   draft → pending_approval → approved → creating → paused ⇄ active → completed
 *                                   ↘ rejected       ↘ failed / unconfirmed
 *   any created state → archived
 *
 * `paused` is where every campaign lands after creation: money is only spent
 * after a person explicitly activates it.
 */
export const adCampaignStatus = pgEnum("ad_campaign_status", [
	"draft",
	"pending_approval",
	"approved",
	"rejected",
	"creating",
	"paused",
	"active",
	"completed",
	"archived",
	"failed",
	"unconfirmed",
]);

export const adCampaigns = pgTable(
	"ad_campaigns",
	{
		id: id(),
		organizationId: uuid()
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		adAccountId: uuid()
			.notNull()
			.references(() => adAccounts.id, { onDelete: "restrict" }),
		provider: text().notNull(),
		name: text().notNull(),
		objective: text().notNull(),
		status: adCampaignStatus().notNull().default("draft"),
		/**
		 * The platform-neutral draft (CampaignDraft shape) with media as our media ids:
		 * { targeting, ads: [{ …, mediaIds }] }. Re-resolved to public URLs at creation.
		 */
		draft: jsonb().$type<Record<string, unknown>>().notNull(),
		/** Major units of `currency`. Exactly one of daily/lifetime is set. */
		dailyBudget: numeric({ precision: 12, scale: 2, mode: "number" }),
		lifetimeBudget: numeric({ precision: 12, scale: 2, mode: "number" }),
		currency: text().notNull(),
		startAt: timestamp({ withTimezone: true }).notNull(),
		endAt: timestamp({ withTimezone: true }),
		/** Boosting an existing post: the post whose content/media the ads reuse. */
		sourcePostId: uuid().references(() => posts.id, { onDelete: "set null" }),
		/** "ai" when copy came from the AI ad writer unedited. */
		source: text().notNull().default("human"),
		externalId: text(),
		/** Every platform object created, for sync and cleanup. */
		externalObjects: jsonb().$type<{ type: string; externalId: string }[]>().notNull().default([]),
		manageUrl: text(),
		/** Last status read from the platform (a user can pause in the ads manager). */
		platformStatus: text(),
		platformStatusAt: timestamp({ withTimezone: true }),
		/** Bumped on every create/activate/pause request; part of the job id (stale jobs exit). */
		version: integer().notNull().default(0),
		errorCode: text(),
		errorMessage: text(),
		createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
		approvedBy: uuid().references(() => users.id, { onDelete: "set null" }),
		approvedAt: timestamp({ withTimezone: true }),
		rejectionReason: text(),
		activatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
		activatedAt: timestamp({ withTimezone: true }),
		...timestamps(),
	},
	(t) => [
		index("ad_campaigns_org_idx").on(t.organizationId, t.createdAt),
		index("ad_campaigns_account_idx").on(t.adAccountId),
	],
);

/** Daily delivery per campaign, in the ad account's currency and timezone. */
export const adCampaignMetricsDaily = pgTable(
	"ad_campaign_metrics_daily",
	{
		campaignId: uuid()
			.notNull()
			.references(() => adCampaigns.id, { onDelete: "cascade" }),
		organizationId: uuid()
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		day: date({ mode: "string" }).notNull(),
		spend: numeric({ precision: 12, scale: 2, mode: "number" }).notNull().default(0),
		impressions: integer(),
		reach: integer(),
		clicks: integer(),
		conversions: integer(),
		videoViews: integer(),
		updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		primaryKey({ columns: [t.campaignId, t.day] }),
		index("ad_metrics_org_day_idx").on(t.organizationId, t.day),
	],
);
