import { ProviderError } from "../errors";
import { form, providerJson } from "../http";
import {
	classifyMetaError,
	exchangeMetaCode,
	GRAPH_HOST,
	graphHeaders,
	graphPagesBounded,
	type MetaConfig,
	metaAuthorizationUrl,
} from "../providers/meta";
import type { MediaItem, OAuthConfig } from "../types";
import {
	type CreatedStep,
	countMedia,
	decimal,
	draftBudget,
	draftRejected,
	rollbackAndThrow,
	sleep,
	toScaledInteger,
	validateDraftBasics,
} from "./common";
import type {
	AdAccount,
	AdDraft,
	AdObjective,
	AdsCapabilities,
	AdsContext,
	AdsProvider,
	CampaignDraft,
	CampaignInsightsDay,
	CreatedCampaign,
	Targeting,
	TargetingOption,
} from "./types";

/**
 * Meta ads (Facebook + Instagram placements) through the Marketing API, on the
 * same Meta app and Facebook Login as organic publishing, with the ads permissions.
 *
 * Structure: campaign (objective) → ad set (budget, schedule, targeting,
 * optimisation) → ad creative (page post spec) → ad. We create ONE ad set per
 * campaign and one creative + ad per AdDraft.
 *
 * Docs:
 *  campaigns   https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group
 *  ad sets     https://developers.facebook.com/docs/marketing-api/reference/ad-campaign
 *  creatives   https://developers.facebook.com/docs/marketing-api/reference/ad-creative-object-story-spec
 *  link data   https://developers.facebook.com/docs/marketing-api/reference/ad-creative-link-data
 *  video data  https://developers.facebook.com/docs/marketing-api/reference/ad-creative-video-data
 *  videos      https://developers.facebook.com/docs/marketing-api/reference/ad-account/advideos
 *  insights    https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group/insights
 *  currencies  https://developers.facebook.com/docs/marketing-api/currencies
 */

export type MetaAdsEnv = {
	META_APP_ID: string;
	META_APP_SECRET: string;
	META_GRAPH_VERSION: string;
};

export type MetaAdsOptions = {
	/** Video processing poll (bounded): interval and attempts. Tests shorten these. */
	videoPollIntervalMs?: number;
	videoPollMaxAttempts?: number;
};

const PROVIDER = "meta_ads";

const SCOPES = [
	"ads_management",
	"ads_read",
	"business_management",
	// The creative is an unpublished post of a Page (and optionally its IG account):
	// listing the user's Pages lets them pick the identity the ads run as.
	"pages_show_list",
	"pages_read_engagement",
	"instagram_basic",
];

/**
 * Meta amounts are integers in the currency's "offset" unit: cents for most
 * currencies, whole units for these (the currencies table lists offset 1).
 * https://developers.facebook.com/docs/marketing-api/currencies
 */
const OFFSET_ONE = new Set([
	"CLP",
	"COP",
	"CRC",
	"HUF",
	"ISK",
	"IDR",
	"JPY",
	"KRW",
	"PYG",
	"TWD",
	"VND",
]);
export const metaCurrencyDigits = (currency: string): number | null =>
	/^[A-Z]{3}$/.test(currency) ? (OFFSET_ONE.has(currency) ? 0 : 2) : null;

/** Major units → Meta's integer offset units, as the string the API takes. */
export function toMetaAmount(amount: number, currency: string): string {
	const digits = metaCurrencyDigits(currency.toUpperCase());
	const scaled = digits === null ? null : toScaledInteger(amount, digits);
	if (scaled === null) {
		throw draftRejected(PROVIDER, [`Budget ${amount} cannot be expressed exactly in ${currency}`]);
	}
	return String(scaled);
}

type ObjectiveSpec = {
	objective: string;
	optimizationGoal: string;
	destinationType?: string;
	/** Website leads/sales optimise for a pixel event; the ad account's pixel is required. */
	pixelEvent?: "LEAD" | "PURCHASE";
};

