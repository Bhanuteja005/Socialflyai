import type { BadgeTone } from "@socialfly/ui/components/badge";
import type {
	AdAccountStatus,
	AdCallToAction,
	AdCampaignStatus,
	AdFormat,
	AdsProviderId,
} from "./api-types";

/** UI metadata for ad platforms (Phase 7). The API decides what is configured and allowed. */

/** Where the per-platform ads setup guide is published (optional; links hide when unset). */
export const ADS_DOCS_URL: string | null = process.env.NEXT_PUBLIC_ADS_DOCS_URL || null;

type AdsProviderMeta = {
	name: string;
	color: string;
	/** The organic-channel glyph to reuse, when the brand is the same. */
	glyph?: string;
	description: string;
	/** Server env vars that turn the platform on. */
	env: string[];
	/** Platform approvals needed before real campaigns can be created. */
	approval: string;
	/** Name of the identity each `identityRequired` key refers to. */
	identityLabels?: Record<string, string>;
};

export const ADS_PROVIDERS: Record<AdsProviderId, AdsProviderMeta> = {
	meta_ads: {
		name: "Meta Ads",
		color: "#0866ff",
		glyph: "facebook",
		description: "Facebook and Instagram ads from your Meta ad accounts.",
		env: ["META_APP_ID", "META_APP_SECRET"],
		approval: "App Review for ads_management and ads_read (Advanced Access).",
		identityLabels: {
			pageId: "Facebook Page",
			instagramUserId: "Instagram account",
			pixelId: "Meta pixel",
		},
	},
	google_ads: {
		name: "Google Ads",
		color: "#1a73e8",
		description: "Search, display and video campaigns in Google Ads.",
		env: ["GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_DEVELOPER_TOKEN"],
		approval: "A developer token with Basic access (test accounts only until approved).",
	},
	linkedin_ads: {
		name: "LinkedIn Ads",
		color: "#0a66c2",
		glyph: "linkedin",
		description: "Sponsored content for B2B audiences by job title and industry.",
		env: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
		approval: "The Advertising API product enabled on your LinkedIn app.",
		identityLabels: { organizationUrn: "LinkedIn company page" },
	},
	tiktok_ads: {
		name: "TikTok Ads",
		color: "#010101",
		description: "In-feed video ads through the TikTok Marketing API.",
		env: ["TIKTOK_ADS_APP_ID", "TIKTOK_ADS_APP_SECRET"],
		approval: "An approved TikTok Marketing API developer app.",
		identityLabels: { identityId: "TikTok identity", identityType: "Identity type" },
	},
	pinterest_ads: {
		name: "Pinterest Ads",
		color: "#e60023",
		description: "Promoted Pins for people planning and shopping.",
		env: ["PINTEREST_APP_ID", "PINTEREST_APP_SECRET"],
		approval: "Standard access with the ads:write scope.",
		identityLabels: { boardId: "Pinterest board" },
	},
	x_ads: {
		name: "X Ads",
		color: "#0f1419",
		glyph: "x",
		description: "Promoted posts on X.",
		env: ["X_ADS_CONSUMER_KEY", "X_ADS_CONSUMER_SECRET"],
		approval: "An approved X Ads API application.",
		identityLabels: {
			fundingInstrumentId: "Funding instrument",
			promotableUserId: "Promotable account",
		},
	},
};

export const adsProviderMeta = (id: string): AdsProviderMeta =>
	ADS_PROVIDERS[id as AdsProviderId] ?? {
		name: id.replace(/_/g, " "),
		color: "#71717a",
		description: "",
		env: [],
		approval: "",
	};

export const identityLabel = (provider: string, key: string) =>
	adsProviderMeta(provider).identityLabels?.[key] ??
	key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

type StatusMeta = { label: string; tone: BadgeTone; description: string };

export const CAMPAIGN_STATUS: Record<AdCampaignStatus, StatusMeta> = {
	draft: { label: "Draft", tone: "neutral", description: "Being written. Not sent anywhere." },
	pending_approval: {
		label: "Pending approval",
		tone: "warning",
		description: "Waiting for an admin to approve it.",
	},
	approved: {
		label: "Approved",
		tone: "info",
		description: "Approved; being queued for creation on the platform.",
	},
	rejected: { label: "Rejected", tone: "danger", description: "An admin sent it back." },
	creating: {
		label: "Creating",
		tone: "warning",
		description: "Being created on the platform, paused.",
	},
	paused: {
		label: "Paused",
		tone: "neutral",
		description: "Exists on the platform but is not spending.",
	},
	active: { label: "Active", tone: "success", description: "Running and spending budget." },
	completed: { label: "Completed", tone: "neutral", description: "Its schedule has ended." },
	archived: { label: "Archived", tone: "outline", description: "Archived. It no longer spends." },
	failed: { label: "Failed", tone: "danger", description: "The platform rejected it." },
	unconfirmed: {
		label: "Unconfirmed",
		tone: "warning",
		description: "We couldn't confirm whether the platform created it.",
	},
};

export const CAMPAIGN_STATUSES = Object.keys(CAMPAIGN_STATUS) as AdCampaignStatus[];

export const ACCOUNT_STATUS: Record<AdAccountStatus, { label: string; tone: BadgeTone }> = {
	active: { label: "Active", tone: "success" },
	pending: { label: "Pending review", tone: "info" },
	disabled: { label: "Disabled", tone: "danger" },
	needs_reauth: { label: "Needs reconnect", tone: "warning" },
	disconnected: { label: "Disconnected", tone: "neutral" },
};

