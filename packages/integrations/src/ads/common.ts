import type { Logger } from "@socialfly/core/logger";
import { isProviderError, ProviderError } from "../errors";
import type { AdDraft, AdsCapabilities, CampaignDraft, CreatedCampaign, Targeting } from "./types";

/**
 * Helpers shared by the ad platform adapters: exact money conversion, the draft
 * checks every platform needs, and the rollback for multi-step creation.
 */

// ---------------------------------------------------------------------------
// Money — integer math only. `25.5 * 100` is 2550.0000000000005 in floating
// point; every conversion goes through Math.round on a scaled value and checks
// that no real precision was lost, so a budget can never be silently rounded.
// ---------------------------------------------------------------------------

/** ISO 4217 minor-unit digits (USD 2, JPY 0, BHD 3), or null for an unknown code. */
export function currencyDigits(currency: string): number | null {
	if (!/^[A-Z]{3}$/.test(currency)) return null;
	try {
		return (
			new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
				.maximumFractionDigits ?? 2
		);
	} catch {
		return null;
	}
}

/**
 * `amount` × 10^digits as an exact integer, or null when the amount carries more
 * precision than `digits` allows (25.555 USD) or is not a safe integer once scaled.
 */
export function toScaledInteger(amount: number, digits: number): number | null {
	if (!Number.isFinite(amount)) return null;
	const exact = amount * 10 ** digits;
	const scaled = Math.round(exact);
	// Float noise is ~1e-12 of the value; a genuine extra decimal is ≥ 0.1 of a unit.
	if (Math.abs(scaled - exact) > 1e-6) return null;
	return Number.isSafeInteger(scaled) ? scaled : null;
}

/** Integer count of 10^-digits units → "25.50" / "1000" without floating point. */
export function formatScaled(scaled: number, digits: number): string {
	if (digits === 0) return String(scaled);
	const sign = scaled < 0 ? "-" : "";
	const abs = String(Math.abs(scaled)).padStart(digits + 1, "0");
	return `${sign}${abs.slice(0, -digits)}.${abs.slice(-digits)}`;
}

/** Major units → micros (Google, Pinterest): exact via cents, as an int64 decimal string. */
export function toMicros(amount: number): string | null {
	// Micros have 6 digits, but no currency accepts sub-cent budgets; going through
	// hundredths keeps the multiplication inside safe integers for any real budget.
	const hundredths = toScaledInteger(amount, 2);
	return hundredths === null ? null : (BigInt(hundredths) * 10_000n).toString();
}

/** Platform micros (int64 string or number) → major units. */
export function fromMicros(micros: string | number | undefined | null): number {
	if (micros === undefined || micros === null || micros === "") return 0;
	const n = Number(micros);
	return Number.isFinite(n) ? n / 1_000_000 : 0;
}

/** A decimal string from a report ("12.34") → number; garbage → 0 rather than NaN. */
export function decimal(value: string | number | undefined | null): number {
	const n = typeof value === "number" ? value : Number(value ?? 0);
	return Number.isFinite(n) ? n : 0;
}

export type DraftBudget = { kind: "daily" | "lifetime"; amount: number };

/** The draft's single budget (validate() has already rejected both/neither). */
export function draftBudget(draft: CampaignDraft): DraftBudget {
	return draft.dailyBudget !== undefined
		? { kind: "daily", amount: draft.dailyBudget }
		: { kind: "lifetime", amount: draft.lifetimeBudget ?? 0 };
}

// ---------------------------------------------------------------------------
// Validation shared by every adapter
// ---------------------------------------------------------------------------