/**
 * Objective → ODAX objective + ad set optimisation. Combinations from the ODAX
 * mapping table in the campaign reference (see header). Video views live under
 * OUTCOME_ENGAGEMENT with destination ON_VIDEO / THRUPLAY. All are billed on
 * IMPRESSIONS, which every one of these optimisation goals accepts.
 * App installs are not offered: they need an app id and store URL we do not model.
 */
const OBJECTIVES: Partial<Record<AdObjective, ObjectiveSpec>> = {
	awareness: { objective: "OUTCOME_AWARENESS", optimizationGoal: "REACH" },
	traffic: { objective: "OUTCOME_TRAFFIC", optimizationGoal: "LINK_CLICKS" },
	engagement: {
		objective: "OUTCOME_ENGAGEMENT",
		optimizationGoal: "POST_ENGAGEMENT",
		destinationType: "ON_POST",
	},
	video_views: {
		objective: "OUTCOME_ENGAGEMENT",
		optimizationGoal: "THRUPLAY",
		destinationType: "ON_VIDEO",
	},
	leads: {
		objective: "OUTCOME_LEADS",
		optimizationGoal: "OFFSITE_CONVERSIONS",
		pixelEvent: "LEAD",
	},
	sales: {
		objective: "OUTCOME_SALES",
		optimizationGoal: "OFFSITE_CONVERSIONS",
		pixelEvent: "PURCHASE",
	},
};

/**
 * CTA enum: https://developers.facebook.com/docs/marketing-api/reference/ad-creative-link-data-call-to-action
 */
const CTA: Record<NonNullable<AdDraft["callToAction"]>, string> = {
	learn_more: "LEARN_MORE",
	shop_now: "SHOP_NOW",
	sign_up: "SIGN_UP",
	contact_us: "CONTACT_US",
	download: "DOWNLOAD",
	book_now: "BOOK_NOW",
	get_quote: "GET_QUOTE",
	subscribe: "SUBSCRIBE",
};

/**
 * Minimum daily budget (USD) from the ad set reference: $0.50 when optimising for
 * impressions/reach, $2.50 for clicks and actions (LOWEST_COST_WITHOUT_CAP), "2x
 * higher for certain countries" — Meta enforces those exactly and we surface its
 * error. Other currencies are checked at create time against the ad account's own
 * `min_daily_budget` (read on connect) instead of a stale conversion table.
 */
const minDailyUsd = (objective: AdObjective) => (objective === "awareness" ? 0.5 : 2.5);

/**
 * Carousel: 2-5 cards, up to 10 with multi_share_optimized (Meta's default: true).
 * Ads per ad set: 50 (Marketing API limits); we create one ad set per campaign.
 * Text: Meta documents no hard cap on the primary text for link ads beyond the
 * placements' truncation; 2,200 is Instagram's caption cap, which applies once the
 * ad runs on Instagram. Headline/description: Meta truncates past ~40/~30 characters
 * in feeds but accepts up to 255; we enforce the accepted length, not the visible one.
 */
const CAROUSEL_MIN = 2;
const CAROUSEL_MAX = 10;
const capabilities: AdsCapabilities = {
	objectives: ["awareness", "traffic", "engagement", "video_views", "leads", "sales"],
	formats: ["image", "video", "carousel"],
	minDailyBudgetUsd: 0.5,
	maxAdsPerCampaign: 50,
	textLimits: { primaryText: 2200, headline: 255, description: 255 },
};

/**
 * AdAccount.account_status: 1 ACTIVE, 2 DISABLED, 3 UNSETTLED, 7 PENDING_RISK_REVIEW,
 * 8 PENDING_SETTLEMENT, 9 IN_GRACE_PERIOD (still serving), 100 PENDING_CLOSURE,
 * 101 CLOSED. https://developers.facebook.com/docs/marketing-api/reference/ad-account/
 */
export function mapMetaAccountStatus(code: number | undefined): AdAccount["status"] {
	if (code === 1 || code === 9) return "active";
	if (code === 7 || code === 8) return "pending";
	return "disabled";
}

