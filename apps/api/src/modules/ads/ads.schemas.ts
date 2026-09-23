import { AD_CALLS_TO_ACTION } from "@socialfly/ai";
import { schema } from "@socialfly/db";
import { z } from "zod";

export const CAMPAIGN_STATUSES = schema.adCampaignStatus.enumValues;
export const AD_OBJECTIVES = [
	"awareness",
	"traffic",
	"engagement",
	"leads",
	"sales",
	"video_views",
	"app_installs",
] as const;
export const AD_FORMATS = ["image", "video", "carousel", "search"] as const;
export const TARGETING_TYPES = [
	"interest",
	"location",
	"job_title",
	"industry",
	"keyword",
] as const;

export const idParam = z.object({ id: z.uuid() });
export const providerParam = z.object({ provider: z.string().regex(/^[a-z_]{2,40}$/) });
export const pendingParam = z.object({ key: z.string().regex(/^[\w-]{8,64}$/) });

/** Money in the account currency's major units, at most two decimals. */
const money = z
	.number()
	.positive()
	.max(10_000_000)
	.refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, {
		message: "At most two decimals",
	});

const option = z.object({
	id: z.string().trim().min(1).max(200),
	name: z.string().trim().min(1).max(200),
	type: z.enum(TARGETING_TYPES),
});

export const targetingSchema = z
	.object({
		countries: z
			.array(
				z
					.string()
					.trim()
					.transform((c) => c.toUpperCase())
					.pipe(z.string().regex(/^[A-Z]{2}$/)),
			)
			.min(1)
			.max(50),
		locations: z.array(option).max(50).optional(),
		ageMin: z.number().int().min(13).max(65).optional(),
		ageMax: z.number().int().min(13).max(65).optional(),
		genders: z
			.array(z.enum(["male", "female"]))
			.max(2)
			.optional(),
		languages: z
			.array(z.string().regex(/^[a-z]{2}$/))
			.max(20)
			.optional(),
		interests: z.array(option).max(50).optional(),
		keywords: z.array(z.string().trim().min(1).max(80)).max(200).optional(),
		jobTitles: z.array(option).max(50).optional(),
		industries: z.array(option).max(50).optional(),
	})
	.refine((t) => t.ageMin === undefined || t.ageMax === undefined || t.ageMin <= t.ageMax, {
		message: "ageMin must not be above ageMax",
		path: ["ageMin"],
	});

const httpUrl = z.url({ protocol: /^https?$/ }).max(2000);

export const adSchema = z.object({
	name: z.string().trim().min(1).max(200),
	format: z.enum(AD_FORMATS),
	/** Search ads carry their text in searchHeadlines/searchDescriptions and may leave this empty. */
	primaryText: z.string().trim().max(5000),
	headline: z.string().trim().max(500).optional(),
	description: z.string().trim().max(1000).optional(),
	callToAction: z.enum(AD_CALLS_TO_ACTION).optional(),
	destinationUrl: httpUrl,
	/** The organization's media library ids; resolved (ready media only) at submit and creation. */
	mediaIds: z.array(z.uuid()).max(10).default([]),
	searchHeadlines: z.array(z.string().trim().min(1).max(100)).max(15).optional(),
	searchDescriptions: z.array(z.string().trim().min(1).max(200)).max(4).optional(),
});
export type AdInput = z.infer<typeof adSchema>;

const isoDate = z.iso.datetime({ offset: true });

const campaignFields = {
	adAccountId: z.uuid(),
	name: z.string().trim().min(1).max(200),
	objective: z.enum(AD_OBJECTIVES),
	dailyBudget: money.nullable().optional(),
	lifetimeBudget: money.nullable().optional(),
	startAt: isoDate,
	endAt: isoDate.nullable().optional(),
	targeting: targetingSchema,
	ads: z.array(adSchema).min(1).max(50),
	sourcePostId: z.uuid().nullable().optional(),
	/** "ai" when the copy is the AI writer's, unedited (reporting only). */
	source: z.enum(["ai", "human"]).optional(),
	/**
	 * The adapters declare on the user's behalf that the ad is not political and not in a
	 * special category (credit, employment, housing, social issues) — Meta's
	 * special_ad_categories, Google's EU political flag, LinkedIn's politicalIntent. So a
	 * person must confirm it: required (true) to submit; stored with who and when.
	 */
	declarations: z.object({ notPoliticalOrSpecialCategory: z.boolean() }).optional(),
};

