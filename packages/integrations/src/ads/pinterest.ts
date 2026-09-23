import { chunk, num, splitRange } from "../analytics";
import { ProviderError } from "../errors";
import { expiresAtFrom, fetchMediaBytes, form, providerFetch, providerJson } from "../http";
import type { MediaItem, TokenSet } from "../types";
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
 * Pinterest Ads — Pinterest API v5.
 *
 * Every endpoint, field and enum below was checked against the official OpenAPI
 * description (v5.28.0): https://github.com/pinterest/api-description/blob/main/v5/openapi.yaml
 * Operation pages: https://developers.pinterest.com/docs/api/v5/<operationId>
 *
 * Creation order: campaign (PAUSED, campaign-level budget) → ad group (PAUSED) →
 * one Pin per ad on the board in `ctx.metadata.boardId` → ads (PAUSED) linking
 * the ad group and the Pin. Pinterest has no "unpublished" Pin: the creative Pin
 * is visible on that board, so a failed creation deletes it again.
 *
 * Access: `ads:write` works on Trial access only in Pinterest's sandbox; real
 * campaigns need Standard access (application with a demo video).
 * https://developers.pinterest.com/docs/key-concepts/access-tiers/
 */

export type PinterestAdsEnv = { PINTEREST_APP_ID: string; PINTEREST_APP_SECRET: string };
/** Test seam: polling cadence for video processing. Production uses the defaults. */
export type PinterestAdsOptions = { pollIntervalMs?: number; maxPollMs?: number };

const PROVIDER = "pinterest_ads";
const API = "https://api.pinterest.com/v5";
const AUTH_URL = "https://www.pinterest.com/oauth/";
const TOKEN_URL = `${API}/oauth/token`;

/**
 * `boards:write` is needed on top of the brief's list: POST/DELETE /v5/pins
 * require boards:read, boards:write, pins:read and pins:write.
 * https://developers.pinterest.com/docs/api/v5/pins-create
 */
const SCOPES = [
	"ads:read",
	"ads:write",
	"boards:read",
	"boards:write",
	"pins:read",
	"pins:write",
	"user_accounts:read",
];

/** Pin limits from the Pin create schema (title 100, description 800, link 2048). */
const PIN_TITLE_MAX = 100;
const PIN_DESCRIPTION_MAX = 800;
const PIN_LINK_MAX = 2048;
const NAME_MAX = 255;
/** multiple_image_urls accepts 2–5 items. */
const CAROUSEL_MIN = 2;
const CAROUSEL_MAX = 5;
/** Campaign/ad group/ad bulk endpoints accept 1–30 items per request. */
const BULK_MAX = 30;
/** campaigns/analytics: at most 250 campaign ids and a 90-day range per request. */
const ANALYTICS_MAX_IDS = 250;
const ANALYTICS_MAX_DAYS = 90;
/** Bound on ad-account discovery pages (250 each). */
const MAX_ACCOUNT_PAGES = 10;

/**
 * Currencies Pinterest ad accounts can have (AdAccount.currency enum, minus UNK).
 * Budgets are sent as integer micro-units of this currency.
 */
const CURRENCIES = new Set([
	"USD",
	"GBP",
	"CAD",
	"EUR",
	"AUD",
	"NZD",
	"SEK",
	"ILS",
	"CHF",
	"HKD",
	"JPY",
	"SGD",
	"KRW",
	"NOK",
	"DKK",
	"PLN",
	"RON",
	"HUF",
	"CZK",
	"BRL",
	"MXN",
	"ARS",
	"CLP",
	"COP",
	"INR",
	"TRY",
]);
/** ISO 4217 currencies without minor units: a budget of 1000.5 JPY is a typo, not a budget. */
const ZERO_DECIMAL = new Set(["JPY", "KRW", "CLP"]);

/**
 * Our objectives → Pinterest `objective_type`. VIDEO_VIEW is deprecated (read-only
 * enum); VIDEO_COMPLETION replaces it. WEB_CONVERSION needs a conversion tag and
 * LEADS a lead form, which SocialFly does not manage yet, so "sales"/"leads" are
 * not offered rather than created half-configured.
 */
const OBJECTIVES: Partial<Record<AdObjective, string>> = {
	awareness: "AWARENESS",
	traffic: "CONSIDERATION",
	engagement: "CONSIDERATION",
	video_views: "VIDEO_COMPLETION",
};

/**
 * Billable event per objective type (ad group `billable_event`). The pairs follow
 * the ad group schema's documented objective/billable-event combinations.
 */