/**
 * Campaign effective_status (ACTIVE, PAUSED, DELETED, ARCHIVED, IN_PROCESS,
 * WITH_ISSUES) plus the ads' effective statuses, since review happens per ad
 * (PENDING_REVIEW, DISAPPROVED, ...).
 */
export function mapMetaCampaignStatus(
	campaignStatus: string | undefined,
	adStatuses: string[],
): "active" | "paused" | "archived" | "deleted" | "in_review" | "rejected" {
	switch (campaignStatus) {
		case "PAUSED":
			return "paused";
		case "DELETED":
			return "deleted";
		case "ARCHIVED":
			return "archived";
		case "WITH_ISSUES":
			return "rejected";
		case "IN_PROCESS":
			return "in_review";
	}
	if (adStatuses.length > 0) {
		if (adStatuses.every((s) => s === "DISAPPROVED")) return "rejected";
		if (!adStatuses.includes("ACTIVE") && adStatuses.some((s) => s === "PENDING_REVIEW")) {
			return "in_review";
		}
	}
	return "active";
}

/**
 * Targeting spec: https://developers.facebook.com/docs/marketing-api/audiences/reference/basic-targeting
 * Location options come from searchTargeting as "<type>:<key>". Advantage+
 * audience is turned OFF explicitly: since v23 it defaults ON for new ad sets,
 * which would let Meta widen the audience beyond what the user chose.
 */
export function metaTargetingSpec(t: Targeting): Record<string, unknown> {
	const geo: Record<string, unknown> = {};
	if (t.locations && t.locations.length > 0) {
		const add = (key: string, value: unknown) => {
			const list = (geo[key] as unknown[] | undefined) ?? [];
			list.push(value);
			geo[key] = list;
		};
		for (const loc of t.locations) {
			const [kind, key] = splitLocationId(loc.id);
			if (kind === "country") add("countries", key);
			else if (kind === "region") add("regions", { key });
			else if (kind === "city") add("cities", { key });
			else if (kind === "zip") add("zips", { key });
			else add("places", { key });
		}
	} else {
		geo.countries = t.countries;
	}
	const spec: Record<string, unknown> = {
		geo_locations: geo,
		age_min: t.ageMin ?? 18,
		age_max: t.ageMax ?? 65,
		targeting_automation: { advantage_audience: 0 },
	};
	const genders = new Set(t.genders ?? []);
	// Both genders = everyone = omit (Meta: 1 male, 2 female).
	if (genders.size === 1) spec.genders = genders.has("male") ? [1] : [2];
	if (t.interests && t.interests.length > 0) {
		spec.flexible_spec = [{ interests: t.interests.map((i) => ({ id: i.id, name: i.name })) }];
	}
	return spec;
}

const splitLocationId = (id: string): [string, string] => {
	const i = id.indexOf(":");
	return i === -1 ? ["country", id] : [id.slice(0, i), id.slice(i + 1)];
};

const actId = (accountExternalId: string) => `act_${accountExternalId.replace(/^act_/, "")}`;
const unixSeconds = (iso: string) => Math.floor(Date.parse(iso) / 1000);

/** Conversions = Meta's aggregated `purchase` + `lead` action types (both omni-channel totals). */
const CONVERSION_ACTIONS = new Set(["purchase", "lead"]);

type InsightsRow = {
	campaign_id?: string;
	date_start: string;
	spend?: string;
	impressions?: string;
	reach?: string;
	clicks?: string;
	actions?: { action_type: string; value: string }[];
};

export function mapMetaInsightsRow(campaignId: string, row: InsightsRow): CampaignInsightsDay {
	const actions = row.actions ?? [];
	const sum = (pred: (type: string) => boolean) =>
		actions.filter((a) => pred(a.action_type)).reduce((n, a) => n + decimal(a.value), 0);
	return {
		campaignExternalId: row.campaign_id ?? campaignId,
		date: row.date_start,
		// Insights `spend` is already in major units ("12.34"), unlike budgets.
		spend: decimal(row.spend),
		impressions: decimal(row.impressions),
		reach: decimal(row.reach),
		clicks: decimal(row.clicks),
		conversions: sum((t) => CONVERSION_ACTIONS.has(t)),
		// `video_view` = 3-second video views, Meta's headline "video plays" metric.
		videoViews: sum((t) => t === "video_view"),
	};
}

