import { chunk, num, splitRange } from "../analytics";
import { ProviderError, type ProviderErrorKind } from "../errors";
import { providerFetch } from "../http";
import type { MediaItem } from "../types";
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
	TargetingOption,
} from "./types";

/**
 * TikTok Ads — TikTok API for Business (Marketing API) v1.3.
 *
 * TikTok's docs site could not be fetched from our network (TikTok is blocked in
 * India), so endpoints, fields and enums were confirmed against TikTok's OFFICIAL
 * SDK (github.com/tiktok/tiktok-business-api-sdk — OpenAPI yml files and the
 * error-code table) and cross-checked with the doc text mirrored in bububa's Go
 * SDK. Doc pages (ids from the SDK):
 *   OAuth token        https://business-api.tiktok.com/portal/docs?id=1739965703387137
 *   Advertiser info    https://business-api.tiktok.com/portal/docs?id=1739593083610113
 *   Campaign create    https://business-api.tiktok.com/portal/docs?id=1739318962329602
 *   Ad group create    https://business-api.tiktok.com/portal/docs?id=1739499616346114
 *   Ad create          https://business-api.tiktok.com/portal/docs?id=1739953377508354
 *   Video upload       https://ads.tiktok.com/marketing_api/docs?id=1737587322856449
 *   Image upload       https://ads.tiktok.com/marketing_api/docs?id=1739067433456642
 *   Report             https://business-api.tiktok.com/portal/docs?id=1740302848100353
 *   Return codes       https://ads.tiktok.com/marketing_api/docs?id=1737172488964097
 *
 * Creation: campaign (DISABLE, no campaign budget) → ad group (DISABLE, budget +
 * schedule + targeting) → video + cover image upload by URL (library assets,
 * invisible) → ads (DISABLE) under the advertiser's identity. Delivery needs all
 * three levels enabled, so any one DISABLE keeps spend at zero.
 *
 * Every response is HTTP 200 with `{code, message, request_id, data}`; code 0 = OK.
 */

export type TikTokAdsEnv = { TIKTOK_ADS_APP_ID: string; TIKTOK_ADS_APP_SECRET: string };

const PROVIDER = "tiktok_ads";
const API = "https://business-api.tiktok.com/open_api/v1.3";
const AUTH_URL = "https://business-api.tiktok.com/portal/auth";

/** ad_text: 1–100 characters, no emoji. */
const AD_TEXT_MAX = 100;
/** display_name: 1–40 Latin characters. */
const DISPLAY_NAME_MAX = 40;
/** Campaign/ad group/ad names: ≤ 512 characters. */
const NAME_MAX = 512;
/** ad/create: ≤ 20 creatives per call; status updates ≤ 20 ids. */
const CREATIVES_PER_CALL = 20;
const STATUS_IDS_MAX = 20;
/** report/integrated/get: ≤ 30 days with stat_time_day, page_size ≤ 1000. */
const REPORT_MAX_DAYS = 30;
const REPORT_PAGE_SIZE = 1000;
const REPORT_MAX_PAGES = 20;
const REPORT_IDS_PER_CALL = 100;
/** advertiser/info takes a list of advertiser ids; stay modest per call. */
const INFO_IDS_PER_CALL = 50;
const PLACEMENTS = ["PLACEMENT_TIKTOK"];

/** ISO 4217 currencies without minor units. */
const ZERO_DECIMAL = new Set(["JPY", "KRW", "CLP", "VND"]);

/**
 * Minimum ad group budget. TikTok documents USD 20/day (lifetime: 20 × scheduled
 * days); its per-currency table could not be confirmed, so other currencies are
 * left to TikTok's own validation (a rejected create, nothing spent).
 */
const MIN_DAILY: Record<string, number> = { USD: 20 };

/**
 * Objectives and the ad group settings each needs. LEAD_GENERATION, WEB_CONVERSIONS,
 * PRODUCT_SALES and APP_PROMOTION need a form, pixel, catalog or app SocialFly does
 * not manage; ENGAGEMENT optimises for TikTok-account follows, which needs a
 * TikTok-account identity. None of them are offered.
 * VIDEO_VIEW as an optimisation goal is deprecated in favour of ENGAGED_VIEW.
 */
const OBJECTIVES: Partial<
	Record<AdObjective, { objective: string; goal: string; billing: string; promotionType?: string }>
> = {
	awareness: { objective: "REACH", goal: "REACH", billing: "CPM" },
	traffic: { objective: "TRAFFIC", goal: "CLICK", billing: "CPC", promotionType: "WEBSITE" },
	video_views: { objective: "VIDEO_VIEWS", goal: "ENGAGED_VIEW", billing: "CPV" },
};