const BILLABLE_EVENT: Record<string, string> = {
	AWARENESS: "IMPRESSION",
	CONSIDERATION: "CLICKTHROUGH",
	VIDEO_COMPLETION: "VIDEO_V_50_MRC",
};

const capabilities: AdsCapabilities = {
	objectives: Object.keys(OBJECTIVES) as AdObjective[],
	formats: ["image", "video", "carousel"],
	// Pinterest documents no minimum budget (spec or help centre); 1 is guidance only.
	minDailyBudgetUsd: 1,
	maxAdsPerCampaign: 10,
	textLimits: { primaryText: PIN_DESCRIPTION_MAX, headline: PIN_TITLE_MAX },
};

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)

/**
 * Major units → integer micro-currency, without float drift: the amount is first
 * rounded to whole minor units (cents), which is exact for any value a person
 * types, then scaled by an integer. Returns null when the amount has more
 * precision than the currency allows.
 */
export function toMicro(amount: number, currency: string): number | null {
	const decimals = ZERO_DECIMAL.has(currency) ? 0 : 2;
	const factor = 10 ** decimals;
	const minor = Math.round(amount * factor);
	if (Math.abs(minor - amount * factor) > 1e-6) return null;
	return minor * (1_000_000 / factor);
}

const toUnixSeconds = (iso: string) => Math.floor(Date.parse(iso) / 1000);

/**
 * Targeting → Pinterest `targeting_spec` (UPPERCASE keys, string arrays).
 * LOCATION takes ISO-2 countries or numeric metro codes. Finer locations from
 * searchTargeting REPLACE the countries (they narrow the audience inside them;
 * sending both would re-widen it to the whole country).
 * MINIMUM_AGE/MAXIMUM_AGE replace the legacy AGE_BUCKET.
 */
export function pinterestTargetingSpec(t: CampaignDraft["targeting"]): Record<string, string[]> {
	const spec: Record<string, string[]> = {
		LOCATION: t.locations?.length
			? t.locations.map((l) => l.id)
			: t.countries.map((c) => c.toUpperCase()),
	};
	if (t.ageMin !== undefined) spec.MINIMUM_AGE = [String(Math.max(18, t.ageMin))];
	if (t.ageMax !== undefined) spec.MAXIMUM_AGE = [t.ageMax >= 65 ? "65+" : String(t.ageMax)];
	if (t.genders?.length) spec.GENDER = [...t.genders];
	if (t.languages?.length) spec.LOCALE = [...t.languages];
	if (t.interests?.length) spec.INTEREST = t.interests.map((i) => i.id);
	return spec;
}

/** Pinterest campaign `status` → our status. Review happens per ad, not per campaign. */
export function mapPinterestStatus(
	status: string | undefined,
): Awaited<ReturnType<AdsProvider["getCampaignStatus"]>> {
	switch (status) {
		case "ACTIVE":
			return "active";
		case "ARCHIVED":
			return "archived";
		case "DELETED_DRAFT":
			return "deleted";
		default:
			// PAUSED, DRAFT — neither spends.
			return "paused";
	}
}

/** Media rules per format; shared by validate() and createCampaign's own guard. */
function adMediaErrors(ad: AdDraft, label: string): string[] {
	const images = ad.media.filter((m) => m.kind === "image");
	const videos = ad.media.filter((m) => m.kind === "video");
	if (ad.format === "image" && (images.length !== 1 || videos.length))
		return [`${label}: an image ad needs exactly one image`];
	if (ad.format === "video" && (videos.length !== 1 || images.length > 1))
		return [`${label}: a video ad needs exactly one video (and optionally one cover image)`];
	if (
		ad.format === "carousel" &&
		(videos.length || images.length < CAROUSEL_MIN || images.length > CAROUSEL_MAX)
	)
		return [`${label}: a carousel needs ${CAROUSEL_MIN}–${CAROUSEL_MAX} images`];
	return [];
}

// ---------------------------------------------------------------------------
// Error mapping

type PinterestError = { code?: number; message?: string };
type BulkItem<T> = {
	data?: T | null;
	/** Array on campaigns/ad groups; the ads schema types it as a single object. */
	exceptions?: PinterestError[] | PinterestError | null;
};
type BulkResponse<T> = { items?: BulkItem<T>[] };

/**
 * Pinterest's error body is `{code, message}`. A 4xx with a message is surfaced
 * as-is (nothing was created); 401/403/429/5xx keep the default mapping.
 * https://developers.pinterest.com/docs/reference/error-codes/
 */