type AccountRow = {
	account_id: string;
	name?: string;
	currency?: string;
	timezone_name?: string;
	account_status?: number;
	min_daily_budget?: number;
	business?: { id: string; name?: string };
};

type GraphClient = {
	post: <T>(path: string, body: Record<string, unknown>) => Promise<T>;
	get: <T>(path: string, params: Record<string, string>) => Promise<T>;
	remove: (id: string) => Promise<void>;
};

type PageRow = { id: string; name: string; instagram_business_account?: { id: string } };

class MetaAdsProvider implements AdsProvider {
	readonly id = "meta_ads" as const;
	readonly displayName = "Meta Ads";
	readonly capabilities = capabilities;
	readonly scopes = SCOPES;
	// Ads management calls share Business Use Case limits with the whole ad account;
	// a campaign create is 4+ writes, so stay far below them.
	readonly writeRateLimit = { max: 10, durationMs: 60_000 };

	private readonly config: MetaConfig;
	private readonly pollIntervalMs: number;
	private readonly pollMaxAttempts: number;

	constructor(env: MetaAdsEnv, options: MetaAdsOptions = {}) {
		this.config = {
			appId: env.META_APP_ID,
			appSecret: env.META_APP_SECRET,
			graphVersion: env.META_GRAPH_VERSION,
		};
		this.pollIntervalMs = options.videoPollIntervalMs ?? 5_000;
		// 5 s × 36 = 3 minutes; longer videos should be uploaded in the ads manager.
		this.pollMaxAttempts = options.videoPollMaxAttempts ?? 36;
	}

	private get graph() {
		return `${GRAPH_HOST}/${this.config.graphVersion}`;
	}

	private classify(mutating = false) {
		return (status: number, body: string) => classifyMetaError(PROVIDER, status, body, mutating);
	}

	isConfigured() {
		return Boolean(this.config.appId && this.config.appSecret && this.config.graphVersion);
	}

	async getAuthorizationUrl(config: OAuthConfig) {
		return metaAuthorizationUrl(this.config, SCOPES, config);
	}

	async exchangeCode(input: { code: string; redirectUri: string }) {
		const tokens = await exchangeMetaCode(PROVIDER, this.config, SCOPES, input);
		return { tokens, accounts: await this.listAdAccounts(tokens.accessToken) };
	}

	/**
	 * https://developers.facebook.com/docs/marketing-api/reference/user/adaccounts
	 * The user's Pages (with their linked IG account) ride along in each account's
	 * metadata so the UI can ask which identity the ads run as (`pageId`).
	 */
	async listAdAccounts(accessToken: string): Promise<AdAccount[]> {
		const rows = await graphPagesBounded<AccountRow>(
			PROVIDER,
			`${this.graph}/me/adaccounts?${form({
				fields:
					"account_id,name,currency,timezone_name,account_status,min_daily_budget,business{id,name}",
				limit: "100",
			})}`,
			accessToken,
			{ maxPages: 10 },
		);
		const pages = await graphPagesBounded<PageRow>(
			PROVIDER,
			`${this.graph}/me/accounts?${form({ fields: "id,name,instagram_business_account{id}", limit: "100" })}`,
			accessToken,
			{ maxPages: 5 },
		);
		const availablePages = pages.map((p) => ({
			id: p.id,
			name: p.name,
			instagramUserId: p.instagram_business_account?.id ?? null,
		}));
		return rows.map((a) => ({
			externalId: a.account_id,
			name: a.name ?? `Ad account ${a.account_id}`,
			currency: a.currency ?? "USD",
			timezone: a.timezone_name ?? null,
			status: mapMetaAccountStatus(a.account_status),
			metadata: {
				accountStatus: a.account_status ?? null,
				// In the account currency's offset units (see toMetaAmount).
				minDailyBudget: a.min_daily_budget ?? null,
				businessId: a.business?.id ?? null,
				availablePages,
			},
		}));
	}