/** Budget shape rules that hold for every save; the rest is checked at submit. */
type BudgetShape = {
	dailyBudget?: number | null;
	lifetimeBudget?: number | null;
	startAt?: string;
	endAt?: string | null;
};
export function budgetShapeProblems(v: BudgetShape): string[] {
	const problems: string[] = [];
	const daily = v.dailyBudget ?? null;
	const lifetime = v.lifetimeBudget ?? null;
	if ((daily === null) === (lifetime === null))
		problems.push("Set either a daily budget or a lifetime budget (exactly one)");
	if (lifetime !== null && !v.endAt) problems.push("A lifetime budget needs an end date");
	if (v.startAt && v.endAt && Date.parse(v.endAt) <= Date.parse(v.startAt))
		problems.push("The end date must be after the start date");
	return problems;
}

export const createCampaignBody = z
	.object({
		...campaignFields,
		/** false = save as a draft; true = submit (for approval, or approved at once for admins). */
		submit: z.boolean().default(false),
	})
	.superRefine((v, ctx) => {
		for (const message of budgetShapeProblems(v)) ctx.addIssue({ code: "custom", message });
	});
export type CreateCampaignInput = z.infer<typeof createCampaignBody>;

export const updateCampaignBody = z
	.object({
		adAccountId: campaignFields.adAccountId.optional(),
		name: campaignFields.name.optional(),
		objective: campaignFields.objective.optional(),
		dailyBudget: campaignFields.dailyBudget,
		lifetimeBudget: campaignFields.lifetimeBudget,
		startAt: campaignFields.startAt.optional(),
		endAt: campaignFields.endAt,
		targeting: campaignFields.targeting.optional(),
		ads: campaignFields.ads.optional(),
		sourcePostId: campaignFields.sourcePostId,
		source: campaignFields.source,
		declarations: campaignFields.declarations,
		/** true = (re)submit; false = back to draft; absent = keep the status (see the service). */
		submit: z.boolean().optional(),
	})
	.refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to update" });
export type UpdateCampaignInput = z.infer<typeof updateCampaignBody>;

export const listCampaignsQuery = z.object({
	status: z.enum(CAMPAIGN_STATUSES).optional(),
	adAccountId: z.uuid().optional(),
	/** Opaque cursor from the previous page's `nextCursor`. */
	before: z.string().max(300).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListCampaignsQuery = z.infer<typeof listCampaignsQuery>;

export const rejectBody = z.object({ reason: z.string().trim().min(1).max(500) });

export const activateBody = z.object({
	/**
	 * The campaign's daily (or lifetime) budget, typed back by the admin. Activation is
	 * the moment money starts moving; a typed amount catches "I thought it was 50, not 500".
	 */
	confirmBudget: z.number().positive(),
});

export const retryBody = z.object({
	/**
	 * Required for `unconfirmed` campaigns: the user must check the ads manager first,
	 * because the first attempt may have created the campaign.
	 */
	confirmNotCreated: z.boolean().default(false),
});

export const copyBody = z.object({
	adAccountId: z.uuid(),
	objective: z.enum(AD_OBJECTIVES),
	product: z.string().trim().min(3).max(2000),
	audience: z.string().trim().min(1).max(500).optional(),
	destinationUrl: httpUrl,
	format: z.enum(AD_FORMATS),
	variants: z.number().int().min(1).max(3).default(3),
	sourcePostId: z.uuid().optional(),
});
export type CopyInput = z.infer<typeof copyBody>;

export const connectAccountsBody = z.object({
	pendingKey: z.string().regex(/^[\w-]{8,64}$/),
	externalIds: z.array(z.string().min(1).max(200)).min(1).max(50),
});

export const updateAccountBody = z.object({
	/** Identity fields only (see ads.shared.ts); null removes one. */
	metadata: z.record(z.string().max(60), z.string().trim().max(200).nullable()),
});

export const targetingQuery = z.object({
	type: z.enum(TARGETING_TYPES),
	q: z.string().trim().min(1).max(100),
});

export const updateSettingsBody = z.object({
	/** The organization's own daily ceiling (≤ the server's); null = the server ceiling applies. */
	adsMaxDailyBudget: money.nullable(),
});

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const overviewQuery = z.object({ from: day.optional(), to: day.optional() });