const CTA: Record<NonNullable<AdDraft["callToAction"]>, string> = {
	learn_more: "LEARN_MORE",
	shop_now: "SHOP_NOW",
	sign_up: "SIGN_UP",
	contact_us: "CONTACT_US",
	download: "DOWNLOAD_NOW",
	book_now: "BOOK_NOW",
	get_quote: "GET_QUOTE",
	subscribe: "SUBSCRIBE",
};

/** age_groups buckets. 13–17 is never offered: ads to minors are not something we automate. */
const AGE_GROUPS: [number, number, string][] = [
	[18, 24, "AGE_18_24"],
	[25, 34, "AGE_25_34"],
	[35, 44, "AGE_35_44"],
	[45, 54, "AGE_45_54"],
	[55, 100, "AGE_55_100"],
];

const capabilities: AdsCapabilities = {
	objectives: Object.keys(OBJECTIVES) as AdObjective[],
	// Video in the TikTok feed only. Image ads serve on Pangle/app-bundle placements
	// and carousels need a music_id; neither is supported yet.
	formats: ["video"],
	minDailyBudgetUsd: 20,
	maxAdsPerCampaign: 20,
	textLimits: { primaryText: AD_TEXT_MAX, headline: DISPLAY_NAME_MAX },
};

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)

/**
 * Budget in the account currency, rounded to its minor unit. TikTok takes a
 * decimal number in major units; going through integer cents makes 25.5 stay
 * 25.5 rather than 25.499999. Null when the amount has too many decimals.
 */
export function tiktokBudget(amount: number, currency: string): number | null {
	const factor = ZERO_DECIMAL.has(currency) ? 1 : 100;
	const minor = Math.round(amount * factor);
	if (Math.abs(minor - amount * factor) > 1e-6) return null;
	return minor / factor;
}

/** ISO → "YYYY-MM-DD HH:MM:SS" in UTC, the format schedule times use. */
export const tiktokTime = (iso: string) =>
	new Date(iso).toISOString().slice(0, 19).replace("T", " ");

/**
 * ageMin/ageMax → age_groups. Only ranges on TikTok's bucket edges are accepted
 * (e.g. 25–44), so the audience is exactly what the user chose. undefined = no
 * age targeting (TikTok's default is 18+); null = not representable.
 */
export function tiktokAgeGroups(ageMin?: number, ageMax?: number): string[] | null | undefined {
	if (ageMin === undefined && ageMax === undefined) return undefined;
	const min = ageMin ?? 18;
	const max = ageMax === undefined || ageMax >= 55 ? 100 : ageMax;
	if (!AGE_GROUPS.some(([lo]) => lo === min)) return null;
	if (!AGE_GROUPS.some(([, hi]) => hi === max)) return null;
	const groups = AGE_GROUPS.filter(([lo, hi]) => lo >= min && hi <= max).map(([, , g]) => g);
	return groups.length ? groups : null;
}

type TikTokCampaign = { campaign_id: string; operation_status?: string; secondary_status?: string };

/** Campaign → our status: secondary_status says why; operation_status is the switch. */
export function mapTikTokStatus(
	c: Pick<TikTokCampaign, "operation_status" | "secondary_status">,
): Awaited<ReturnType<AdsProvider["getCampaignStatus"]>> {
	switch (c.secondary_status) {
		case "CAMPAIGN_STATUS_DELETE":
			return "deleted";
		case "CAMPAIGN_STATUS_ADVERTISER_AUDIT":
			return "in_review";
		case "CAMPAIGN_STATUS_ADVERTISER_AUDIT_DENY":
		case "CAMPAIGN_STATUS_REVIEW_DISAPPROVED":
			return "rejected";
	}
	if (c.operation_status === "DELETE") return "deleted";
	return c.operation_status === "ENABLE" ? "active" : "paused";
}

/** Advertiser status → can we create campaigns now? */
export function mapAdvertiserStatus(status: string | undefined): AdAccount["status"] {
	if (status === "STATUS_ENABLE") return "active";
	if (
		status === "STATUS_DISABLE" ||
		status === "STATUS_LIMIT" ||
		status === "STATUS_CONFIRM_FAIL" ||
		status === "STATUS_CONFIRM_FAIL_END" ||
		status === "STATUS_CONFIRM_MODIFY_FAIL"
	)
		return "disabled";
	return "pending";
}

// ---------------------------------------------------------------------------
// Envelope + error mapping

type Envelope<T> = { code: number; message?: string; request_id?: string; data?: T };

const RATE_LIMITED = new Set([40100, 40132, 61000]);
/** Token expired/invalid/empty, advertiser logged out, permission or scope missing. */
const AUTH = new Set([40001, 40102, 40104, 40105, 40114, 40130]);

/**
 * `code` → ProviderError kind. 5xxxx (system error/timeout) and 60001
 * (maintenance) on a write may have been applied → unknown_outcome.
 */