export const OBJECTIVES: Record<string, { label: string; description: string }> = {
	awareness: { label: "Awareness", description: "Show your ad to as many people as possible." },
	traffic: { label: "Traffic", description: "Send people to your website." },
	engagement: { label: "Engagement", description: "Get more likes, comments and shares." },
	leads: { label: "Leads", description: "Collect sign-ups and contact details." },
	sales: { label: "Sales", description: "Drive purchases on your site." },
	video_views: { label: "Video views", description: "Get more people watching your video." },
	app_installs: { label: "App installs", description: "Get people to install your app." },
};

export const objectiveLabel = (id: string) => OBJECTIVES[id]?.label ?? id.replace(/_/g, " ");

export const FORMATS: Record<AdFormat, { label: string; description: string }> = {
	image: { label: "Single image", description: "One image with text." },
	video: { label: "Video", description: "One video with text." },
	carousel: { label: "Carousel", description: "2–10 swipeable images or videos." },
	search: { label: "Search", description: "Text ads shown for search keywords." },
};

export const CALLS_TO_ACTION: { value: AdCallToAction; label: string }[] = [
	{ value: "learn_more", label: "Learn more" },
	{ value: "shop_now", label: "Shop now" },
	{ value: "sign_up", label: "Sign up" },
	{ value: "contact_us", label: "Contact us" },
	{ value: "download", label: "Download" },
	{ value: "book_now", label: "Book now" },
	{ value: "get_quote", label: "Get quote" },
	{ value: "subscribe", label: "Subscribe" },
];

export const isCallToAction = (v: string): v is AdCallToAction =>
	CALLS_TO_ACTION.some((c) => c.value === v);

/** Google responsive search ad limits. */
export const SEARCH_LIMITS = {
	headlines: { min: 3, max: 15, length: 30 },
	descriptions: { min: 2, max: 4, length: 90 },
} as const;

// ── Money ────────────────────────────────────────────────────────────────────

const moneyCache = new Map<string, Intl.NumberFormat>();

function moneyFormatter(currency: string, compact = false) {
	const key = `${currency}|${compact}`;
	let f = moneyCache.get(key);
	if (!f) {
		try {
			f = new Intl.NumberFormat(undefined, {
				style: "currency",
				currency,
				...(compact ? { notation: "compact", maximumFractionDigits: 1 } : {}),
			});
		} catch {
			// Unknown ISO code from a platform: show the number with the code beside it.
			f = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
		}
		moneyCache.set(key, f);
	}
	return f;
}

/**
 * "$25.00", "€1,234.50", "¥3,000". Always per currency — amounts in different
 * currencies are never added together anywhere in the UI.
 */
export function formatMoney(value: number | null | undefined, currency: string, compact = false) {
	if (value === null || value === undefined || Number.isNaN(value)) return "—";
	const f = moneyFormatter(currency, compact);
	const text = f.format(value);
	return f.resolvedOptions().style === "currency" ? text : `${text} ${currency}`;
}

/** Minor-unit digits of a currency: 2 for USD, 0 for JPY. */
export function currencyDigits(currency: string) {
	return moneyFormatter(currency).resolvedOptions().maximumFractionDigits ?? 2;
}

/**
 * The amount as a person should type it to confirm activation: plain digits, a dot,
 * the currency's decimals and no grouping ("25.00", "3000").
 */
export function typedAmount(value: number, currency: string) {
	return value.toFixed(currencyDigits(currency));
}

/** The currency symbol alone ("$", "€"), for input adornments. */
export function currencySymbol(currency: string) {
	try {
		const part = new Intl.NumberFormat(undefined, { style: "currency", currency })
			.formatToParts(0)
			.find((p) => p.type === "currency");
		return part?.value ?? currency;
	} catch {
		return currency;
	}
}

// ── Countries & languages ─────────────────────────────────────────────────────

/** ISO 3166-1 alpha-2 codes offered in the picker; names come from Intl in the viewer's language. */
const COUNTRY_CODES =
	"US CA GB IE AU NZ IN SG MY PH ID TH VN JP KR CN HK TW AE SA QA KW BH OM IL TR EG MA NG KE ZA GH DE FR ES IT PT NL BE LU CH AT DK SE NO FI IS PL CZ SK HU RO BG GR HR SI RS UA EE LV LT MX BR AR CL CO PE UY EC VE CR PA DO PR GT PK BD LK NP".split(
		" ",
	);

const LANGUAGE_CODES =
	"en es fr de it pt nl sv da no fi pl cs ro hu el tr ru uk ar he hi bn ur ta te mr id ms th vi zh ja ko tl sw".split(
		" ",
	);

function displayNames(type: "region" | "language") {
	try {
		return new Intl.DisplayNames(undefined, { type });
	} catch {
		return null;
	}
}

const regionNames = typeof Intl !== "undefined" ? displayNames("region") : null;
const languageNames = typeof Intl !== "undefined" ? displayNames("language") : null;

export const countryName = (code: string) => regionNames?.of(code) ?? code;
export const languageName = (code: string) => languageNames?.of(code) ?? code;

export const COUNTRIES = COUNTRY_CODES.map((code) => ({ code, name: countryName(code) })).sort(
	(a, b) => a.name.localeCompare(b.name),
);
export const LANGUAGES = LANGUAGE_CODES.map((code) => ({ code, name: languageName(code) })).sort(
	(a, b) => a.name.localeCompare(b.name),
);
