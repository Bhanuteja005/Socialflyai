import { createHmac } from "node:crypto";
import { addDays, chunk, num, splitRange } from "../analytics";
import { xWeightedLength } from "../engagement";
import { ProviderError } from "../errors";
import { fetchMediaBytes, providerFetch } from "../http";
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
 * X Ads — X Ads API v12 (the current version; 11 and 12 have no end-of-life date).
 * https://docs.x.com/x-ads-api/fundamentals/versioning
 *
 * Needs separate Ads API access for the app (Ads API Access Form, "Standard
 * Access"), and user tokens must be (re)generated AFTER that approval.
 * https://docs.x.com/x-ads-api/getting-started/step-by-step-guide
 *
 * Auth is OAuth 1.0a user context: every request is HMAC-SHA1 signed with the
 * app's consumer key/secret and the user's token/secret (ctx.accessToken /
 * ctx.accessTokenSecret). No refresh: tokens live until the user revokes them.
 *
 * Creation order (docs.x.com/x-ads-api/campaign-management/reference):
 *   campaign (PAUSED) → line item (PAUSED) → targeting criteria (batch) →
 *   media upload → media library → website card → promoted-only tweet
 *   (nullcast, never on the timeline) → promoted_tweets link.
 * Most writes take query parameters; batch endpoints and cards take JSON.
 */

export type XAdsEnv = { X_ADS_CONSUMER_KEY: string; X_ADS_CONSUMER_SECRET: string };
/** Test seam: polling cadence for video processing. Production uses the defaults. */
export type XAdsOptions = { pollIntervalMs?: number; maxPollMs?: number };

const PROVIDER = "x_ads";
const ADS_API = "https://ads-api.x.com/12";
/** v1.1 media upload was retired in 2025; v2 accepts OAuth 1.0a user tokens. */
const MEDIA_API = "https://api.x.com/2/media/upload";
const REQUEST_TOKEN_URL = "https://api.x.com/oauth/request_token";
const AUTHORIZE_URL = "https://api.x.com/oauth/authorize";
const ACCESS_TOKEN_URL = "https://api.x.com/oauth/access_token";

const TWEET_MAX = 280;
/** Website card DETAILS title. The Ads docs give no number; 70 is the Ads Manager limit (UNCONFIRMED via API docs). */
const CARD_TITLE_MAX = 70;
/** Card and tweet `name` ≤ 80; campaign and line item names ≤ 255. */
const CARD_NAME_MAX = 80;
const NAME_MAX = 255;
/** Synchronous stats: ≤ 20 entity ids and ≤ 7 days per request. */
const STATS_MAX_IDS = 20;
const STATS_MAX_DAYS = 7;
/** Batch targeting criteria: ≤ 500 operations per request. */
const TARGETING_BATCH_MAX = 500;
/** promoted_tweets: ≤ 50 tweet ids per call. */
const PROMOTE_MAX = 50;
const CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_ACCOUNT_PAGES = 5;

/** Currencies without minor units: a fractional budget there is a typo. */
const ZERO_DECIMAL = new Set(["JPY", "KRW", "CLP"]);

/**
 * v12 line item objectives. AWARENESS became REACH, TWEET_ENGAGEMENTS became
 * ENGAGEMENTS; WEBSITE_CONVERSIONS is a goal needing a web event tag, which
 * SocialFly does not manage, so "sales"/"leads" are not offered.
 */
const OBJECTIVES: Partial<Record<AdObjective, string>> = {
	awareness: "REACH",
	traffic: "WEBSITE_CLICKS",
	engagement: "ENGAGEMENTS",
	video_views: "VIDEO_VIEWS",
};

/**
 * AGE targeting: one bucket per line item, as an enum. The docs' enumeration page
 * is gone; this list is the official xdevplatform twitter-python-ads-sdk
 * enum.py. Only ranges that match a bucket EXACTLY are accepted: silently
 * widening the audience the user paid for is worse than asking.
 */
const AGE_BUCKETS = new Set([
	"AGE_13_TO_24",
	"AGE_13_TO_34",
	"AGE_13_TO_49",
	"AGE_13_TO_54",
	"AGE_OVER_13",
	"AGE_18_TO_34",
	"AGE_18_TO_49",
	"AGE_18_TO_54",
	"AGE_OVER_18",
	"AGE_21_TO_34",
	"AGE_21_TO_49",
	"AGE_21_TO_54",
	"AGE_OVER_21",
	"AGE_25_TO_49",
	"AGE_25_TO_54",
	"AGE_OVER_25",
	"AGE_35_TO_49",
	"AGE_35_TO_54",
	"AGE_OVER_35",
	"AGE_OVER_50",
]);

const capabilities: AdsCapabilities = {
	objectives: Object.keys(OBJECTIVES) as AdObjective[],
	formats: ["image", "video"],
	// X documents no minimum budget ("no minimum spend"); 1 is UI guidance only.
	minDailyBudgetUsd: 1,
	maxAdsPerCampaign: 10,
	textLimits: { primaryText: TWEET_MAX, headline: CARD_TITLE_MAX },
};

// ---------------------------------------------------------------------------
// OAuth 1.0a (RFC 5849), exported for the signature test vector.
// https://docs.x.com/resources/fundamentals/authentication/oauth-1-0a/creating-a-signature

/** RFC 3986 percent-encoding: encodeURIComponent leaves !'()* alone, OAuth does not. */
export const pct = (s: string) =>
	encodeURIComponent(s).replace(
		/[!'()*]/g,
		(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
	);

/**
 * HMAC-SHA1 signature over METHOD&url&sorted-params. `params` are every query and
 * form-encoded body parameter plus the oauth_* ones (JSON and multipart bodies
 * are not signed).
 */
export function oauth1Signature(input: {
	method: string;
	url: string;
	params: [string, string][];
	consumerSecret: string;
	tokenSecret?: string | null;
}): string {
	const normalized = input.params
		.map(([k, v]) => [pct(k), pct(v)] as const)
		.sort(([ak, av], [bk, bv]) => (ak === bk ? (av < bv ? -1 : 1) : ak < bk ? -1 : 1))
		.map(([k, v]) => `${k}=${v}`)
		.join("&");
	const base = `${input.method.toUpperCase()}&${pct(input.url)}&${pct(normalized)}`;
	const key = `${pct(input.consumerSecret)}&${pct(input.tokenSecret ?? "")}`;
	return createHmac("sha1", key).update(base).digest("base64");
}

/** Full `Authorization: OAuth ...` header value for one request. */
export function oauth1Header(input: {
	method: string;
	url: string;
	query: [string, string][];
	consumerKey: string;
	consumerSecret: string;
	token?: string | null;
	tokenSecret?: string | null;
	/** oauth_callback / oauth_verifier for the token endpoints. */
	extra?: Record<string, string>;
	nonce?: string;
	timestamp?: number;
}): string {
	const oauth: Record<string, string> = {
		oauth_consumer_key: input.consumerKey,
		oauth_nonce:
			input.nonce ?? Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("hex"),
		oauth_signature_method: "HMAC-SHA1",
		oauth_timestamp: String(input.timestamp ?? Math.floor(Date.now() / 1000)),
		oauth_version: "1.0",
		...(input.token ? { oauth_token: input.token } : {}),
		...input.extra,
	};
	const signature = oauth1Signature({
		method: input.method,
		url: input.url,
		params: [...input.query, ...Object.entries(oauth)],
		consumerSecret: input.consumerSecret,
		tokenSecret: input.tokenSecret,
	});
	return `OAuth ${Object.entries({ ...oauth, oauth_signature: signature })
		.map(([k, v]) => `${pct(k)}="${pct(v)}"`)
		.join(", ")}`;
}

const buildQuery = (query: [string, string][]) =>
	query.map(([k, v]) => `${pct(k)}=${pct(v)}`).join("&");

const parseForm = (text: string) => Object.fromEntries(new URLSearchParams(text));

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)

/** Major units → integer local micro (USD 5.50 = 5_500_000), rounding via whole minor units. */
export function toLocalMicro(amount: number, currency: string): number | null {
	const decimals = ZERO_DECIMAL.has(currency) ? 0 : 2;
	const factor = 10 ** decimals;
	const minor = Math.round(amount * factor);
	if (Math.abs(minor - amount * factor) > 1e-6) return null;
	return minor * (1_000_000 / factor);
}

/** ageMin/ageMax → an X AGE bucket, or null when the range matches none exactly. */
export function xAgeBucket(ageMin?: number, ageMax?: number): string | null | undefined {
	if (ageMin === undefined && ageMax === undefined) return undefined;
	const min = ageMin ?? 13;
	const bucket =
		ageMax === undefined || ageMax >= 65 ? `AGE_OVER_${min}` : `AGE_${min}_TO_${ageMax}`;
	return AGE_BUCKETS.has(bucket) ? bucket : null;
}

/** Campaign → our status. `deleted` wins; DRAFT and PAUSED do not spend. */
export function mapXStatus(c: {
	entity_status?: string;
	deleted?: boolean;
}): Awaited<ReturnType<AdsProvider["getCampaignStatus"]>> {
	if (c.deleted) return "deleted";
	return c.entity_status === "ACTIVE" ? "active" : "paused";
}

/**
 * "+HH:MM" offset of an IANA zone at a given instant. Stats with DAY granularity
 * must start and end at midnight in the ACCOUNT's timezone.
 * https://docs.x.com/x-ads-api/analytics
 */
export function tzOffset(timeZone: string, at: Date): string {
	try {
		const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
			.formatToParts(at)
			.find((p) => p.type === "timeZoneName")?.value;
		return name?.match(/GMT([+-]\d{2}:\d{2})/)?.[1] ?? "+00:00";
	} catch {
		return "+00:00";
	}
}

/** Midnight at the start of `day` in `timeZone`, as ISO 8601 with offset. */
export const localMidnight = (day: string, timeZone: string) =>
	`${day}T00:00:00${tzOffset(timeZone, new Date(`${day}T12:00:00Z`))}`;

// ---------------------------------------------------------------------------
// Errors

type XAdsErrorBody = {
	errors?: { code?: string; message?: string; parameter?: string }[];
	operation_errors?: ({ code?: string; message?: string }[] | null)[];
};

const AUTH_CODES = new Set([
	"UNAUTHORIZED_ACCESS",
	"UNAUTHORIZED_CLIENT_APPLICATION",
	"READONLY_CLIENT_APPLICATION",
	"CURRENT_USER_SUSPENDED",
	"ACCOUNT_LOCKED_OUT",
	"ACCOUNT_NOT_FOUND",
	"FUNDING_INSTRUMENT_ACCESS_NOT_ALLOWED",
]);

/**
 * X Ads error shape `{errors:[{code, message, parameter}]}`.
 * https://docs.x.com/x-ads-api/fundamentals/error-codes-and-responses
 * A 403 about the account/app is `auth`; a 403 about the content (TWEET_IS_SPAM,
 * credit limit) is `invalid_request`. 408 CANCELLED_REQUEST / 423 lock timeout
 * are ambiguous for writes (the change may have applied) → unknown_outcome.
 */
export function classifyXAdsError(
	status: number,
	body: string,
	mutating = false,
): ProviderError | undefined {
	if (status === 408 || status === 423)
		return new ProviderError(
			mutating ? "unknown_outcome" : "transient",
			PROVIDER,
			`X Ads request timed out on the platform (${status})`,
			{ status, body },
		);
	if (status >= 500 || status === 429 || status === 401) return undefined;
	let parsed: XAdsErrorBody = {};
	try {
		parsed = JSON.parse(body);
	} catch {
		return undefined;
	}
	const first = parsed.errors?.[0];
	if (!first?.code) return undefined;
	const details = { status, body, platformCode: first.code };
	if (AUTH_CODES.has(first.code))
		return new ProviderError("auth", PROVIDER, first.message ?? first.code, details);
	if (first.code === "TOO_MANY_REQUESTS" || first.code === "TWEET_RATE_LIMIT_EXCEEDED")
		return undefined;
	return new ProviderError(
		"invalid_request",
		PROVIDER,
		`${first.message ?? first.code}${first.parameter ? ` (${first.parameter})` : ""}`,
		details,
	);
}

// ---------------------------------------------------------------------------
// Rollback (see pinterest.ts for the rationale; same contract)

type ErrorDetails = ProviderError["details"] & { orphanedExternalIds?: string[] };

async function rollback(
	ctx: AdsContext,
	error: unknown,
	undo: { ids: string[]; run: () => Promise<void> }[],
	/** Created objects there is no API to remove (promoted-only tweets, cards). */
	unremovable: string[],
): Promise<never> {
	const orphaned: string[] = [...unremovable];
	for (const step of [...undo].reverse()) {
		try {
			await step.run();
		} catch (cleanupError) {
			ctx.logger.warn(
				{ err: cleanupError, ids: step.ids },
				"x_ads: cleanup after failed campaign creation failed",
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
			? `${original.message} (cleanup incomplete: ${orphaned.length} object(s) left on X)`
			: `${original.message} (everything created was removed)`,
		details,
		{ cause: error },
	);
}

// ---------------------------------------------------------------------------

type XAccount = {
	id: string;
	name?: string;
	timezone?: string;
	approval_status?: string;
	deleted?: boolean;
	business_name?: string;
};
type FundingInstrument = {
	id: string;
	currency?: string;
	entity_status?: string;
	able_to_fund?: boolean;
	deleted?: boolean;
	paused?: boolean;
	cancelled?: boolean;
	type?: string;
};
type XCampaign = { id: string; entity_status?: string; deleted?: boolean };
type ProcessingInfo = { state?: string; check_after_secs?: number; error?: { message?: string } };
type StatsResponse = {
	data?: {
		id: string;
		id_data?: { metrics?: Record<string, (number | null)[] | null> }[];
	}[];
};

/** The funding instrument campaigns are billed to: active, able to fund, not deleted/paused/cancelled. */
export function pickFundingInstrument(list: FundingInstrument[]): FundingInstrument | undefined {
	return list.find(
		(f) =>
			f.entity_status === "ACTIVE" &&
			f.able_to_fund !== false &&
			!f.deleted &&
			!f.paused &&
			!f.cancelled,
	);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createXAdsProvider(env: XAdsEnv, options: XAdsOptions = {}): AdsProvider {
	const pollIntervalMs = options.pollIntervalMs;
	const maxPollMs = options.maxPollMs ?? 5 * 60_000;

	type Call = {
		method?: "GET" | "POST" | "PUT" | "DELETE";
		query?: Record<string, string | undefined>;
		json?: unknown;
		formData?: FormData;
		mutating?: boolean;
		timeoutMs?: number;
	};

	/** One signed request. Query values are part of the signature; JSON/multipart bodies are not. */
	function signedFetch(ctx: AdsContext, url: string, call: Call = {}) {
		const method = call.method ?? "GET";
		const query = Object.entries(call.query ?? {}).filter(
			(e): e is [string, string] => e[1] !== undefined,
		);
		const authorization = oauth1Header({
			method,
			url,
			query,
			consumerKey: env.X_ADS_CONSUMER_KEY,
			consumerSecret: env.X_ADS_CONSUMER_SECRET,
			token: ctx.accessToken,
			tokenSecret: ctx.accessTokenSecret,
		});
		const mutating = call.mutating ?? false;
		return providerFetch(PROVIDER, query.length ? `${url}?${buildQuery(query)}` : url, {
			method,
			mutating,
			timeoutMs: call.timeoutMs,
			headers: {
				Authorization: authorization,
				...(call.json !== undefined ? { "Content-Type": "application/json" } : {}),
			},
			body: call.json !== undefined ? JSON.stringify(call.json) : call.formData,
			classify: (status, body) => classifyXAdsError(status, body, mutating),
		});
	}

	const api = async <T>(ctx: AdsContext, path: string, call?: Call): Promise<T> =>
		(await (await signedFetch(ctx, `${ADS_API}${path}`, call)).json()) as T;

	const acct = (ctx: AdsContext) => `/accounts/${encodeURIComponent(ctx.accountExternalId)}`;

	async function fundingInstruments(ctx: AdsContext): Promise<FundingInstrument[]> {
		const res = await api<{ data?: FundingInstrument[] }>(ctx, `${acct(ctx)}/funding_instruments`, {
			query: { count: "200" },
		});
		return res.data ?? [];
	}

	async function listAdAccounts(ctx: AdsContext): Promise<AdAccount[]> {
		const out: AdAccount[] = [];
		let cursor: string | undefined;
		for (let page = 0; page < MAX_ACCOUNT_PAGES; page++) {
			const res = await api<{ data?: XAccount[]; next_cursor?: string | null }>(ctx, "/accounts", {
				query: { count: "1000", cursor },
			});
			for (const a of res.data ?? []) {
				if (a.deleted) continue;
				// Accounts carry no currency: it is the funding instrument's.
				const instruments = await fundingInstruments({ ...ctx, accountExternalId: a.id });
				const active = pickFundingInstrument(instruments);
				const currency = active?.currency ?? instruments[0]?.currency ?? "USD";
				out.push({
					externalId: a.id,
					name: a.name ?? a.business_name ?? a.id,
					currency,
					timezone: a.timezone ?? null,
					status:
						a.approval_status && a.approval_status !== "ACCEPTED"
							? "pending"
							: active
								? "active"
								: "disabled",
					metadata: {
						approvalStatus: a.approval_status ?? null,
						fundingInstrumentId: active?.id ?? null,
						timezone: a.timezone ?? null,
					},
				});
			}
			cursor = res.next_cursor ?? undefined;
			if (!cursor) break;
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
			errors.push(`X does not support the "${draft.objective}" objective here`);
		if (!draft.name.trim() || draft.name.length > NAME_MAX)
			errors.push(`Campaign name must be 1–${NAME_MAX} characters`);
		if (account.metadata && !account.metadata.fundingInstrumentId)
			errors.push("This X ads account has no active funding instrument (add a payment method)");

		const budgets = [draft.dailyBudget, draft.lifetimeBudget].filter((b) => b !== undefined);
		if (budgets.length !== 1) errors.push("Set exactly one of a daily or a lifetime budget");
		for (const b of budgets) {
			if (!(b > 0)) errors.push("Budget must be greater than zero");
			else if (toLocalMicro(b, currency) === null)
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
		if (xAgeBucket(t.ageMin, t.ageMax) === null)
			errors.push(
				"X only targets fixed age ranges: 13+, 18+, 21+, 25+, 35+, 50+, or 13/18/21–34, 13/18/21/25/35–49, 13/18/21/25/35–54, 13–24",
			);
		if (t.languages?.some((l) => !/^[a-z]{2}$/i.test(l)))
			errors.push("Languages must be ISO 639-1 codes");

		if (!draft.ads.length) errors.push("Add at least one ad");
		if (draft.ads.length > capabilities.maxAdsPerCampaign)
			errors.push(`At most ${capabilities.maxAdsPerCampaign} ads per campaign`);
		for (const [i, ad] of draft.ads.entries()) errors.push(...adErrors(draft, ad, `Ad ${i + 1}`));
		return errors;
	}

	function adErrors(draft: CampaignDraft, ad: AdDraft, label: string): string[] {
		const errors: string[] = [];
		if (!capabilities.formats.includes(ad.format)) {
			errors.push(`${label}: X does not support ${ad.format} ads here`);
			return errors;
		}
		const images = ad.media.filter((m) => m.kind === "image");
		const videos = ad.media.filter((m) => m.kind === "video");
		if (ad.format === "image" && (images.length !== 1 || videos.length))
			errors.push(`${label}: an image ad needs exactly one image`);
		if (ad.format === "video" && (videos.length !== 1 || images.length))
			errors.push(`${label}: a video ad needs exactly one video`);
		if (draft.objective === "video_views" && ad.format !== "video")
			errors.push(`${label}: a video views campaign needs video ads`);
		// Promoted video: ≤ 10 min, ≤ 500 MB, mp4/mov.
		for (const v of videos) {
			if (v.sizeBytes > 500 * 1024 * 1024) errors.push(`${label}: video must be 500 MB or less`);
			if ((v.durationMs ?? 0) > 600_000) errors.push(`${label}: video must be 10 minutes or less`);
		}
		if (!ad.primaryText.trim()) errors.push(`${label}: text is required`);
		if (xWeightedLength(ad.primaryText) > TWEET_MAX)
			errors.push(`${label}: text is limited to ${TWEET_MAX} characters (X counting)`);
		// The website card carries the headline and destination.
		if (!ad.headline?.trim()) errors.push(`${label}: a headline is required (website card title)`);
		else if (ad.headline.length > CARD_TITLE_MAX)
			errors.push(`${label}: headline is limited to ${CARD_TITLE_MAX} characters`);
		if (!/^https?:\/\//i.test(ad.destinationUrl))
			errors.push(`${label}: destination must be a web URL`);
		return errors;
	}

	/** Chunked v2 upload with media_category amplify_video (required for ads video) or tweet_image. */
	async function uploadMedia(ctx: AdsContext, media: MediaItem, ownerId: string): Promise<string> {
		const bytes = await fetchMediaBytes(PROVIDER, media.url);
		const init = await (
			await signedFetch(ctx, `${MEDIA_API}/initialize`, {
				method: "POST",
				json: {
					media_type: media.mimeType,
					total_bytes: bytes.byteLength,
					media_category: media.kind === "video" ? "amplify_video" : "tweet_image",
					// The promotable user (as_user_id) must own the media to tweet it.
					additional_owners: [ownerId],
				},
			})
		).json();
		const { id, media_key: initKey } = (init as { data: { id: string; media_key?: string } }).data;

		for (let offset = 0, segment = 0; offset < bytes.byteLength; offset += CHUNK_BYTES, segment++) {
			const body = new FormData();
			body.append("segment_index", String(segment));
			body.append("media", new Blob([bytes.subarray(offset, offset + CHUNK_BYTES)]), "chunk");
			await signedFetch(ctx, `${MEDIA_API}/${encodeURIComponent(id)}/append`, {
				method: "POST",
				formData: body,
				timeoutMs: 120_000,
			});
		}
		const fin = (await (
			await signedFetch(ctx, `${MEDIA_API}/${encodeURIComponent(id)}/finalize`, { method: "POST" })
		).json()) as { data: { media_key?: string; processing_info?: ProcessingInfo } };

		let info = fin.data.processing_info;
		const deadline = Date.now() + maxPollMs;
		while (info && (info.state === "pending" || info.state === "in_progress")) {
			const wait = pollIntervalMs ?? Math.min(Math.max(info.check_after_secs ?? 5, 1), 30) * 1000;
			if (Date.now() + wait > deadline)
				throw new ProviderError("transient", PROVIDER, "X is still processing the video");
			await sleep(wait);
			const status = (await (
				await signedFetch(ctx, MEDIA_API, { query: { command: "STATUS", media_id: id } })
			).json()) as { data: { processing_info?: ProcessingInfo } };
			info = status.data.processing_info;
		}
		if (info?.state === "failed")
			throw new ProviderError(
				"invalid_request",
				PROVIDER,
				`X could not process the media: ${info.error?.message ?? "unknown error"}`,
			);
		const key = fin.data.media_key ?? initKey;
		if (!key) throw new ProviderError("transient", PROVIDER, "X returned no media_key");

		// Cards reference media from the account's Media Library.
		// https://docs.x.com/x-ads-api/creatives (Media Library). Invisible, so not mutating.
		await api(ctx, `${acct(ctx)}/media_library`, {
			method: "POST",
			query: { media_key: key },
		});
		return key;
	}

	async function promotableUserId(ctx: AdsContext): Promise<string> {
		if (typeof ctx.metadata.promotableUserId === "string") return ctx.metadata.promotableUserId;
		const res = await api<{ data?: { user_id?: string; promotable_user_type?: string }[] }>(
			ctx,
			`${acct(ctx)}/promotable_users`,
		);
		const full = res.data?.find((u) => u.promotable_user_type === "FULL")?.user_id;
		if (!full)
			throw new ProviderError(
				"invalid_request",
				PROVIDER,
				"The X ads account has no FULL promotable user",
			);
		return full;
	}

	/** Country ISO codes → X LOCATION targeting values (hashed ids). One global read. */
	async function countryTargetingValues(ctx: AdsContext, countries: string[]): Promise<string[]> {
		const res = await api<{ data?: { country_code?: string; targeting_value?: string }[] }>(
			ctx,
			"/targeting_criteria/locations",
			{ query: { location_type: "COUNTRIES", count: "1000" } },
		);
		const byCode = new Map(
			(res.data ?? []).map((l) => [(l.country_code ?? "").toUpperCase(), l.targeting_value]),
		);
		return countries.map((c) => {
			const value = byCode.get(c.toUpperCase());
			if (!value)
				throw new ProviderError("invalid_request", PROVIDER, `X cannot target the country ${c}`);
			return value;
		});
	}

	async function createCampaign(ctx: AdsContext, draft: CampaignDraft): Promise<CreatedCampaign> {
		const errors = validate(draft, { currency: ctx.currency });
		if (errors.length)
			throw new ProviderError("invalid_request", PROVIDER, errors.join("; "), {
				platformCode: "validation",
			});
		const currency = ctx.currency.toUpperCase();

		// Reads first: nothing has been created if any of these fail.
		let fundingInstrumentId =
			typeof ctx.metadata.fundingInstrumentId === "string" ? ctx.metadata.fundingInstrumentId : "";
		if (!fundingInstrumentId) {
			fundingInstrumentId = pickFundingInstrument(await fundingInstruments(ctx))?.id ?? "";
			if (!fundingInstrumentId)
				throw new ProviderError(
					"invalid_request",
					PROVIDER,
					"This X ads account has no active funding instrument",
				);
		}
		const asUserId = await promotableUserId(ctx);
		const t = draft.targeting;
		const locationValues = t.locations?.length
			? t.locations.map((l) => l.id)
			: await countryTargetingValues(ctx, t.countries);

		// 1. Campaign — PAUSED. A lifetime budget is the total; X wants a daily
		// budget for most funding instruments and requires daily ≤ total, so the
		// daily cap is set to the total (never spends more than the total).
		const budgetMicro = toLocalMicro(
			draft.dailyBudget ?? (draft.lifetimeBudget as number),
			currency,
		);
		const campaign = (
			await api<{ data: { id: string } }>(ctx, `${acct(ctx)}/campaigns`, {
				method: "POST",
				mutating: true,
				query: {
					name: draft.name,
					funding_instrument_id: fundingInstrumentId,
					entity_status: "PAUSED",
					daily_budget_amount_local_micro: String(budgetMicro),
					total_budget_amount_local_micro:
						draft.lifetimeBudget !== undefined ? String(budgetMicro) : undefined,
				},
			})
		).data;

		const undo: { ids: string[]; run: () => Promise<void> }[] = [
			{
				ids: [campaign.id],
				run: async () => {
					await signedFetch(ctx, `${ADS_API}${acct(ctx)}/campaigns/${campaign.id}`, {
						method: "DELETE",
						mutating: true,
					});
				},
			},
		];
		const unremovable: string[] = [];
		const objects: CreatedCampaign["objects"] = [];

		try {
			// 2. Line item — PAUSED, all X placements, automatic bidding.
			const lineItem = (
				await api<{ data: { id: string } }>(ctx, `${acct(ctx)}/line_items`, {
					method: "POST",
					mutating: true,
					query: {
						campaign_id: campaign.id,
						name: draft.name.slice(0, NAME_MAX),
						objective: OBJECTIVES[draft.objective],
						product_type: "PROMOTED_TWEETS",
						placements: "ALL_ON_TWITTER",
						bid_strategy: "AUTO",
						entity_status: "PAUSED",
						standard_delivery: "true",
						start_time: new Date(draft.startAt).toISOString(),
						end_time: draft.endAt ? new Date(draft.endAt).toISOString() : undefined,
					},
				})
			).data;
			objects.push({ type: "ad_set", externalId: lineItem.id });
			undo.push({
				ids: [lineItem.id],
				run: async () => {
					await signedFetch(ctx, `${ADS_API}${acct(ctx)}/line_items/${lineItem.id}`, {
						method: "DELETE",
						mutating: true,
					});
				},
			});

			// 3. Targeting — one all-or-nothing batch; criteria belong to the line item.
			const criteria: [string, string][] = [
				...locationValues.map((v) => ["LOCATION", v] as [string, string]),
				...(t.interests ?? []).map((i) => ["INTEREST", i.id] as [string, string]),
				...(t.languages ?? []).map((l) => ["LANGUAGE", l.toLowerCase()] as [string, string]),
				...(t.keywords ?? []).map((k) => ["BROAD_KEYWORD", k] as [string, string]),
			];
			const age = xAgeBucket(t.ageMin, t.ageMax);
			if (age) criteria.push(["AGE", age]);
			// GENDER: 1 = male, 2 = female; both/none = no criterion (everyone).
			if (t.genders?.length === 1) criteria.push(["GENDER", t.genders[0] === "male" ? "1" : "2"]);
			for (const batch of chunk(criteria, TARGETING_BATCH_MAX)) {
				const res = await api<XAdsErrorBody>(ctx, `/batch${acct(ctx)}/targeting_criteria`, {
					method: "POST",
					mutating: true,
					json: batch.map(([targeting_type, targeting_value]) => ({
						operation_type: "Create",
						params: {
							line_item_id: lineItem.id,
							targeting_type,
							targeting_value,
							operator_type: "EQ",
						},
					})),
				});
				const opError = res.operation_errors?.flat().find((e) => e);
				if (opError)
					throw new ProviderError(
						"invalid_request",
						PROVIDER,
						`Targeting rejected: ${opError.message ?? opError.code}`,
						{ platformCode: opError.code },
					);
			}

			// 4. Creatives: media → website card → promoted-only tweet.
			const tweetIds: string[] = [];
			for (const ad of draft.ads) {
				const media = ad.media[0] as MediaItem;
				const mediaKey = await uploadMedia(ctx, media, asUserId);
				objects.push({ type: "asset", externalId: mediaKey });

				const card = (
					await api<{ data: { card_uri: string; id?: string } }>(ctx, `${acct(ctx)}/cards`, {
						method: "POST",
						mutating: true,
						json: {
							name: ad.name.slice(0, CARD_NAME_MAX),
							components: [
								{ type: "MEDIA", media_key: mediaKey },
								{
									type: "DETAILS",
									title: ad.headline,
									destination: { type: "WEBSITE", url: ad.destinationUrl },
								},
							],
						},
					})
				).data;
				unremovable.push(card.card_uri);
				objects.push({ type: "creative", externalId: card.card_uri });

				// nullcast=true: promoted-only, never shown on the profile timeline.
				const tweet = await api<{ data: { id_str?: string; id?: number | string } }>(
					ctx,
					`${acct(ctx)}/tweet`,
					{
						method: "POST",
						mutating: true,
						query: {
							as_user_id: asUserId,
							text: ad.primaryText,
							card_uri: card.card_uri,
							nullcast: "true",
							name: ad.name.slice(0, CARD_NAME_MAX),
						},
					},
				);
				// `id` is a JSON number that loses precision in JS: id_str only.
				const tweetId = tweet.data.id_str ?? String(tweet.data.id);
				unremovable.push(tweetId);
				tweetIds.push(tweetId);
				objects.push({ type: "creative", externalId: tweetId });
			}

			// 5. Promote the tweets in the (paused) line item.
			for (const batch of chunk(tweetIds, PROMOTE_MAX)) {
				const res = await api<{ data?: { id: string }[] }>(ctx, `${acct(ctx)}/promoted_tweets`, {
					method: "POST",
					mutating: true,
					query: { line_item_id: lineItem.id, tweet_ids: batch.join(",") },
				});
				for (const p of res.data ?? []) objects.push({ type: "ad", externalId: p.id });
			}
		} catch (error) {
			return rollback(ctx, error, undo, unremovable);
		}

		return {
			campaignExternalId: campaign.id,
			objects,
			status: "paused",
			// X documents no deep link; this is the account's campaign list in Ads Manager (UNCONFIRMED).
			manageUrl: `https://ads.x.com/ads_manager/${encodeURIComponent(ctx.accountExternalId)}/campaigns`,
		};
	}

	async function getCampaign(ctx: AdsContext, campaignExternalId: string): Promise<XCampaign> {
		const res = await api<{ data?: XCampaign[] }>(ctx, `${acct(ctx)}/campaigns`, {
			query: { campaign_ids: campaignExternalId, with_deleted: "true", with_draft: "true" },
		});
		const c = res.data?.[0];
		if (!c) throw new ProviderError("invalid_request", PROVIDER, "Campaign not found on X");
		return c;
	}

	async function getInsights(
		ctx: AdsContext,
		input: { campaignExternalIds: string[]; since: string; until: string },
	): Promise<CampaignInsightsDay[]> {
		const timeZone = typeof ctx.metadata.timezone === "string" ? ctx.metadata.timezone : "UTC";
		const out: CampaignInsightsDay[] = [];
		for (const ids of chunk(input.campaignExternalIds, STATS_MAX_IDS)) {
			for (const range of splitRange(input, STATS_MAX_DAYS)) {
				const res = await api<StatsResponse>(ctx, `/stats${acct(ctx)}`, {
					query: {
						entity: "CAMPAIGN",
						entity_ids: ids.join(","),
						// DAY granularity: whole days, midnight to midnight in the account timezone; end exclusive.
						start_time: localMidnight(range.since, timeZone),
						end_time: localMidnight(addDays(range.until, 1), timeZone),
						granularity: "DAY",
						placement: "ALL_ON_TWITTER",
						metric_groups: "BILLING,ENGAGEMENT,VIDEO",
					},
				});
				for (const entity of res.data ?? []) {
					const m = entity.id_data?.[0]?.metrics ?? {};
					const at = (name: string, i: number) => num(m[name]?.[i] ?? undefined);
					const days = Math.max(0, ...Object.values(m).map((v) => v?.length ?? 0));
					for (let i = 0; i < days; i++) {
						const spendMicro = at("billed_charge_local_micro", i);
						const row = {
							impressions: at("impressions", i),
							clicks: at("clicks", i),
							videoViews: at("video_total_views", i),
						};
						const known = Object.values(row).some((v) => v !== undefined);
						if (spendMicro === undefined && !known) continue;
						out.push({
							campaignExternalId: entity.id,
							date: addDays(range.since, i),
							// Billing is an estimate for ~3 days and can move for up to 14 (re-collected).
							spend: (spendMicro ?? 0) / 1_000_000,
							...Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined)),
						});
					}
				}
			}
		}
		return out;
	}

	/**
	 * Interests and locations. Both are GLOBAL reads (no account in the path),
	 * limited to 5 requests / 15 min per user, so the picker should debounce.
	 * https://docs.x.com/x-ads-api/fundamentals/rate-limiting
	 */
	async function searchTargeting(
		ctx: AdsContext,
		input: { type: TargetingOption["type"]; query: string; limit: number },
	): Promise<TargetingOption[]> {
		const path =
			input.type === "interest"
				? "/targeting_criteria/interests"
				: input.type === "location"
					? "/targeting_criteria/locations"
					: null;
		if (!path) return [];
		const res = await api<{ data?: { name?: string; targeting_value?: string }[] }>(ctx, path, {
			query: { q: input.query, count: String(Math.min(Math.max(input.limit, 1), 1000)) },
		});
		return (res.data ?? [])
			.filter((d) => d.targeting_value && d.name)
			.slice(0, input.limit)
			.map((d) => ({ id: d.targeting_value as string, name: d.name as string, type: input.type }));
	}

	const updateEntity = async (
		ctx: AdsContext,
		path: string,
		query: Record<string, string>,
	): Promise<void> => {
		await signedFetch(ctx, `${ADS_API}${acct(ctx)}${path}`, {
			method: "PUT",
			mutating: true,
			query,
		});
	};

	return {
		id: "x_ads",
		displayName: "X Ads",
		capabilities,
		// OAuth 1.0a has no scopes; the app's Ads API access level decides what is allowed.
		scopes: [],
		// Writes: 450/min per user shared across endpoints; stay far below.
		// https://docs.x.com/x-ads-api/fundamentals/rate-limiting
		writeRateLimit: { max: 60, durationMs: 60_000 },

		isConfigured: () => Boolean(env.X_ADS_CONSUMER_KEY && env.X_ADS_CONSUMER_SECRET),

		/**
		 * OAuth 1.0a leg 1: get a request token, send the user to authorize it.
		 * `state` rides on the callback URL (X appends oauth_token + oauth_verifier).
		 * The returned `codeVerifier` is "<request token>:<request token secret>",
		 * which exchangeCode needs to sign leg 3 — the API stores it with `state`
		 * like a PKCE verifier. The callback URL must be registered in the X app.
		 * https://docs.x.com/resources/fundamentals/authentication/oauth-1-0a/obtaining-user-access-tokens
		 */
		async getAuthorizationUrl({ redirectUri, state }) {
			const callback = new URL(redirectUri);
			callback.searchParams.set("state", state);
			const res = await providerFetch(PROVIDER, REQUEST_TOKEN_URL, {
				method: "POST",
				headers: {
					Authorization: oauth1Header({
						method: "POST",
						url: REQUEST_TOKEN_URL,
						query: [],
						consumerKey: env.X_ADS_CONSUMER_KEY,
						consumerSecret: env.X_ADS_CONSUMER_SECRET,
						extra: { oauth_callback: callback.toString() },
					}),
				},
				classify: (status, body) => classifyXAdsError(status, body),
			});
			const token = parseForm(await res.text());
			if (
				token.oauth_callback_confirmed !== "true" ||
				!token.oauth_token ||
				!token.oauth_token_secret
			)
				throw new ProviderError("auth", PROVIDER, "X did not confirm the OAuth callback");
			return {
				url: `${AUTHORIZE_URL}?oauth_token=${pct(token.oauth_token)}`,
				codeVerifier: `${token.oauth_token}:${token.oauth_token_secret}`,
			};
		},

		/**
		 * Leg 3. `code` = the oauth_verifier from the callback; `codeVerifier` = what
		 * getAuthorizationUrl returned. Tokens never expire (no refresh).
		 */
		async exchangeCode({ code, codeVerifier }) {
			const sep = codeVerifier?.indexOf(":") ?? -1;
			if (!codeVerifier || sep < 1)
				throw new ProviderError("invalid_request", PROVIDER, "Missing OAuth request token");
			const requestToken = codeVerifier.slice(0, sep);
			const requestSecret = codeVerifier.slice(sep + 1);
			const query: [string, string][] = [["oauth_verifier", code]];
			const res = await providerFetch(PROVIDER, `${ACCESS_TOKEN_URL}?${buildQuery(query)}`, {
				method: "POST",
				headers: {
					Authorization: oauth1Header({
						method: "POST",
						url: ACCESS_TOKEN_URL,
						query,
						consumerKey: env.X_ADS_CONSUMER_KEY,
						consumerSecret: env.X_ADS_CONSUMER_SECRET,
						token: requestToken,
						tokenSecret: requestSecret,
					}),
				},
				classify: (status, body) =>
					status === 401
						? new ProviderError("auth", PROVIDER, "X rejected the OAuth verifier", { status, body })
						: undefined,
			});
			const t = parseForm(await res.text());
			if (!t.oauth_token || !t.oauth_token_secret)
				throw new ProviderError("auth", PROVIDER, "X returned no access token");
			const tokens = {
				accessToken: t.oauth_token,
				tokenSecret: t.oauth_token_secret,
				refreshToken: null,
				expiresAt: null,
				scopes: [],
			};
			const ctx = {
				accountExternalId: "",
				accessToken: tokens.accessToken,
				accessTokenSecret: tokens.tokenSecret,
				currency: "USD",
				metadata: { userId: t.user_id ?? null, screenName: t.screen_name ?? null },
				logger: undefined as unknown as AdsContext["logger"],
			};
			return { tokens, accounts: await listAdAccounts(ctx) };
		},

		validate,
		searchTargeting,
		createCampaign,

		/**
		 * createCampaign paused the line items too: "active" resumes the campaign's
		 * PAUSED line items first and the campaign LAST (the master switch), so a
		 * failure part-way leaves nothing spending. "paused" only needs the campaign.
		 */
		async setStatus(ctx, campaignExternalId, status) {
			if (status === "active") {
				const res = await api<{ data?: { id: string; entity_status?: string }[] }>(
					ctx,
					`${acct(ctx)}/line_items`,
					{ query: { campaign_ids: campaignExternalId, count: "1000" } },
				);
				for (const li of res.data ?? []) {
					if (li.entity_status === "PAUSED")
						await updateEntity(ctx, `/line_items/${li.id}`, { entity_status: "ACTIVE" });
				}
			}
			await updateEntity(ctx, `/campaigns/${campaignExternalId}`, {
				entity_status: status === "active" ? "ACTIVE" : "PAUSED",
			});
		},

		/** X has no archive: DELETE is final (spend stops, the campaign cannot be restored). */
		async archiveCampaign(ctx, campaignExternalId) {
			await signedFetch(ctx, `${ADS_API}${acct(ctx)}/campaigns/${campaignExternalId}`, {
				method: "DELETE",
				mutating: true,
			});
		},

		async getCampaignStatus(ctx, campaignExternalId) {
			return mapXStatus(await getCampaign(ctx, campaignExternalId));
		},

		getInsights,
	};
}