export function classifyPinterestError(status: number, body: string): ProviderError | undefined {
	if (status !== 400 && status !== 404 && status !== 409 && status !== 422) return undefined;
	let parsed: PinterestError & { error?: string } = {};
	try {
		parsed = JSON.parse(body);
	} catch {
		return undefined;
	}
	if (parsed.error === "invalid_grant")
		return new ProviderError("auth", PROVIDER, "Pinterest rejected the authorization grant", {
			status,
			body,
		});
	if (!parsed.message) return undefined;
	return new ProviderError("invalid_request", PROVIDER, parsed.message, {
		status,
		body,
		platformCode: parsed.code === undefined ? undefined : String(parsed.code),
	});
}

const exceptionsOf = (item: BulkItem<unknown>): PinterestError[] =>
	item.exceptions ? (Array.isArray(item.exceptions) ? item.exceptions : [item.exceptions]) : [];

/**
 * Bulk endpoints answer 200 with per-item `exceptions`. An item with exceptions
 * was NOT created (its `data` is null), so this is a plain rejection.
 */
function bulkData<T extends { id: string }>(res: BulkResponse<T>, what: string): T[] {
	const out: T[] = [];
	const errors: string[] = [];
	for (const item of res.items ?? []) {
		const exceptions = exceptionsOf(item);
		if (exceptions.length || !item.data) {
			errors.push(exceptions.map((e) => e.message ?? `code ${e.code}`).join("; ") || "no data");
			continue;
		}
		out.push(item.data);
	}
	if (errors.length) {
		// Partial success is possible with several items: report the created ids so
		// the caller's rollback can remove them.
		throw Object.assign(
			new ProviderError("invalid_request", PROVIDER, `${what} rejected: ${errors.join(" | ")}`),
			{ createdIds: out.map((d) => d.id) },
		);
	}
	return out;
}

// ---------------------------------------------------------------------------
// Rollback

type Created = { id: string; type: CreatedCampaign["objects"][number]["type"] | "campaign" };
type ErrorDetails = ProviderError["details"] & { orphanedExternalIds?: string[] };

/**
 * Re-throws `error` after best-effort cleanup. `undo` entries run in reverse
 * creation order; each lists the ids it makes harmless. Anything whose undo
 * failed is reported in `details.orphanedExternalIds` so a person (or a sync
 * job) can remove it. The error keeps its original kind: an unknown_outcome
 * stays unknown_outcome even if cleanup succeeded, because the caller must
 * still not retry blindly.
 */
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
				"pinterest_ads: cleanup after failed campaign creation failed",
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
			? `${original.message} (cleanup incomplete: ${orphaned.length} object(s) left on Pinterest)`
			: `${original.message} (everything created was removed)`,
		details,
		{ cause: error },
	);
}

// ---------------------------------------------------------------------------

type TokenResponse = {
	access_token: string;
	refresh_token?: string;
	expires_in?: number;
	scope?: string;
};
type PinterestAdAccount = {
	id: string;
	name?: string;
	currency?: string;
	time_zone?: string;
	country?: string;
	permissions?: string[];
	owner?: { id?: string; username?: string };
};
type Campaign = { id: string; status?: string };
type AnalyticsRow = Record<string, unknown> & { CAMPAIGN_ID?: string | number; DATE?: string };