	validate(draft: CampaignDraft, account: { currency: string }): string[] {
		const currency = account.currency.toUpperCase();
		const errors = validateDraftBasics(draft, account, {
			platform: "Meta",
			capabilities,
			lifetimeBudget: true,
			digits: metaCurrencyDigits,
			minDaily: { USD: minDailyUsd(draft.objective) },
			unsupportedTargeting: ["languages", "keywords", "jobTitles", "industries"],
		});
		// Meta requires lifetime ≥ daily minimum × days scheduled.
		if (currency === "USD" && draft.lifetimeBudget !== undefined && draft.endAt) {
			const days = Math.ceil((Date.parse(draft.endAt) - Date.parse(draft.startAt)) / 86_400_000);
			const min = minDailyUsd(draft.objective) * Math.max(1, days);
			if (Number.isFinite(days) && draft.lifetimeBudget < min) {
				errors.push(`Meta requires a lifetime budget of at least ${min.toFixed(2)} USD here`);
			}
		}
		const t = draft.targeting;
		if (t.ageMin !== undefined && (t.ageMin < 13 || t.ageMin > 65)) {
			errors.push("Meta ages must be between 13 and 65");
		}
		if (t.ageMax !== undefined && (t.ageMax < 13 || t.ageMax > 65)) {
			errors.push("Meta ages must be between 13 and 65");
		}
		draft.ads.forEach((ad, i) => {
			for (const e of this.validateAd(draft.objective, ad)) errors.push(`Ad ${i + 1}: ${e}`);
		});
		return errors;
	}

	private validateAd(objective: AdObjective, ad: AdDraft): string[] {
		const errors: string[] = [];
		const images = countMedia(ad, "image");
		const videos = countMedia(ad, "video");
		if (ad.format === "image" && (images !== 1 || videos !== 0)) {
			errors.push("An image ad needs exactly one image");
		}
		if (ad.format === "video" && (videos !== 1 || images > 1)) {
			errors.push("A video ad needs exactly one video (plus optionally one thumbnail image)");
		}
		if (ad.format === "carousel" && (images < CAROUSEL_MIN || images > CAROUSEL_MAX || videos)) {
			errors.push(`A carousel needs ${CAROUSEL_MIN}-${CAROUSEL_MAX} images`);
		}
		if (objective === "video_views" && ad.format !== "video") {
			errors.push("The video views objective needs video ads");
		}
		return errors;
	}

	/** Graph calls bound to one context's token; the adapter itself keeps no state. */
	private client(accessToken: string): GraphClient {
		const graph = this.graph;
		return {
			post: <T>(path: string, body: Record<string, unknown>) =>
				providerJson<T>(PROVIDER, `${graph}/${path}`, {
					method: "POST",
					mutating: true,
					headers: graphHeaders(accessToken, true),
					body: JSON.stringify(body),
					classify: this.classify(true),
				}),
			get: <T>(path: string, params: Record<string, string>) =>
				providerJson<T>(PROVIDER, `${graph}/${path}?${form(params)}`, {
					headers: graphHeaders(accessToken, false),
					classify: this.classify(),
				}),
			remove: async (id: string) => {
				await providerJson(PROVIDER, `${graph}/${id}`, {
					method: "DELETE",
					mutating: true,
					headers: graphHeaders(accessToken, false),
					classify: this.classify(true),
				});
			},
		};
	}