export function tiktokErrorKind(code: number, mutating: boolean): ProviderErrorKind {
	if (RATE_LIMITED.has(code)) return "rate_limited";
	if (AUTH.has(code)) return "auth";
	if (code >= 50000 || code === 60001) return mutating ? "unknown_outcome" : "transient";
	return "invalid_request";
}

// ---------------------------------------------------------------------------
// Rollback (same contract as pinterest.ts / x-ads.ts)

type ErrorDetails = ProviderError["details"] & { orphanedExternalIds?: string[] };

async function rollback(
	ctx: AdsContext,
	error: unknown,
	undo: { ids: string[]; run: () => Promise<void> }[],
): Promise<never> {
	const orphaned: string[] = [];
	for (const step of [...undo].reverse()) {
		try {
			await step.run();
		} catch (cleanupError) {
			ctx.logger.warn(
				{ err: cleanupError, ids: step.ids },
				"tiktok_ads: cleanup after failed campaign creation failed",
			);
			orphaned.push(...step.ids);
		}
	}
	const original =
		error instanceof ProviderError
			? error
			: new ProviderError(
					"unknown_outcome",
					PROVIDER,
					(error as Error)?.message ?? "failed",
					{},
					{
						cause: error,
					},
				);
	const details: ErrorDetails = { ...original.details, orphanedExternalIds: orphaned };
	throw new ProviderError(
		original.kind,
		PROVIDER,
		orphaned.length
			? `${original.message} (cleanup incomplete: ${orphaned.length} object(s) left on TikTok)`
			: `${original.message} (everything created was removed)`,
		details,
		{ cause: error },
	);
}

// ---------------------------------------------------------------------------

type Advertiser = {
	advertiser_id: string;
	name?: string;
	status?: string;
	currency?: string;
	timezone?: string;
	display_timezone?: string;
	role?: string;
	country?: string;
};
type ReportRow = {
	dimensions?: { campaign_id?: string; stat_time_day?: string };
	metrics?: Record<string, string | number | null>;
};
type PageInfo = { page?: number; total_page?: number };

const hasEmoji = (s: string) => /\p{Extended_Pictographic}/u.test(s);

/** Random 63-bit decimal for campaign/create's `request_id` idempotency key. */
const idempotencyKey = () =>
	((crypto.getRandomValues(new BigUint64Array(1))[0] as bigint) >> 1n).toString();