/** Roles that may create campaigns in an ad account (AdAccount.permissions). */
const WRITE_ROLES = new Set(["OWNER", "ADMIN", "CAMPAIGN_MANAGER"]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createPinterestAdsProvider(
	env: PinterestAdsEnv,
	options: PinterestAdsOptions = {},
): AdsProvider {
	const pollIntervalMs = options.pollIntervalMs ?? 5_000;
	const maxPollMs = options.maxPollMs ?? 5 * 60_000;

	const basicAuth = () =>
		`Basic ${Buffer.from(`${env.PINTEREST_APP_ID}:${env.PINTEREST_APP_SECRET}`).toString("base64")}`;
	const headers = (ctx: { accessToken: string }) => ({
		Authorization: `Bearer ${ctx.accessToken}`,
		"Content-Type": "application/json",
	});
	const classify = classifyPinterestError;
	const accountPath = (ctx: AdsContext) =>
		`${API}/ad_accounts/${encodeURIComponent(ctx.accountExternalId)}`;

	const toTokens = (t: TokenResponse): TokenSet => ({
		accessToken: t.access_token,
		refreshToken: t.refresh_token ?? null,
		expiresAt: expiresAtFrom(t.expires_in),
		scopes: t.scope?.split(/[ ,]/).filter(Boolean) ?? SCOPES,
	});

	const requestToken = (params: Record<string, string>) =>
		providerJson<TokenResponse>(PROVIDER, TOKEN_URL, {
			method: "POST",
			headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
			body: form(params),
			classify,
		});

	async function listAdAccounts(accessToken: string): Promise<AdAccount[]> {
		const out: AdAccount[] = [];
		let bookmark: string | undefined;
		for (let page = 0; page < MAX_ACCOUNT_PAGES; page++) {
			const res = await providerJson<{ items?: PinterestAdAccount[]; bookmark?: string | null }>(
				PROVIDER,
				`${API}/ad_accounts?${form({ page_size: "250", ...(bookmark ? { bookmark } : {}) })}`,
				{ headers: headers({ accessToken }), classify },
			);
			for (const a of res.items ?? []) {
				out.push({
					externalId: a.id,
					name: a.name ?? a.id,
					currency: a.currency ?? "USD",
					timezone: a.time_zone ?? null,
					// Pinterest exposes no account status; what matters is whether this
					// user's role may create campaigns in it.
					status: a.permissions?.some((p) => WRITE_ROLES.has(p)) ? "active" : "disabled",
					metadata: {
						country: a.country ?? null,
						permissions: a.permissions ?? [],
						ownerUsername: a.owner?.username ?? null,
					},
				});
			}
			bookmark = res.bookmark ?? undefined;
			if (!bookmark) break;
		}
		return out;
	}

	function validate(
		draft: CampaignDraft,
		account: { currency: string; metadata?: Record<string, unknown> },
	): string[] {
		const errors: string[] = [];
		const currency = account.currency.toUpperCase();
		if (!CURRENCIES.has(currency))
			errors.push(`Pinterest ad accounts cannot use the currency ${account.currency}`);
		if (!OBJECTIVES[draft.objective])
			errors.push(`Pinterest does not support the "${draft.objective}" objective here`);
		if (!draft.name.trim() || draft.name.length > NAME_MAX)
			errors.push(`Campaign name must be 1–${NAME_MAX} characters`);

		const budgets = [draft.dailyBudget, draft.lifetimeBudget].filter((b) => b !== undefined);
		if (budgets.length !== 1) errors.push("Set exactly one of a daily or a lifetime budget");
		for (const b of budgets) {
			if (!(b > 0)) errors.push("Budget must be greater than zero");
			else if (toMicro(b, currency) === null)
				errors.push(
					ZERO_DECIMAL.has(currency)
						? `${currency} budgets must be whole amounts`
						: "Budget can have at most 2 decimal places",
				);
		}
		const start = Date.parse(draft.startAt);
		if (Number.isNaN(start)) errors.push("Start date is invalid");
		if (draft.lifetimeBudget !== undefined && !draft.endAt)
			errors.push("A lifetime budget needs an end date");
		if (draft.endAt && !(Date.parse(draft.endAt) > start))
			errors.push("End date must be after the start date");

		const t = draft.targeting;
		if (!t.countries.length) errors.push("Choose at least one country");
		if (t.ageMin !== undefined && t.ageMin < 18) errors.push("Pinterest ads target ages 18+");
		if (t.ageMax !== undefined && t.ageMin !== undefined && t.ageMax < t.ageMin)
			errors.push("Maximum age must be at least the minimum age");
		if (t.keywords?.length) errors.push("Keyword targeting is not supported for Pinterest ads");

		if (account.metadata && !account.metadata.boardId)
			errors.push("Choose a Pinterest board to hold the ad Pins");

		if (!draft.ads.length) errors.push("Add at least one ad");
		if (draft.ads.length > capabilities.maxAdsPerCampaign)
			errors.push(`At most ${capabilities.maxAdsPerCampaign} ads per campaign`);
		draft.ads.forEach((ad, i) => {
			const label = `Ad ${i + 1}`;
			if (!capabilities.formats.includes(ad.format))
				errors.push(`${label}: Pinterest does not support ${ad.format} ads`);
			else errors.push(...adMediaErrors(ad, label));
			if (draft.objective === "video_views" && ad.format !== "video")
				errors.push(`${label}: a video views campaign needs video ads`);
			if (ad.primaryText.length > PIN_DESCRIPTION_MAX)
				errors.push(`${label}: text is limited to ${PIN_DESCRIPTION_MAX} characters`);
			if ((ad.headline ?? "").length > PIN_TITLE_MAX)
				errors.push(`${label}: headline (Pin title) is limited to ${PIN_TITLE_MAX} characters`);
			if (!/^https:\/\//i.test(ad.destinationUrl) || ad.destinationUrl.length > PIN_LINK_MAX)
				errors.push(`${label}: destination must be an https URL (max ${PIN_LINK_MAX} characters)`);
			if (ad.name.length > NAME_MAX)
				errors.push(`${label}: name is limited to ${NAME_MAX} characters`);
		});
		return errors;
	}

	async function bulkPost<T extends { id: string }>(
		ctx: AdsContext,
		path: string,
		items: Record<string, unknown>[],
		what: string,
	): Promise<T[]> {
		const res = await providerJson<BulkResponse<T>>(PROVIDER, `${accountPath(ctx)}/${path}`, {
			method: "POST",
			mutating: true,
			headers: headers(ctx),
			body: JSON.stringify(items),
			classify,
		});
		return bulkData(res, what);
	}

	async function bulkPatch(
		ctx: AdsContext,
		path: string,
		items: Record<string, unknown>[],
		what: string,
	): Promise<void> {
		const res = await providerJson<BulkResponse<{ id: string }>>(
			PROVIDER,
			`${accountPath(ctx)}/${path}`,
			{
				method: "PATCH",
				mutating: true,
				headers: headers(ctx),
				body: JSON.stringify(items),
				classify,
			},
		);
		bulkData(res, what);
	}

	/**
	 * Video Pins: register media → multipart POST to the S3 upload_url with every
	 * upload_parameters field + `file` → poll until `succeeded` (bounded).
	 * https://developers.pinterest.com/docs/api/v5/media-create
	 * Registration and upload are not mutating in the publishing sense: an
	 * unattached media object is invisible and expires.
	 */
	async function uploadVideo(ctx: AdsContext, video: MediaItem): Promise<string> {
		const reg = await providerJson<{
			media_id: string;
			upload_url: string;
			upload_parameters: Record<string, string>;
		}>(PROVIDER, `${API}/media`, {
			method: "POST",
			headers: headers(ctx),
			body: JSON.stringify({ media_type: "video" }),
			classify,
		});
		const bytes = await fetchMediaBytes(PROVIDER, video.url);
		const body = new FormData();
		for (const [k, v] of Object.entries(reg.upload_parameters)) body.append(k, v);
		body.append("file", new Blob([bytes], { type: video.mimeType }));
		await providerFetch(PROVIDER, reg.upload_url, { method: "POST", body, timeoutMs: 300_000 });

		const deadline = Date.now() + maxPollMs;
		for (;;) {
			const status = await providerJson<{ status?: string }>(
				PROVIDER,
				`${API}/media/${encodeURIComponent(reg.media_id)}`,
				{ headers: headers(ctx), classify },
			);
			if (status.status === "succeeded") return reg.media_id;
			if (status.status === "failed")
				throw new ProviderError(
					"invalid_request",
					PROVIDER,
					"Pinterest could not process the video",
				);
			if (Date.now() + pollIntervalMs > deadline)
				throw new ProviderError(
					"transient",
					PROVIDER,
					"Pinterest is still processing the video; try again later",
				);
			await sleep(pollIntervalMs);
		}
	}

	async function createPin(ctx: AdsContext, ad: AdDraft, boardId: string): Promise<string> {
		const images = ad.media.filter((m) => m.kind === "image");
		const video = ad.media.find((m) => m.kind === "video");
		let mediaSource: Record<string, unknown>;
		if (ad.format === "video" && video) {
			const mediaId = await uploadVideo(ctx, video);
			mediaSource = images[0]
				? { source_type: "video_id", media_id: mediaId, cover_image_url: images[0].url }
				: // No cover supplied: Pinterest picks the frame at this time (seconds).
					{ source_type: "video_id", media_id: mediaId, cover_image_key_frame_time: 0 };
		} else if (ad.format === "carousel") {
			mediaSource = {
				source_type: "multiple_image_urls",
				items: images.map((m) => ({
					url: m.url,
					title: ad.headline ?? undefined,
					link: ad.destinationUrl,
				})),
			};
		} else {
			mediaSource = { source_type: "image_url", url: images[0]?.url };
		}
		// ad_account_id: the Pin is created as the ad account's owner via Business
		// Access, so a campaign manager can use the owner's board.
		const pin = await providerJson<{ id: string }>(
			PROVIDER,
			`${API}/pins?${form({ ad_account_id: ctx.accountExternalId })}`,
			{
				method: "POST",
				// A Pin is publicly visible on the board: a timeout may have created it.
				mutating: true,
				headers: headers(ctx),
				body: JSON.stringify({
					board_id: boardId,
					title: ad.headline ?? undefined,
					description: ad.primaryText,
					link: ad.destinationUrl,
					alt_text: images[0]?.altText ?? undefined,
					media_source: mediaSource,
				}),
				classify,
			},
		);
		return pin.id;
	}

	async function deletePin(ctx: AdsContext, pinId: string) {
		await providerFetch(
			PROVIDER,
			`${API}/pins/${encodeURIComponent(pinId)}?${form({ ad_account_id: ctx.accountExternalId })}`,
			{ method: "DELETE", mutating: true, headers: headers(ctx), classify },
		);
	}

	async function createCampaign(ctx: AdsContext, draft: CampaignDraft): Promise<CreatedCampaign> {
		const boardId = typeof ctx.metadata.boardId === "string" ? ctx.metadata.boardId : "";
		const errors = validate(draft, {
			currency: ctx.currency,
			metadata: { ...ctx.metadata, boardId },
		});
		if (errors.length)
			throw new ProviderError("invalid_request", PROVIDER, errors.join("; "), {
				platformCode: "validation",
			});

		const currency = ctx.currency.toUpperCase();
		const objectiveType = OBJECTIVES[draft.objective] as string;
		const startTime = toUnixSeconds(draft.startAt);
		const endTime = draft.endAt ? toUnixSeconds(draft.endAt) : undefined;

		// 1. Campaign — PAUSED, budget at campaign level (these objectives are
		// campaign-budget-optimised; ad groups then use budget_type CBO_ADGROUP).
		const [campaign] = await bulkPost<Campaign>(
			ctx,
			"campaigns",
			[
				{
					name: draft.name,
					status: "PAUSED",
					objective_type: objectiveType,
					is_campaign_budget_optimization: true,
					...(draft.dailyBudget !== undefined
						? { daily_spend_cap: toMicro(draft.dailyBudget, currency) }
						: { lifetime_spend_cap: toMicro(draft.lifetimeBudget as number, currency) }),
					start_time: startTime,
					...(endTime !== undefined ? { end_time: endTime } : {}),
				},
			],
			"Campaign",
		);
		if (!campaign) throw new ProviderError("unknown_outcome", PROVIDER, "No campaign returned");

		const created: Created[] = [];
		const undo: { ids: string[]; run: () => Promise<void> }[] = [
			{
				// Archiving the campaign stops everything under it; Pinterest has no delete.
				ids: [campaign.id],
				run: () =>
					bulkPatch(ctx, "campaigns", [{ id: campaign.id, status: "ARCHIVED" }], "Archive"),
			},
		];
		// Ad groups and ads live under the campaign: if archiving it fails they are
		// orphaned too, so their ids ride on the campaign's undo step.
		const underCampaign = undo[0] as { ids: string[] };

		try {
			// 2. Ad group — PAUSED, same schedule, targeting as chosen (no Performance+
			// auto-expansion: the user picked an audience and pays for it).
			const [adGroup] = await bulkPost<{ id: string }>(
				ctx,
				"ad_groups",
				[
					{
						name: draft.name.slice(0, NAME_MAX),
						campaign_id: campaign.id,
						status: "PAUSED",
						budget_type: "CBO_ADGROUP",
						billable_event: BILLABLE_EVENT[objectiveType],
						bid_strategy_type: "AUTOMATIC_BID",
						pacing_delivery_type: "STANDARD",
						placement_group: "ALL",
						auto_targeting_enabled: false,
						targeting_spec: pinterestTargetingSpec(draft.targeting),
						start_time: startTime,
						...(endTime !== undefined ? { end_time: endTime } : {}),
					},
				],
				"Ad group",
			);
			if (!adGroup) throw new ProviderError("unknown_outcome", PROVIDER, "No ad group returned");
			created.push({ id: adGroup.id, type: "ad_set" });
			underCampaign.ids.push(adGroup.id);

			// 3. One Pin per ad (the creative).
			const pins: string[] = [];
			for (const ad of draft.ads) {
				const pinId = await createPin(ctx, ad, boardId);
				pins.push(pinId);
				created.push({ id: pinId, type: "creative" });
				undo.push({ ids: [pinId], run: () => deletePin(ctx, pinId) });
			}

			// 4. Ads — PAUSED.
			const adItems = draft.ads.map((ad, i) => ({
				ad_group_id: adGroup.id,
				pin_id: pins[i],
				creative_type:
					ad.format === "video" ? "VIDEO" : ad.format === "carousel" ? "CAROUSEL" : "REGULAR",
				status: "PAUSED",
				name: ad.name.slice(0, NAME_MAX),
			}));
			for (const batch of chunk(adItems, BULK_MAX)) {
				let ads: { id: string }[];
				try {
					ads = await bulkPost<{ id: string }>(ctx, "ads", batch, "Ad");
				} catch (error) {
					const partial = (error as { createdIds?: string[] }).createdIds ?? [];
					underCampaign.ids.push(...partial);
					throw error;
				}
				for (const a of ads) {
					created.push({ id: a.id, type: "ad" });
					underCampaign.ids.push(a.id);
				}
			}
		} catch (error) {
			return rollback(ctx, error, undo);
		}

		return {
			campaignExternalId: campaign.id,
			objects: created.map((c) => ({
				type: c.type as CreatedCampaign["objects"][number]["type"],
				externalId: c.id,
			})),
			status: "paused",
			// Pinterest documents no deep link to one campaign; the account's Ads Manager is stable.
			manageUrl: `https://ads.pinterest.com/advertiser/${encodeURIComponent(ctx.accountExternalId)}/`,
		};
	}

	/** PAUSED ad groups or ads of one campaign (bounded pages of 250). */
	async function listChildren(
		ctx: AdsContext,
		kind: "ad_groups" | "ads",
		campaignId: string,
	): Promise<string[]> {
		const ids: string[] = [];
		let bookmark: string | undefined;
		for (let page = 0; page < MAX_ACCOUNT_PAGES; page++) {
			const params = new URLSearchParams({ campaign_ids: campaignId, entity_statuses: "PAUSED" });
			params.set("page_size", "250");
			if (bookmark) params.set("bookmark", bookmark);
			const res = await providerJson<{ items?: Campaign[]; bookmark?: string | null }>(
				PROVIDER,
				`${accountPath(ctx)}/${kind}?${params}`,
				{ headers: headers(ctx), classify },
			);
			for (const item of res.items ?? []) if (item.status === "PAUSED") ids.push(item.id);
			bookmark = res.bookmark ?? undefined;
			if (!bookmark) break;
		}
		return ids;
	}

	async function getCampaignStatus(ctx: AdsContext, campaignExternalId: string) {
		const c = await providerJson<Campaign>(
			PROVIDER,
			`${accountPath(ctx)}/campaigns/${encodeURIComponent(campaignExternalId)}`,
			{ headers: headers(ctx), classify },
		);
		return mapPinterestStatus(c.status);
	}

	async function getInsights(
		ctx: AdsContext,
		input: { campaignExternalIds: string[]; since: string; until: string },
	): Promise<CampaignInsightsDay[]> {
		const out: CampaignInsightsDay[] = [];
		for (const ids of chunk(input.campaignExternalIds, ANALYTICS_MAX_IDS)) {
			for (const range of splitRange(input, ANALYTICS_MAX_DAYS)) {
				const params = new URLSearchParams({
					start_date: range.since,
					end_date: range.until,
					granularity: "DAY",
					// "MICRO_DOLLAR" columns are micro-units of the AD ACCOUNT's currency (per the spec).
					columns: [
						"SPEND_IN_MICRO_DOLLAR",
						"TOTAL_IMPRESSION",
						"TOTAL_IMPRESSION_USER",
						"TOTAL_CLICKTHROUGH",
						"TOTAL_CONVERSIONS",
						"TOTAL_VIDEO_3SEC_VIEWS",
					].join(","),
				});
				// Array query params use repeated keys (OpenAPI form/explode).
				for (const id of ids) params.append("campaign_ids", id);
				const rows = await providerJson<AnalyticsRow[]>(
					PROVIDER,
					`${accountPath(ctx)}/campaigns/analytics?${params}`,
					{ headers: headers(ctx), classify },
				);
				for (const row of rows ?? []) {
					if (row.CAMPAIGN_ID === undefined || !row.DATE) continue;
					const micro = num(row.SPEND_IN_MICRO_DOLLAR);
					out.push(
						Object.fromEntries(
							Object.entries({
								campaignExternalId: String(row.CAMPAIGN_ID),
								date: String(row.DATE).slice(0, 10),
								spend: micro === undefined ? 0 : micro / 1_000_000,
								impressions: num(row.TOTAL_IMPRESSION),
								reach: num(row.TOTAL_IMPRESSION_USER),
								clicks: num(row.TOTAL_CLICKTHROUGH),
								conversions: num(row.TOTAL_CONVERSIONS),
								videoViews: num(row.TOTAL_VIDEO_3SEC_VIEWS),
							}).filter(([, v]) => v !== undefined),
						) as CampaignInsightsDay,
					);
				}
			}
		}
		return out;
	}

	/**
	 * GET /v5/resources/targeting/{INTEREST|LOCATION} returns the WHOLE list as
	 * `[{code: label, ...}]` — there is no search parameter — so it is filtered here.
	 * https://developers.pinterest.com/docs/api/v5/targeting_options-get
	 */
	async function searchTargeting(
		ctx: AdsContext,
		input: { type: TargetingOption["type"]; query: string; limit: number },
	): Promise<TargetingOption[]> {
		const kind =
			input.type === "interest" ? "INTEREST" : input.type === "location" ? "LOCATION" : null;
		if (!kind) return [];
		const res = await providerJson<Record<string, string>[] | Record<string, string>>(
			PROVIDER,
			`${API}/resources/targeting/${kind}?${form({ ad_account_id: ctx.accountExternalId })}`,
			{ headers: headers(ctx), classify },
		);
		const q = input.query.trim().toLowerCase();
		const out: TargetingOption[] = [];
		for (const entry of Array.isArray(res) ? res : [res]) {
			for (const [id, name] of Object.entries(entry)) {
				if (typeof name !== "string" || (q && !name.toLowerCase().includes(q))) continue;
				out.push({ id, name, type: input.type });
				if (out.length >= input.limit) return out;
			}
		}
		return out;
	}

	return {
		id: "pinterest_ads",
		displayName: "Pinterest Ads",
		capabilities,
		scopes: SCOPES,
		// ads_write allows 400/min per user per app on Standard access (300/DAY on
		// Trial); stay far below. https://developers.pinterest.com/docs/reference/rate-limits/
		writeRateLimit: { max: 60, durationMs: 60_000 },

		isConfigured: () => Boolean(env.PINTEREST_APP_ID && env.PINTEREST_APP_SECRET),

		async getAuthorizationUrl({ redirectUri, state }) {
			const url = new URL(AUTH_URL);
			url.search = form({
				client_id: env.PINTEREST_APP_ID,
				redirect_uri: redirectUri,
				response_type: "code",
				scope: SCOPES.join(","),
				state,
			});
			return { url: url.toString() };
		},

		async exchangeCode({ code, redirectUri }) {
			const tokens = toTokens(
				await requestToken({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
			);
			return { tokens, accounts: await listAdAccounts(tokens.accessToken) };
		},

		/** Access tokens last 30 days; refresh tokens 60 days and renew on each refresh. */
		async refreshTokens(refreshToken) {
			return toTokens(
				await requestToken({ grant_type: "refresh_token", refresh_token: refreshToken }),
			);
		},

		validate,
		searchTargeting,
		createCampaign,

		/**
		 * createCampaign paused the ad group and ads too, so "active" first resumes
		 * the PAUSED children and flips the campaign LAST: if a child update fails,
		 * the campaign is still paused and nothing spends. "paused" only needs the
		 * campaign (it stops everything under it) and leaves children as they are.
		 */
		async setStatus(ctx, campaignExternalId, status) {
			if (status === "active") {
				for (const kind of ["ad_groups", "ads"] as const) {
					const paused = await listChildren(ctx, kind, campaignExternalId);
					for (const batch of chunk(paused, BULK_MAX)) {
						await bulkPatch(
							ctx,
							kind,
							batch.map((id) => ({ id, status: "ACTIVE" })),
							"Status change",
						);
					}
				}
			}
			await bulkPatch(
				ctx,
				"campaigns",
				[{ id: campaignExternalId, status: status === "active" ? "ACTIVE" : "PAUSED" }],
				"Status change",
			);
		},

		async archiveCampaign(ctx, campaignExternalId) {
			await bulkPatch(
				ctx,
				"campaigns",
				[{ id: campaignExternalId, status: "ARCHIVED" }],
				"Archive",
			);
		},

		getCampaignStatus,
		getInsights,
	};
}