	async createCampaign(ctx: AdsContext, draft: CampaignDraft): Promise<CreatedCampaign> {
		const api = this.client(ctx.accessToken);
		const pageId = typeof ctx.metadata.pageId === "string" ? ctx.metadata.pageId : "";
		const instagramUserId =
			typeof ctx.metadata.instagramUserId === "string" ? ctx.metadata.instagramUserId : null;
		const pixelId = typeof ctx.metadata.pixelId === "string" ? ctx.metadata.pixelId : null;
		const spec = OBJECTIVES[draft.objective];

		// Pre-flight: nothing is sent unless the draft is valid for this account.
		const errors = this.validate(draft, { currency: ctx.currency });
		if (!pageId) errors.push("Choose the Facebook Page the ads run as (metadata.pageId)");
		if (spec?.pixelEvent && !pixelId) {
			errors.push("Leads and sales campaigns need the ad account's Meta pixel (metadata.pixelId)");
		}
		const budget = draftBudget(draft);
		const minDaily = Number(ctx.metadata.minDailyBudget);
		if (
			budget.kind === "daily" &&
			Number.isFinite(minDaily) &&
			minDaily > 0 &&
			errors.length === 0 &&
			Number(toMetaAmount(budget.amount, ctx.currency)) < minDaily
		) {
			errors.push("The daily budget is below this ad account's minimum");
		}
		if (errors.length > 0 || !spec) throw draftRejected(PROVIDER, errors);

		const account = actId(ctx.accountExternalId);
		const created: CreatedStep[] = [];
		const objects: CreatedCampaign["objects"] = [];
		try {
			// 1. Campaign — PAUSED. special_ad_categories is mandatory; [] declares
			// "none of housing/employment/credit/politics" (the UI must confirm that).
			const campaign = await api.post<{ id: string }>(`${account}/campaigns`, {
				name: draft.name,
				objective: spec.objective,
				status: "PAUSED",
				special_ad_categories: [],
				buying_type: "AUCTION",
				// Budget lives on the ad set, not shared at campaign level.
				is_adset_budget_sharing_enabled: false,
			});
			created.push({
				type: "campaign",
				externalId: campaign.id,
				cleanup: () => api.remove(campaign.id),
			});

			// 2. Ad set — PAUSED, budget in offset units, explicit targeting.
			const amount = toMetaAmount(budget.amount, ctx.currency);
			const adSet = await api.post<{ id: string }>(`${account}/adsets`, {
				name: draft.name,
				campaign_id: campaign.id,
				status: "PAUSED",
				...(budget.kind === "daily" ? { daily_budget: amount } : { lifetime_budget: amount }),
				billing_event: "IMPRESSIONS",
				optimization_goal: spec.optimizationGoal,
				bid_strategy: "LOWEST_COST_WITHOUT_CAP",
				...(spec.destinationType ? { destination_type: spec.destinationType } : {}),
				...(spec.pixelEvent
					? { promoted_object: { pixel_id: pixelId, custom_event_type: spec.pixelEvent } }
					: {}),
				targeting: metaTargetingSpec(draft.targeting),
				start_time: unixSeconds(draft.startAt),
				...(draft.endAt ? { end_time: unixSeconds(draft.endAt) } : {}),
			});
			created.push({ type: "ad_set", externalId: adSet.id, cleanup: () => api.remove(adSet.id) });
			objects.push({ type: "ad_set", externalId: adSet.id });

			// 3. Per ad: media → creative → ad (PAUSED).
			for (const [i, ad] of draft.ads.entries()) {
				const storySpec = await this.storySpec(
					api,
					account,
					ad,
					pageId,
					instagramUserId,
					(step) => {
						created.push(step);
						objects.push({ type: "asset", externalId: step.externalId });
					},
				);
				const creative = await api.post<{ id: string }>(`${account}/adcreatives`, {
					name: `${draft.name} — creative ${i + 1}`,
					object_story_spec: storySpec,
				});
				created.push({
					type: "creative",
					externalId: creative.id,
					cleanup: () => api.remove(creative.id),
				});
				objects.push({ type: "creative", externalId: creative.id });

				const created_ad = await api.post<{ id: string }>(`${account}/ads`, {
					name: `${draft.name} — ad ${i + 1}`,
					adset_id: adSet.id,
					creative: { creative_id: creative.id },
					status: "PAUSED",
				});
				created.push({
					type: "ad",
					externalId: created_ad.id,
					cleanup: () => api.remove(created_ad.id),
				});
				objects.push({ type: "ad", externalId: created_ad.id });
			}

			return {
				campaignExternalId: campaign.id,
				objects,
				status: "paused",
				manageUrl: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?${form({
					act: account.replace(/^act_/, ""),
					selected_campaign_ids: campaign.id,
				})}`,
			};
		} catch (error) {
			return rollbackAndThrow(PROVIDER, created, error, ctx.logger);
		}
	}

	/** object_story_spec for one ad; uploads a video first when needed. */
	private async storySpec(
		api: GraphClient,
		account: string,
		ad: AdDraft,
		pageId: string,
		instagramUserId: string | null,
		onAsset: (step: CreatedStep) => void,
	): Promise<Record<string, unknown>> {
		const cta = { type: CTA[ad.callToAction ?? "learn_more"], value: { link: ad.destinationUrl } };
		const identity = {
			page_id: pageId,
			...(instagramUserId ? { instagram_user_id: instagramUserId } : {}),
		};
		const images = ad.media.filter((m) => m.kind === "image");

		if (ad.format === "video") {
			const video = ad.media.find((m) => m.kind === "video") as MediaItem;
			const videoId = await this.uploadVideo(
				api,
				account,
				video,
				ad.headline ?? "Ad video",
				onAsset,
			);
			const thumbnail = images[0]?.url ?? (await this.preferredThumbnail(api, videoId));
			return {
				...identity,
				video_data: {
					video_id: videoId,
					// A thumbnail is required in practice; Meta's CDN URLs are discouraged,
					// so our own image wins when the user supplied one.
					...(thumbnail ? { image_url: thumbnail } : {}),
					message: ad.primaryText,
					...(ad.headline ? { title: ad.headline } : {}),
					...(ad.description ? { link_description: ad.description } : {}),
					call_to_action: cta,
				},
			};
		}

		// `picture` takes a public URL and Meta saves it to the ad image library,
		// so no separate /adimages upload (which only accepts bytes) is needed.
		const linkData: Record<string, unknown> = {
			link: ad.destinationUrl,
			message: ad.primaryText,
			...(ad.headline ? { name: ad.headline } : {}),
			...(ad.description ? { description: ad.description } : {}),
			call_to_action: cta,
		};
		if (ad.format === "carousel") {
			linkData.child_attachments = images.map((img) => ({
				link: ad.destinationUrl,
				picture: img.url,
				...(ad.headline ? { name: ad.headline } : {}),
				call_to_action: cta,
			}));
		} else {
			linkData.picture = images[0]?.url;
		}
		return { ...identity, link_data: linkData };
	}

	/**
	 * advideos with `file_url` (Meta fetches it), then poll `status.video_status`
	 * until "ready" — bounded, so a stuck upload fails the create instead of hanging.
	 */
	private async uploadVideo(
		api: GraphClient,
		account: string,
		video: MediaItem,
		name: string,
		onAsset: (step: CreatedStep) => void,
	): Promise<string> {
		const res = await api.post<{ id: string }>(`${account}/advideos`, {
			file_url: video.url,
			name,
		});
		onAsset({ type: "asset", externalId: res.id, cleanup: () => api.remove(res.id) });
		for (let attempt = 0; attempt < this.pollMaxAttempts; attempt++) {
			const status = await api.get<{ status?: { video_status?: string } }>(res.id, {
				fields: "status",
			});
			const state = status.status?.video_status;
			if (state === "ready") return res.id;
			if (state === "error") {
				throw new ProviderError("invalid_request", PROVIDER, "Meta could not process the video");
			}
			await sleep(this.pollIntervalMs);
		}
		throw new ProviderError(
			"transient",
			PROVIDER,
			"Meta is still processing the video; try again in a few minutes",
		);
	}

	private async preferredThumbnail(api: GraphClient, videoId: string): Promise<string | null> {
		const res = await api.get<{ data?: { uri: string; is_preferred?: boolean }[] }>(
			`${videoId}/thumbnails`,
			{},
		);
		const thumbs = res.data ?? [];
		return (thumbs.find((t) => t.is_preferred) ?? thumbs[0])?.uri ?? null;
	}

	/**
	 * Activation turns on the ad sets and ads we created (all PAUSED) and the
	 * campaign LAST, so nothing can deliver until every child is ready. Pausing
	 * touches only the campaign: a paused campaign stops all delivery beneath it.
	 */
	async setStatus(ctx: AdsContext, campaignExternalId: string, status: "active" | "paused") {
		const api = this.client(ctx.accessToken);
		if (status === "active") {
			for (const edge of ["adsets", "ads"] as const) {
				const children = await graphPagesBounded<{ id: string; status?: string }>(
					PROVIDER,
					`${this.graph}/${campaignExternalId}/${edge}?${form({ fields: "id,status", limit: "100" })}`,
					ctx.accessToken,
					{ maxPages: 5 },
				);
				for (const child of children) {
					if (child.status === "PAUSED") await api.post(child.id, { status: "ACTIVE" });
				}
			}
		}
		await api.post(campaignExternalId, { status: status === "active" ? "ACTIVE" : "PAUSED" });
	}

	/** ARCHIVED stops delivery and keeps the reporting history (DELETE would too, but is final). */
	async archiveCampaign(ctx: AdsContext, campaignExternalId: string) {
		await this.client(ctx.accessToken).post(campaignExternalId, { status: "ARCHIVED" });
	}

	async getCampaignStatus(ctx: AdsContext, campaignExternalId: string) {
		const api = this.client(ctx.accessToken);
		const campaign = await api.get<{ effective_status?: string }>(campaignExternalId, {
			fields: "effective_status",
		});
		const ads =
			campaign.effective_status === "ACTIVE"
				? await api.get<{ data?: { effective_status?: string }[] }>(`${campaignExternalId}/ads`, {
						fields: "effective_status",
						limit: "50",
					})
				: { data: [] };
		return mapMetaCampaignStatus(
			campaign.effective_status,
			(ads.data ?? []).map((a) => a.effective_status ?? ""),
		);
	}

	/** One insights read per campaign, daily rows (time_increment=1). */
	async getInsights(
		ctx: AdsContext,
		input: { campaignExternalIds: string[]; since: string; until: string },
	): Promise<CampaignInsightsDay[]> {
		const out: CampaignInsightsDay[] = [];
		for (const id of input.campaignExternalIds) {
			const rows = await graphPagesBounded<InsightsRow>(
				PROVIDER,
				`${this.graph}/${id}/insights?${form({
					fields: "campaign_id,spend,impressions,reach,clicks,actions",
					time_increment: "1",
					time_range: JSON.stringify({ since: input.since, until: input.until }),
					limit: "100",
				})}`,
				ctx.accessToken,
				{ maxPages: 10 },
			);
			for (const row of rows) out.push(mapMetaInsightsRow(id, row));
		}
		return out;
	}

	/**
	 * Targeting search: https://developers.facebook.com/docs/marketing-api/audiences/reference/targeting-search
	 * Locations encode their kind in the id ("city:2418779") for metaTargetingSpec.
	 */
	async searchTargeting(
		ctx: AdsContext,
		input: { type: TargetingOption["type"]; query: string; limit: number },
	): Promise<TargetingOption[]> {
		const api = this.client(ctx.accessToken);
		if (input.type === "interest") {
			const res = await api.get<{ data?: { id: string; name: string }[] }>("search", {
				type: "adinterest",
				q: input.query,
				limit: String(input.limit),
			});
			return (res.data ?? []).map((r) => ({ id: r.id, name: r.name, type: "interest" }));
		}
		if (input.type === "location") {
			const res = await api.get<{
				data?: {
					key: string;
					name: string;
					type: string;
					region?: string;
					country_name?: string;
				}[];
			}>("search", {
				type: "adgeolocation",
				q: input.query,
				location_types: JSON.stringify(["country", "region", "city", "zip"]),
				limit: String(input.limit),
			});
			return (res.data ?? []).map((r) => ({
				id: `${r.type}:${r.key}`,
				name: [r.name, r.region, r.country_name].filter(Boolean).join(", "),
				type: "location",
			}));
		}
		return [];
	}
}

export function createMetaAdsProvider(env: MetaAdsEnv, options?: MetaAdsOptions): AdsProvider {
	return new MetaAdsProvider(env, options);
}