export function createTikTokAdsProvider(env: TikTokAdsEnv): AdsProvider {
	type Call = {
		method?: "GET" | "POST";
		query?: Record<string, unknown>;
		body?: Record<string, unknown>;
		mutating?: boolean;
		timeoutMs?: number;
	};

	/**
	 * One call with TikTok's envelope applied. GET params that are arrays or objects
	 * are JSON-encoded strings (e.g. advertiser_ids=["1"]).
	 */
	async function call<T>(accessToken: string | null, path: string, c: Call = {}): Promise<T> {
		const params = new URLSearchParams();
		for (const [k, v] of Object.entries(c.query ?? {})) {
			if (v === undefined) continue;
			params.set(k, typeof v === "string" ? v : JSON.stringify(v));
		}
		const qs = params.toString();
		const mutating = c.mutating ?? false;
		const res = await providerFetch(PROVIDER, `${API}${path}${qs ? `?${qs}` : ""}`, {
			method: c.method ?? "GET",
			mutating,
			timeoutMs: c.timeoutMs,
			headers: {
				...(accessToken ? { "Access-Token": accessToken } : {}),
				...(c.body ? { "Content-Type": "application/json" } : {}),
			},
			body: c.body ? JSON.stringify(c.body) : undefined,
		});
		const text = await res.text();
		let env: Envelope<T>;
		try {
			env = JSON.parse(text) as Envelope<T>;
		} catch {
			throw new ProviderError(
				mutating ? "unknown_outcome" : "transient",
				PROVIDER,
				`${path}: unreadable response`,
				{ body: text.slice(0, 2000) },
			);
		}
		if (env.code !== 0) {
			const kind = tiktokErrorKind(env.code, mutating);
			throw new ProviderError(kind, PROVIDER, `${path}: ${env.message ?? "error"} (${env.code})`, {
				platformCode: String(env.code),
				body: text.slice(0, 2000),
				// TikTok asks for a 5-minute pause after a per-minute limit is hit.
				...(kind === "rate_limited" ? { retryAfterMs: 5 * 60_000 } : {}),
			});
		}
		return env.data as T;
	}

	async function advertiserInfo(accessToken: string, ids: string[]): Promise<AdAccount[]> {
		const out: AdAccount[] = [];
		for (const batch of chunk(ids, INFO_IDS_PER_CALL)) {
			const data = await call<{ list?: Advertiser[] }>(accessToken, "/advertiser/info/", {
				query: {
					advertiser_ids: batch,
					fields: [
						"advertiser_id",
						"name",
						"status",
						"currency",
						"timezone",
						"display_timezone",
						"role",
						"country",
					],
				},
			});
			for (const a of data.list ?? []) {
				out.push({
					externalId: String(a.advertiser_id),
					name: a.name ?? String(a.advertiser_id),
					currency: a.currency ?? "USD",
					// display_timezone is IANA ("America/Los_Angeles"); timezone may be "Etc/GMT+8".
					timezone: a.display_timezone ?? a.timezone ?? null,
					status: mapAdvertiserStatus(a.status),
					metadata: {
						platformStatus: a.status ?? null,
						role: a.role ?? null,
						country: a.country ?? null,
					},
				});
			}
		}
		return out;
	}

	function validate(
		draft: CampaignDraft,
		account: { currency: string; metadata?: Record<string, unknown> },
	): string[] {
		const errors: string[] = [];
		const currency = account.currency.toUpperCase();
		if (!OBJECTIVES[draft.objective])
			errors.push(`TikTok does not support the "${draft.objective}" objective here`);
		if (!draft.name.trim() || draft.name.length > NAME_MAX)
			errors.push(`Campaign name must be 1–${NAME_MAX} characters`);
		if (hasEmoji(draft.name)) errors.push("TikTok names cannot contain emoji");
		if (account.metadata && !account.metadata.identityId)
			errors.push("Choose the TikTok identity (display name and avatar) the ads run as");

		const budgets = [draft.dailyBudget, draft.lifetimeBudget].filter((b) => b !== undefined);
		if (budgets.length !== 1) errors.push("Set exactly one of a daily or a lifetime budget");
		const start = Date.parse(draft.startAt);
		const end = draft.endAt ? Date.parse(draft.endAt) : Number.NaN;
		if (Number.isNaN(start)) errors.push("Start date is invalid");
		if (draft.lifetimeBudget !== undefined && !draft.endAt)
			errors.push("A lifetime budget needs an end date");
		if (draft.endAt && !(end > start)) errors.push("End date must be after the start date");
		for (const b of budgets) {
			if (!(b > 0)) errors.push("Budget must be greater than zero");
			else if (tiktokBudget(b, currency) === null)
				errors.push(
					ZERO_DECIMAL.has(currency)
						? `${currency} budgets must be whole amounts`
						: "Budget can have at most 2 decimal places",
				);
		}
		const min = MIN_DAILY[currency];
		if (min !== undefined) {
			if (draft.dailyBudget !== undefined && draft.dailyBudget < min)
				errors.push(`TikTok's minimum daily budget is ${min} ${currency}`);
			if (draft.lifetimeBudget !== undefined && end > start) {
				const days = Math.ceil((end - start) / 86_400_000);
				if (draft.lifetimeBudget < min * days)
					errors.push(
						`TikTok needs a lifetime budget of at least ${min * days} ${currency} (${min} × ${days} days)`,
					);
			}
		}

		const t = draft.targeting;
		if (!t.countries.length) errors.push("Choose at least one country");
		if (tiktokAgeGroups(t.ageMin, t.ageMax) === null)
			errors.push(
				"TikTok age ranges start at 18, 25, 35, 45 or 55 and end at 24, 34, 44, 54 or 55+",
			);
		if (t.keywords?.length) errors.push("Keyword targeting is not supported for TikTok ads");

		if (!draft.ads.length) errors.push("Add at least one ad");
		if (draft.ads.length > capabilities.maxAdsPerCampaign)
			errors.push(`At most ${capabilities.maxAdsPerCampaign} ads per campaign`);
		draft.ads.forEach((ad, i) => {
			const label = `Ad ${i + 1}`;
			if (ad.format !== "video") {
				errors.push(`${label}: TikTok ads here must be video`);
				return;
			}
			const videos = ad.media.filter((m) => m.kind === "video");
			const images = ad.media.filter((m) => m.kind === "image");
			if (videos.length !== 1 || images.length > 1)
				errors.push(`${label}: needs exactly one video (and optionally one cover image)`);
			const text = ad.primaryText.trim();
			if (!text || text.length > AD_TEXT_MAX)
				errors.push(`${label}: text must be 1–${AD_TEXT_MAX} characters`);
			if (hasEmoji(ad.primaryText)) errors.push(`${label}: TikTok ad text cannot contain emoji`);
			if (ad.headline && ad.headline.length > DISPLAY_NAME_MAX)
				errors.push(`${label}: display name is limited to ${DISPLAY_NAME_MAX} characters`);
			if (!/^https?:\/\//i.test(ad.destinationUrl))
				errors.push(`${label}: destination must be a web URL`);
			if (ad.name.length > NAME_MAX) errors.push(`${label}: name is too long`);
		});
		return errors;
	}

	/** Country codes → TikTok location ids (country level of /tool/region/). */
	async function countryLocationIds(
		ctx: AdsContext,
		objective: string,
		countries: string[],
	): Promise<string[]> {
		const data = await call<{
			region_info?: {
				location_id?: string;
				region_code?: string;
				country_code?: string;
				level?: string;
			}[];
		}>(ctx.accessToken, "/tool/region/", {
			query: {
				advertiser_id: ctx.accountExternalId,
				placements: PLACEMENTS,
				objective_type: objective,
				level_range: "TO_COUNTRY",
			},
		});
		const byCode = new Map<string, string>();
		for (const r of data.region_info ?? []) {
			const code = (r.region_code ?? r.country_code ?? "").toUpperCase();
			if (r.location_id && code && !byCode.has(code)) byCode.set(code, String(r.location_id));
		}
		return countries.map((c) => {
			const id = byCode.get(c.toUpperCase());
			if (!id)
				throw new ProviderError(
					"invalid_request",
					PROVIDER,
					`TikTok cannot target the country ${c}`,
				);
			return id;
		});
	}

	/**
	 * Library assets (not visible to anyone, not mutating in the publishing sense).
	 * file_name must be unique per advertiser, hence the random suffix.
	 */
	const fileName = (base: string) =>
		`${base.slice(0, 60)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

	async function uploadVideo(ctx: AdsContext, video: MediaItem, name: string) {
		const data = await call<{ video_id: string; video_cover_url?: string }[]>(
			ctx.accessToken,
			"/file/video/ad/upload/",
			{
				method: "POST",
				timeoutMs: 180_000,
				body: {
					advertiser_id: ctx.accountExternalId,
					upload_type: "UPLOAD_BY_URL",
					video_url: video.url,
					file_name: fileName(name),
				},
			},
		);
		const first = Array.isArray(data) ? data[0] : (data as unknown as { video_id: string });
		if (!first?.video_id)
			throw new ProviderError("transient", PROVIDER, "TikTok returned no video_id");
		return first as { video_id: string; video_cover_url?: string };
	}

	async function uploadImage(ctx: AdsContext, url: string, name: string): Promise<string> {
		const data = await call<{ image_id: string }>(ctx.accessToken, "/file/image/ad/upload/", {
			method: "POST",
			body: {
				advertiser_id: ctx.accountExternalId,
				upload_type: "UPLOAD_BY_URL",
				image_url: url,
				file_name: fileName(name),
			},
		});
		if (!data?.image_id)
			throw new ProviderError("transient", PROVIDER, "TikTok returned no image_id");
		return data.image_id;
	}

	const setOperationStatus = (
		ctx: AdsContext,
		level: "campaign" | "adgroup" | "ad",
		ids: string[],
		status: "ENABLE" | "DISABLE" | "DELETE",
	) =>
		Promise.all(
			chunk(ids, STATUS_IDS_MAX).map((batch) =>
				call(ctx.accessToken, `/${level}/status/update/`, {
					method: "POST",
					mutating: true,
					body: {
						advertiser_id: ctx.accountExternalId,
						[`${level}_ids`]: batch,
						operation_status: status,
					},
				}),
			),
		).then(() => undefined);

	async function createCampaign(ctx: AdsContext, draft: CampaignDraft): Promise<CreatedCampaign> {
		const identityId = typeof ctx.metadata.identityId === "string" ? ctx.metadata.identityId : "";
		const errors = validate(draft, {
			currency: ctx.currency,
			metadata: { ...ctx.metadata, identityId },
		});
		if (errors.length)
			throw new ProviderError("invalid_request", PROVIDER, errors.join("; "), {
				platformCode: "validation",
			});
		const identityType =
			typeof ctx.metadata.identityType === "string" ? ctx.metadata.identityType : "CUSTOMIZED_USER";
		const currency = ctx.currency.toUpperCase();
		const spec = OBJECTIVES[draft.objective] as NonNullable<(typeof OBJECTIVES)[AdObjective]>;
		const t = draft.targeting;

		// Read before any write: a failure here leaves nothing behind.
		const locationIds = t.locations?.length
			? t.locations.map((l) => l.id)
			: await countryLocationIds(ctx, spec.objective, t.countries);

		// 1. Campaign — DISABLE, no campaign-level budget (the ad group holds it, so
		// only the documented ad-group minimum applies). request_id makes a replay
		// of this exact request a no-op on TikTok's side.
		const campaign = await call<{ campaign_id: string }>(ctx.accessToken, "/campaign/create/", {
			method: "POST",
			mutating: true,
			body: {
				advertiser_id: ctx.accountExternalId,
				campaign_name: draft.name,
				objective_type: spec.objective,
				budget_mode: "BUDGET_MODE_INFINITE",
				operation_status: "DISABLE",
				request_id: idempotencyKey(),
			},
		});
		const campaignId = String(campaign.campaign_id);
		const undo: { ids: string[]; run: () => Promise<void> }[] = [
			{ ids: [campaignId], run: () => setOperationStatus(ctx, "campaign", [campaignId], "DELETE") },
		];
		const objects: CreatedCampaign["objects"] = [];

		try {
			// 2. Ad group — DISABLE, budget, schedule (UTC), targeting.
			const ages = tiktokAgeGroups(t.ageMin, t.ageMax);
			const budget = tiktokBudget(draft.dailyBudget ?? (draft.lifetimeBudget as number), currency);
			const adGroup = await call<{ adgroup_id: string }>(ctx.accessToken, "/adgroup/create/", {
				method: "POST",
				mutating: true,
				body: {
					advertiser_id: ctx.accountExternalId,
					campaign_id: campaignId,
					adgroup_name: draft.name,
					...(spec.promotionType ? { promotion_type: spec.promotionType } : {}),
					placement_type: "PLACEMENT_TYPE_NORMAL",
					placements: PLACEMENTS,
					location_ids: locationIds,
					...(ages ? { age_groups: ages } : {}),
					gender:
						t.genders?.length === 1
							? t.genders[0] === "male"
								? "GENDER_MALE"
								: "GENDER_FEMALE"
							: "GENDER_UNLIMITED",
					...(t.languages?.length ? { languages: t.languages.map((l) => l.toLowerCase()) } : {}),
					...(t.interests?.length ? { interest_category_ids: t.interests.map((i) => i.id) } : {}),
					budget_mode: draft.dailyBudget !== undefined ? "BUDGET_MODE_DAY" : "BUDGET_MODE_TOTAL",
					budget,
					schedule_type: draft.endAt ? "SCHEDULE_START_END" : "SCHEDULE_FROM_NOW",
					schedule_start_time: tiktokTime(draft.startAt),
					...(draft.endAt ? { schedule_end_time: tiktokTime(draft.endAt) } : {}),
					optimization_goal: spec.goal,
					billing_event: spec.billing,
					bid_type: "BID_TYPE_NO_BID",
					pacing: "PACING_MODE_SMOOTH",
					operation_status: "DISABLE",
				},
			});
			const adGroupId = String(adGroup.adgroup_id);
			objects.push({ type: "ad_set", externalId: adGroupId });
			undo.push({
				ids: [adGroupId],
				run: () => setOperationStatus(ctx, "adgroup", [adGroupId], "DELETE"),
			});

			// 3. Assets. A SINGLE_VIDEO ad needs a cover image: the one supplied, or the
			// frame TikTok extracted (video_cover_url) re-uploaded as an image.
			const creatives: Record<string, unknown>[] = [];
			for (const ad of draft.ads) {
				const video = ad.media.find((m) => m.kind === "video") as MediaItem;
				const uploaded = await uploadVideo(ctx, video, ad.name);
				objects.push({ type: "asset", externalId: uploaded.video_id });
				const coverUrl = ad.media.find((m) => m.kind === "image")?.url ?? uploaded.video_cover_url;
				if (!coverUrl)
					throw new ProviderError(
						"invalid_request",
						PROVIDER,
						"No cover image for the TikTok video",
					);
				const imageId = await uploadImage(ctx, coverUrl, `${ad.name}-cover`);
				objects.push({ type: "asset", externalId: imageId });
				const displayName =
					ad.headline ??
					(typeof ctx.metadata.displayName === "string" ? ctx.metadata.displayName : undefined);
				creatives.push({
					ad_name: ad.name.slice(0, NAME_MAX),
					identity_type: identityType,
					identity_id: identityId,
					ad_format: "SINGLE_VIDEO",
					video_id: uploaded.video_id,
					image_ids: [imageId],
					ad_text: ad.primaryText.trim(),
					call_to_action: CTA[ad.callToAction ?? "learn_more"],
					landing_page_url: ad.destinationUrl,
					...(displayName ? { display_name: displayName.slice(0, DISPLAY_NAME_MAX) } : {}),
					operation_status: "DISABLE",
				});
			}

			// 4. Ads — DISABLE. The response shape is not modelled by either SDK:
			// read data.ad_ids, then data.creatives[].ad_id.
			for (const batch of chunk(creatives, CREATIVES_PER_CALL)) {
				const data = await call<{
					ad_ids?: (string | number)[];
					creatives?: { ad_id?: string | number }[];
				}>(ctx.accessToken, "/ad/create/", {
					method: "POST",
					mutating: true,
					body: { advertiser_id: ctx.accountExternalId, adgroup_id: adGroupId, creatives: batch },
				});
				const ids = (data.ad_ids ?? data.creatives?.map((c) => c.ad_id) ?? [])
					.filter((id) => id !== undefined)
					.map(String);
				for (const id of ids) objects.push({ type: "ad", externalId: id });
				undo.push({ ids, run: () => setOperationStatus(ctx, "ad", ids, "DELETE") });
			}
		} catch (error) {
			return rollback(ctx, error, undo);
		}

		// Belt and braces: one report says campaign-level operation_status can be
		// ignored for non-allowlisted advertisers. If TikTok created it ENABLED, turn
		// it off (the ad group and ads are DISABLE regardless, so nothing spends).
		try {
			const status = await getCampaign(ctx, campaignId);
			if (status?.operation_status === "ENABLE")
				await setOperationStatus(ctx, "campaign", [campaignId], "DISABLE");
		} catch (error) {
			ctx.logger.warn(
				{ err: error, campaignId },
				"tiktok_ads: could not verify the campaign is disabled",
			);
		}

		return {
			campaignExternalId: campaignId,
			objects,
			status: "paused",
			manageUrl: `https://ads.tiktok.com/i18n/perf/campaign?aadvid=${encodeURIComponent(ctx.accountExternalId)}`,
		};
	}

	async function getCampaign(ctx: AdsContext, id: string): Promise<TikTokCampaign | undefined> {
		const data = await call<{ list?: TikTokCampaign[] }>(ctx.accessToken, "/campaign/get/", {
			query: {
				advertiser_id: ctx.accountExternalId,
				// The default filter hides deleted campaigns.
				filtering: { campaign_ids: [id], primary_status: "STATUS_ALL" },
				fields: ["campaign_id", "operation_status", "secondary_status"],
			},
		});
		return data.list?.find((c) => String(c.campaign_id) === id);
	}

	/** Children of a campaign that are switched off (for setStatus "active"). */
	async function disabledChildren(ctx: AdsContext, level: "adgroup" | "ad", campaignId: string) {
		const ids: string[] = [];
		for (let page = 1; page <= 10; page++) {
			const data = await call<{ list?: Record<string, unknown>[]; page_info?: PageInfo }>(
				ctx.accessToken,
				`/${level}/get/`,
				{
					query: {
						advertiser_id: ctx.accountExternalId,
						filtering: { campaign_ids: [campaignId] },
						fields: [`${level}_id`, "operation_status"],
						page: String(page),
						page_size: "1000",
					},
				},
			);
			for (const row of data.list ?? []) {
				if (row.operation_status === "DISABLE") ids.push(String(row[`${level}_id`]));
			}
			if (!data.page_info?.total_page || page >= data.page_info.total_page) break;
		}
		return ids;
	}

	async function getInsights(
		ctx: AdsContext,
		input: { campaignExternalIds: string[]; since: string; until: string },
	): Promise<CampaignInsightsDay[]> {
		const out: CampaignInsightsDay[] = [];
		for (const ids of chunk(input.campaignExternalIds, REPORT_IDS_PER_CALL)) {
			for (const range of splitRange(input, REPORT_MAX_DAYS)) {
				for (let page = 1; page <= REPORT_MAX_PAGES; page++) {
					const data = await call<{ list?: ReportRow[]; page_info?: PageInfo }>(
						ctx.accessToken,
						"/report/integrated/get/",
						{
							query: {
								advertiser_id: ctx.accountExternalId,
								report_type: "BASIC",
								data_level: "AUCTION_CAMPAIGN",
								dimensions: ["campaign_id", "stat_time_day"],
								metrics: [
									"spend",
									"impressions",
									"reach",
									"clicks",
									"conversion",
									"video_play_actions",
								],
								// Dates are in the advertiser's timezone, both inclusive.
								start_date: range.since,
								end_date: range.until,
								// filter_value is itself a JSON-encoded array string.
								filtering: [
									{
										field_name: "campaign_ids",
										filter_type: "IN",
										filter_value: JSON.stringify(ids),
									},
								],
								page: String(page),
								page_size: String(REPORT_PAGE_SIZE),
							},
						},
					);
					for (const row of data.list ?? []) {
						const id = row.dimensions?.campaign_id;
						const day = row.dimensions?.stat_time_day;
						if (!id || !day) continue;
						// Metric values are strings; "-" means not applicable → unknown.
						const m = row.metrics ?? {};
						out.push({
							campaignExternalId: String(id),
							date: day.slice(0, 10),
							spend: num(m.spend) ?? 0,
							...Object.fromEntries(
								Object.entries({
									impressions: num(m.impressions),
									reach: num(m.reach),
									clicks: num(m.clicks),
									conversions: num(m.conversion),
									videoViews: num(m.video_play_actions),
								}).filter(([, v]) => v !== undefined),
							),
						});
					}
					if (!data.page_info?.total_page || page >= data.page_info.total_page) break;
				}
			}
		}
		return out;
	}

	/**
	 * Interests: /tool/interest_category/ returns the whole tree, filtered here.
	 * Locations: /tool/targeting/search/ fuzzy search (TikTok's recommended lookup).
	 */
	async function searchTargeting(
		ctx: AdsContext,
		input: { type: TargetingOption["type"]; query: string; limit: number },
	): Promise<TargetingOption[]> {
		const q = input.query.trim().toLowerCase();
		if (input.type === "interest") {
			const data = await call<{
				interest_categories?: { interest_category_id?: string; interest_category_name?: string }[];
			}>(ctx.accessToken, "/tool/interest_category/", {
				query: {
					advertiser_id: ctx.accountExternalId,
					version: "2",
					placements: PLACEMENTS,
					language: "en",
				},
			});
			return (data.interest_categories ?? [])
				.filter(
					(c) => c.interest_category_id && c.interest_category_name?.toLowerCase().includes(q),
				)
				.slice(0, input.limit)
				.map((c) => ({
					id: String(c.interest_category_id),
					name: c.interest_category_name as string,
					type: "interest" as const,
				}));
		}
		if (input.type === "location" && q) {
			const data = await call<{
				targeting_tag_list?: { name?: string; geo?: { geo_id?: string; description?: string } }[];
			}>(ctx.accessToken, "/tool/targeting/search/", {
				query: {
					advertiser_id: ctx.accountExternalId,
					placements: PLACEMENTS,
					objective_type: "TRAFFIC",
					search_type: "FUZZY_SEARCH",
					keywords: [input.query.trim()],
				},
			});
			return (data.targeting_tag_list ?? [])
				.filter((tag) => tag.geo?.geo_id)
				.slice(0, input.limit)
				.map((tag) => ({
					id: String(tag.geo?.geo_id),
					name: tag.geo?.description ?? tag.name ?? String(tag.geo?.geo_id),
					type: "location" as const,
				}));
		}
		return [];
	}

	return {
		id: "tiktok_ads",
		displayName: "TikTok Ads",
		capabilities,
		// TikTok permissions are chosen on the developer app (numeric scope ids are
		// returned with the token), not requested per authorization.
		scopes: [],
		// Limits are per app by level (Basic to start); a throttle needs a 5-minute
		// pause, so stay slow. https://business-api.tiktok.com/portal/docs/rate-limits/v1.3
		writeRateLimit: { max: 20, durationMs: 60_000 },

		isConfigured: () => Boolean(env.TIKTOK_ADS_APP_ID && env.TIKTOK_ADS_APP_SECRET),

		async getAuthorizationUrl({ redirectUri, state }) {
			const url = new URL(AUTH_URL);
			url.search = new URLSearchParams({
				app_id: env.TIKTOK_ADS_APP_ID,
				state,
				redirect_uri: redirectUri,
			}).toString();
			return { url: url.toString() };
		},

		/**
		 * `code` is the callback's `auth_code` (valid 1 hour, single use). Advertiser
		 * tokens are long-lived: no expiry, no refresh token; they end when the
		 * advertiser revokes the app.
		 */
		async exchangeCode({ code }) {
			const data = await call<{
				access_token: string;
				advertiser_ids?: string[];
				scope?: number[];
			}>(null, "/oauth2/access_token/", {
				method: "POST",
				body: { app_id: env.TIKTOK_ADS_APP_ID, secret: env.TIKTOK_ADS_APP_SECRET, auth_code: code },
			});
			const tokens = {
				accessToken: data.access_token,
				refreshToken: null,
				expiresAt: null,
				scopes: (data.scope ?? []).map(String),
			};
			const ids = (data.advertiser_ids ?? []).map(String);
			return { tokens, accounts: ids.length ? await advertiserInfo(tokens.accessToken, ids) : [] };
		},

		validate,
		searchTargeting,
		createCampaign,

		/**
		 * "active" enables the campaign's disabled ad groups and ads first and the
		 * campaign LAST (the master switch), so a failure part-way spends nothing.
		 * "paused" disables only the campaign, which stops all delivery under it.
		 */
		async setStatus(ctx, campaignExternalId, status) {
			if (status === "active") {
				for (const level of ["adgroup", "ad"] as const) {
					const ids = await disabledChildren(ctx, level, campaignExternalId);
					if (ids.length) await setOperationStatus(ctx, level, ids, "ENABLE");
				}
			}
			await setOperationStatus(
				ctx,
				"campaign",
				[campaignExternalId],
				status === "active" ? "ENABLE" : "DISABLE",
			);
		},

		/** DELETE is terminal on TikTok (no archive state). */
		async archiveCampaign(ctx, campaignExternalId) {
			await setOperationStatus(ctx, "campaign", [campaignExternalId], "DELETE");
		},

		async getCampaignStatus(ctx, campaignExternalId) {
			const c = await getCampaign(ctx, campaignExternalId);
			return c ? mapTikTokStatus(c) : "deleted";
		},

		getInsights,
	};
}
