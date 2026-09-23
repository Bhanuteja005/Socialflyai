import { isCallToAction, SEARCH_LIMITS } from "@/lib/ads";
import type {
	AdAccount,
	AdCallToAction,
	AdCampaignDetail,
	AdFormat,
	AdObjective,
	AdsProvider,
	CreateCampaignInput,
	MediaAsset,
	PostDetail,
	TargetingOption,
} from "@/lib/api-types";
import { textLength } from "@/lib/format";
import { fromLocalInputValue, toLocalInputValue } from "@/lib/timezone";

export const STEPS = [
	{ id: "setup", label: "Campaign" },
	{ id: "creative", label: "Creative" },
	{ id: "audience", label: "Audience" },
	{ id: "budget", label: "Budget & schedule" },
	{ id: "review", label: "Review" },
] as const;
export type StepId = (typeof STEPS)[number]["id"];

export const isStepId = (v: string | null): v is StepId => STEPS.some((s) => s.id === v);

/** A preview of an attached file; the API only needs the id. */
export type AttachedMedia = Pick<MediaAsset, "id" | "kind" | "url" | "fileName"> &
	Partial<Pick<MediaAsset, "altText" | "durationMs">>;

export type WizardState = {
	adAccountId: string;
	name: string;
	objective: AdObjective | "";
	format: AdFormat | "";
	// Creative (one ad per campaign in the UI; the API accepts several).
	primaryText: string;
	headline: string;
	description: string;
	callToAction: AdCallToAction | "";
	destinationUrl: string;
	media: AttachedMedia[];
	searchHeadlines: string[];
	searchDescriptions: string[];
	// Audience
	countries: string[];
	locations: TargetingOption[];
	ageMin: string;
	ageMax: string;
	genders: ("male" | "female")[];
	languages: string[];
	interests: TargetingOption[];
	keywords: string[];
	jobTitles: TargetingOption[];
	industries: TargetingOption[];
	/** Interest names the AI suggested; the user resolves them to real options via search. */
	suggestedInterests: string[];
	// Budget & schedule
	budgetType: "daily" | "lifetime";
	budget: string;
	/** datetime-local values in the ad account's time zone. */
	startAt: string;
	endAt: string;
	// Provenance
	sourcePostId: string | null;
	/** "ai" while the copy is exactly what the AI wrote; any edit makes it "human". */
	source: "human" | "ai";
};

export function emptyState(timeZone: string): WizardState {
	// Tomorrow at 09:00 in the account's zone: never "right now", which would already be past on submit.
	const start = new Date(Date.now() + 86_400_000);
	const local = toLocalInputValue(start, timeZone).slice(0, 10);
	return {
		adAccountId: "",
		name: "",
		objective: "",
		format: "",
		primaryText: "",
		headline: "",
		description: "",
		callToAction: "learn_more",
		destinationUrl: "",
		media: [],
		searchHeadlines: ["", "", ""],
		searchDescriptions: ["", ""],
		countries: [],
		locations: [],
		ageMin: "18",
		ageMax: "65",
		genders: [],
		languages: [],
		interests: [],
		keywords: [],
		jobTitles: [],
		industries: [],
		suggestedInterests: [],
		budgetType: "daily",
		budget: "",
		startAt: `${local}T09:00`,
		endAt: "",
		sourcePostId: null,
		source: "human",
	};
}