export type DraftRules = {
	platform: string;
	capabilities: AdsCapabilities;
	/** Lifetime budgets supported at all (Google search: no). */
	lifetimeBudget: boolean;
	/** Documented minimum daily / lifetime budget per currency, major units. Unlisted = not checked. */
	minDaily?: Partial<Record<string, number>>;
	minLifetime?: Partial<Record<string, number>>;
	/**
	 * Minor-unit digits the platform accepts for a currency, when it differs from
	 * ISO 4217 (Meta's offset-1 currencies such as HUF and TWD take whole units).
	 */
	digits?: (currency: string) => number | null;
	/**
	 * Targeting fields this adapter does not implement. They are REJECTED, never
	 * silently dropped: ignoring a targeting constraint widens the audience and
	 * spends money on people the user excluded.
	 */
	unsupportedTargeting?: (keyof Targeting)[];
};

const TARGETING_LABELS: Record<keyof Targeting, string> = {
	countries: "countries",
	locations: "location",
	ageMin: "age",
	ageMax: "age",
	genders: "gender",
	languages: "language",
	interests: "interest",
	keywords: "keyword",
	jobTitles: "job title",
	industries: "industry",
};

const codePoints = (s: string) => [...s].length;

const isHttpUrl = (value: string) => {
	try {
		const url = new URL(value);
		return url.protocol === "https:" || url.protocol === "http:";
	} catch {
		return false;
	}
};

const present = (value: unknown) =>
	value !== undefined && value !== null && (!Array.isArray(value) || value.length > 0);

export function validateDraftBasics(
	draft: CampaignDraft,
	account: { currency: string },
	rules: DraftRules,
): string[] {
	const { platform, capabilities } = rules;
	const errors: string[] = [];
	const currency = account.currency.toUpperCase();

	if (!draft.name.trim()) errors.push("The campaign needs a name");
	if (!capabilities.objectives.includes(draft.objective)) {
		errors.push(`${platform} does not support the "${draft.objective}" objective here`);
	}

	// Budget: exactly one, positive, representable exactly in the account currency.
	const hasDaily = draft.dailyBudget !== undefined;
	const hasLifetime = draft.lifetimeBudget !== undefined;
	if (hasDaily === hasLifetime) {
		errors.push("Set exactly one of a daily or a lifetime budget");
	} else {
		const { kind, amount } = draftBudget(draft);
		const digits = rules.digits ? rules.digits(currency) : currencyDigits(currency);
		if (kind === "lifetime" && !rules.lifetimeBudget) {
			errors.push(`${platform} campaigns here support daily budgets only`);
		} else if (!Number.isFinite(amount) || amount <= 0) {
			errors.push("The budget must be greater than zero");
		} else if (digits === null) {
			errors.push(`Unsupported account currency "${account.currency}"`);
		} else if (toScaledInteger(amount, digits) === null) {
			errors.push(
				digits === 0
					? `${platform} budgets in ${currency} must be whole amounts`
					: `${platform} budgets in ${currency} allow at most ${digits} decimal places`,
			);
		} else {
			const min = (kind === "daily" ? rules.minDaily : rules.minLifetime)?.[currency];
			if (min !== undefined && amount < min) {
				errors.push(`${platform} requires a ${kind} budget of at least ${min} ${currency}`);
			}
		}
	}

	// Schedule.
	const start = Date.parse(draft.startAt);
	const end = draft.endAt ? Date.parse(draft.endAt) : null;
	if (Number.isNaN(start)) errors.push("The start date is not a valid date");
	if (end !== null && Number.isNaN(end)) errors.push("The end date is not a valid date");
	if (hasLifetime && !draft.endAt) errors.push("A lifetime budget needs an end date");
	if (end !== null && !Number.isNaN(start) && !Number.isNaN(end) && end <= start) {
		errors.push("The end date must be after the start date");
	}

	// Targeting.
	const t = draft.targeting;
	if (t.countries.length === 0) errors.push("Target at least one country");
	for (const c of t.countries) {
		if (!/^[A-Z]{2}$/.test(c)) errors.push(`"${c}" is not an ISO 3166-1 alpha-2 country code`);
	}
	if (t.ageMin !== undefined && t.ageMax !== undefined && t.ageMin > t.ageMax) {
		errors.push("The minimum age must not exceed the maximum age");
	}
	const unsupported = new Set(
		(rules.unsupportedTargeting ?? [])
			.filter((key) => present(t[key]))
			.map((key) => TARGETING_LABELS[key]),
	);
	for (const label of unsupported) {
		errors.push(`${platform} ${label} targeting is not supported yet — remove it to continue`);
	}

	// Ads.
	if (draft.ads.length === 0) errors.push("Add at least one ad");
	if (draft.ads.length > capabilities.maxAdsPerCampaign) {
		errors.push(`${platform} allows at most ${capabilities.maxAdsPerCampaign} ads per campaign`);
	}
	draft.ads.forEach((ad, i) => {
		errors.push(...validateAdBasics(ad, rules).map((e) => `Ad ${i + 1}: ${e}`));
	});
	return errors;
}