/** Boosting a post: its text and media become the ad's starting point. */
export function prefillFromPost(state: WizardState, post: PostDetail): WizardState {
	const media = post.media.map((m) => ({
		id: m.id,
		kind: m.kind,
		url: m.url,
		fileName: m.fileName,
		altText: m.altText,
		durationMs: m.durationMs,
	}));
	const format: AdFormat =
		media.length > 1 ? "carousel" : media[0]?.kind === "video" ? "video" : "image";
	const firstLine = (post.content ?? "").split("\n")[0]?.trim() ?? "";
	return {
		...state,
		name: `Boost: ${firstLine.slice(0, 60) || "post"}`,
		primaryText: post.content ?? "",
		media: media.slice(0, 10),
		format: state.format || format,
		sourcePostId: post.id,
	};
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Rebuilds the wizard from a saved draft (editing a draft or a rejected campaign). */
export function fromCampaign(c: AdCampaignDetail, timeZone: string): WizardState {
	const base = emptyState(timeZone);
	const draft = (c.draft ?? {}) as Record<string, unknown>;
	const targeting = (draft.targeting ?? {}) as Record<string, unknown>;
	const ad = (arr<Record<string, unknown>>(draft.ads)[0] ?? {}) as Record<string, unknown>;
	const mediaIds = arr<string>(ad.mediaIds);
	const mediaPreview = arr<AttachedMedia>(ad.media);
	const cta = str(ad.callToAction);
	return {
		...base,
		adAccountId: c.adAccount.id,
		name: c.name,
		objective: c.objective as AdObjective,
		format: (str(ad.format) as AdFormat) || "",
		primaryText: str(ad.primaryText),
		headline: str(ad.headline),
		description: str(ad.description),
		callToAction: isCallToAction(cta) ? cta : "",
		destinationUrl: str(ad.destinationUrl),
		media: mediaIds.map(
			(id) =>
				mediaPreview.find((m) => m.id === id) ?? { id, kind: "image", url: "", fileName: "File" },
		),
		searchHeadlines: arr<string>(ad.searchHeadlines).length
			? arr<string>(ad.searchHeadlines)
			: base.searchHeadlines,
		searchDescriptions: arr<string>(ad.searchDescriptions).length
			? arr<string>(ad.searchDescriptions)
			: base.searchDescriptions,
		countries: arr<string>(targeting.countries),
		locations: arr<TargetingOption>(targeting.locations),
		ageMin: targeting.ageMin === undefined ? base.ageMin : String(targeting.ageMin),
		ageMax: targeting.ageMax === undefined ? base.ageMax : String(targeting.ageMax),
		genders: arr<"male" | "female">(targeting.genders),
		languages: arr<string>(targeting.languages),
		interests: arr<TargetingOption>(targeting.interests),
		keywords: arr<string>(targeting.keywords),
		jobTitles: arr<TargetingOption>(targeting.jobTitles),
		industries: arr<TargetingOption>(targeting.industries),
		budgetType: c.lifetimeBudget !== null ? "lifetime" : "daily",
		budget: String(c.lifetimeBudget ?? c.dailyBudget ?? ""),
		startAt: toLocalInputValue(new Date(c.startAt), timeZone),
		endAt: c.endAt ? toLocalInputValue(new Date(c.endAt), timeZone) : "",
		sourcePostId: c.sourcePostId,
		source: c.source === "ai" ? "ai" : "human",
	};
}

// ── What each provider asks for ───────────────────────────────────────────────

export type Needs = {
	interests: boolean;
	jobTitles: boolean;
	industries: boolean;
	keywords: boolean;
	headline: boolean;
	description: boolean;
};

export function needsFor(provider: string | undefined, format: AdFormat | ""): Needs {
	const search = format === "search";
	return {
		interests: !search && provider !== "google_ads" && provider !== "linkedin_ads",
		jobTitles: provider === "linkedin_ads",
		industries: provider === "linkedin_ads",
		keywords: search || provider === "pinterest_ads",
		headline: !search,
		description: !search,
	};
}

export const mediaRule = (format: AdFormat | "") =>
	format === "image"
		? { min: 1, max: 1, kind: "image" as const, label: "one image" }
		: format === "video"
			? { min: 1, max: 1, kind: "video" as const, label: "one video" }
			: format === "carousel"
				? { min: 2, max: 10, kind: undefined, label: "2 to 10 images or videos" }
				: { min: 0, max: 0, kind: undefined, label: "no media" };

// ── Validation (the API validates again; this only keeps people moving) ───────

export type StepErrors = Partial<Record<string, string>>;

const URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

export function parseAmount(value: string): number | null {
	const t = value.trim().replace(/,/g, "");
	if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
	const n = Number(t);
	return Number.isFinite(n) ? n : null;
}

type Ctx = {
	account?: AdAccount;
	provider?: AdsProvider;
	ceiling: number | null;
	timeZone: string;
};

export function validateStep(step: StepId, s: WizardState, ctx: Ctx): StepErrors {
	const e: StepErrors = {};
	if (step === "setup") {
		if (!s.adAccountId) e.adAccountId = "Choose an ad account.";
		else if (ctx.account && ctx.account.status !== "active")
			e.adAccountId = "This ad account isn't active. Reconnect it on the Accounts tab.";
		else if (ctx.account?.identityRequired.length)
			e.adAccountId = "Finish this account's setup on the Accounts tab first.";
		if (!s.name.trim()) e.name = "Give the campaign a name.";
		if (!s.objective) e.objective = "Choose what the campaign should achieve.";
		if (!s.format) e.format = "Choose an ad format.";
	}
	if (step === "creative") {
		const limits = ctx.provider?.textLimits;
		const search = s.format === "search";
		if (!search) {
			if (!s.primaryText.trim()) e.primaryText = "Write the ad's main text.";
			else if (limits && textLength(s.primaryText) > limits.primaryText)
				e.primaryText = `Keep it to ${limits.primaryText} characters.`;
			if (limits?.headline && textLength(s.headline) > limits.headline)
				e.headline = `Keep it to ${limits.headline} characters.`;
			if (limits?.description && textLength(s.description) > limits.description)
				e.description = `Keep it to ${limits.description} characters.`;
			const rule = mediaRule(s.format);
			if (s.media.length < rule.min || s.media.length > rule.max)
				e.media = `This format needs ${rule.label}.`;
			else if (rule.kind && s.media.some((m) => m.kind !== rule.kind))
				e.media = `This format needs ${rule.label}.`;
		} else {
			const h = s.searchHeadlines.map((x) => x.trim()).filter(Boolean);
			const d = s.searchDescriptions.map((x) => x.trim()).filter(Boolean);
			if (h.length < SEARCH_LIMITS.headlines.min)
				e.searchHeadlines = `Add at least ${SEARCH_LIMITS.headlines.min} headlines.`;
			else if (h.some((x) => textLength(x) > SEARCH_LIMITS.headlines.length))
				e.searchHeadlines = `Each headline can have up to ${SEARCH_LIMITS.headlines.length} characters.`;
			if (d.length < SEARCH_LIMITS.descriptions.min)
				e.searchDescriptions = `Add at least ${SEARCH_LIMITS.descriptions.min} descriptions.`;
			else if (d.some((x) => textLength(x) > SEARCH_LIMITS.descriptions.length))
				e.searchDescriptions = `Each description can have up to ${SEARCH_LIMITS.descriptions.length} characters.`;
		}
		if (!URL_RE.test(s.destinationUrl.trim()))
			e.destinationUrl = "Enter the full web address people land on, starting with https://";
	}
	if (step === "audience") {
		if (s.countries.length === 0) e.countries = "Choose at least one country.";
		const min = Number(s.ageMin);
		const max = Number(s.ageMax);
		if (!Number.isInteger(min) || min < 13 || min > 65) e.age = "Ages go from 13 to 65+.";
		else if (!Number.isInteger(max) || max < 13 || max > 65) e.age = "Ages go from 13 to 65+.";
		else if (min > max) e.age = "The minimum age must be below the maximum.";
		if (s.format === "search" && s.keywords.length === 0)
			e.keywords = "Add the search keywords this ad should show for.";
	}
	if (step === "budget") {
		const amount = parseAmount(s.budget);
		if (amount === null || amount <= 0) e.budget = "Enter an amount, like 25 or 25.50.";
		else if (s.budgetType === "daily" && ctx.ceiling && amount > ctx.ceiling)
			e.budget = `Your organization's daily ceiling is ${ctx.ceiling}.`;
		const start = fromLocalInputValue(s.startAt, ctx.timeZone);
		const end = s.endAt ? fromLocalInputValue(s.endAt, ctx.timeZone) : null;
		if (!start) e.startAt = "Choose when the campaign may start.";
		else if (start.getTime() < Date.now() - 5 * 60_000) e.startAt = "The start is in the past.";
		if (s.budgetType === "lifetime" && !s.endAt) e.endAt = "A lifetime budget needs an end date.";
		else if (start && end && end.getTime() <= start.getTime())
			e.endAt = "The end must be after the start.";
		if (
			s.budgetType === "lifetime" &&
			amount &&
			start &&
			end &&
			ctx.ceiling &&
			amount / Math.max(1, (end.getTime() - start.getTime()) / 86_400_000) > ctx.ceiling
		)
			e.budget = `That averages more than your organization's daily ceiling of ${ctx.ceiling}.`;
	}
	return e;
}

export function toInput(s: WizardState, timeZone: string, submit: boolean): CreateCampaignInput {
	// Submitting always carries the declaration: the Review step won't submit until it's ticked.
	const search = s.format === "search";
	const amount = parseAmount(s.budget) ?? 0;
	const start = fromLocalInputValue(s.startAt, timeZone);
	const end = s.endAt ? fromLocalInputValue(s.endAt, timeZone) : null;
	const opt = <T>(v: T[]) => (v.length ? v : undefined);
	return {
		adAccountId: s.adAccountId,
		name: s.name.trim(),
		objective: s.objective as AdObjective,
		...(s.budgetType === "daily" ? { dailyBudget: amount } : { lifetimeBudget: amount }),
		startAt: (start ?? new Date()).toISOString(),
		endAt: end ? end.toISOString() : null,
		targeting: {
			countries: s.countries,
			locations: opt(s.locations),
			ageMin: Number(s.ageMin) || undefined,
			ageMax: Number(s.ageMax) || undefined,
			genders: opt(s.genders),
			languages: opt(s.languages),
			interests: opt(s.interests),
			keywords: opt(s.keywords),
			jobTitles: opt(s.jobTitles),
			industries: opt(s.industries),
		},
		ads: [
			{
				name: s.name.trim() || "Ad 1",
				format: (s.format || "image") as AdFormat,
				// Search ads carry their text in the headline/description lists.
				primaryText: search ? "" : s.primaryText.trim(),
				headline: search ? undefined : s.headline.trim() || undefined,
				description: search ? undefined : s.description.trim() || undefined,
				callToAction: s.callToAction || undefined,
				destinationUrl: s.destinationUrl.trim(),
				mediaIds: search ? [] : s.media.map((m) => m.id),
				searchHeadlines: search
					? s.searchHeadlines.map((x) => x.trim()).filter(Boolean)
					: undefined,
				searchDescriptions: search
					? s.searchDescriptions.map((x) => x.trim()).filter(Boolean)
					: undefined,
			},
		],
		sourcePostId: s.sourcePostId ?? undefined,
		source: s.source,
		submit,
		...(submit ? { declarations: { notPoliticalOrSpecialCategory: true as const } } : {}),
	};
}

/** Maps the API's 422 `ads_invalid` sentences to the step that can fix them. */
export function stepForProblem(problem: string): StepId {
	const p = problem.toLowerCase();
	if (/politic|special (ad )?categor|declar|election|housing|employment|credit/.test(p))
		return "review";
	if (/budget|spend|ceiling|minimum|schedule|start|end date|end time|lifetime|daily/.test(p))
		return "budget";
	if (/countr|age|gender|language|interest|keyword|audience|targeting|location|job|industr/.test(p))
		return "audience";
	if (
		/text|headline|description|media|image|video|carousel|creative|url|link|call to action|cta|character/.test(
			p,
		)
	)
		return "creative";
	if (/account|objective|format|identity|page|name/.test(p)) return "setup";
	return "review";
}