function validateAdBasics(ad: AdDraft, { platform, capabilities }: DraftRules): string[] {
	const errors: string[] = [];
	const limits = capabilities.textLimits;
	if (!capabilities.formats.includes(ad.format)) {
		errors.push(`${platform} does not support the "${ad.format}" format here`);
	}
	if (!isHttpUrl(ad.destinationUrl)) errors.push("The destination must be an http(s) URL");
	if (codePoints(ad.primaryText) > limits.primaryText) {
		errors.push(`${platform} limits the main text to ${limits.primaryText} characters`);
	}
	if (ad.headline && limits.headline !== undefined && codePoints(ad.headline) > limits.headline) {
		errors.push(`${platform} limits headlines to ${limits.headline} characters`);
	}
	if (
		ad.description &&
		limits.description !== undefined &&
		codePoints(ad.description) > limits.description
	) {
		errors.push(`${platform} limits descriptions to ${limits.description} characters`);
	}
	return errors;
}

export const countMedia = (ad: AdDraft, kind: "image" | "video") =>
	ad.media.filter((m) => m.kind === kind).length;

// ---------------------------------------------------------------------------
// Rollback of a partially created campaign
// ---------------------------------------------------------------------------

export type CreatedStep = {
	type: CreatedCampaign["objects"][number]["type"] | "campaign" | "campaign_group";
	externalId: string;
	/** Deletes/archives the object. Omitted when removing a parent removes it too. */
	cleanup?: () => Promise<void>;
};

/**
 * A later step failed: remove what was created, newest first (children before
 * parents), then rethrow with the ids that could not be removed. Everything was
 * created PAUSED, so a leftover spends nothing — but it clutters the ads manager
 * and must be visible to the user and support.
 *
 * The original error kind is preserved: an `unknown_outcome` on, say, the ad
 * create still means that one ad may exist without us knowing its id.
 */
export async function rollbackAndThrow(
	provider: string,
	created: CreatedStep[],
	error: unknown,
	logger: Logger,
): Promise<never> {
	const base = isProviderError(error)
		? error
		: new ProviderError(
				"unknown_outcome",
				provider,
				`Campaign creation failed unexpectedly: ${(error as Error)?.message ?? String(error)}`,
				{},
				{ cause: error },
			);
	if (created.length === 0) throw base;

	const orphaned: string[] = [];
	for (const step of [...created].reverse()) {
		if (!step.cleanup) continue;
		try {
			await step.cleanup();
		} catch (cleanupError) {
			orphaned.push(step.externalId);
			logger.warn(
				{ err: cleanupError, provider, type: step.type, externalId: step.externalId },
				"ads rollback: could not remove a created object",
			);
		}
	}
	const suffix =
		orphaned.length === 0
			? "the objects already created were removed"
			: `${orphaned.length} created object(s) could not be removed and remain paused`;
	throw new ProviderError(
		base.kind,
		provider,
		`${base.message} — ${suffix}`,
		{ ...base.details, orphanedExternalIds: orphaned },
		{ cause: error },
	);
}

/** Pre-flight failure: nothing was sent, the user must fix the draft. */
export const draftRejected = (provider: string, errors: string[]) =>
	new ProviderError("invalid_request", provider, errors.join("; "));

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
