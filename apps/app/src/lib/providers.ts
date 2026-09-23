/**
 * UI metadata per platform: display names, brand colour and the per-target
 * settings each provider's `settingsSchema` accepts (packages/integrations/src/providers).
 */

export type ProviderId =
	| "linkedin"
	| "linkedin_page"
	| "facebook"
	| "instagram"
	| "threads"
	| "x"
	| "reddit"
	| "youtube";

type Option = { value: string; label: string };

export type SettingField =
	| {
			kind: "select";
			key: string;
			label: string;
			options: Option[];
			defaultValue: string;
			hint?: string;
	  }
	| {
			kind: "text";
			key: string;
			label: string;
			required?: boolean;
			maxLength?: number;
			placeholder?: string;
			hint?: string;
			inputType?: "text" | "url";
	  }
	| { kind: "boolean"; key: string; label: string; defaultValue: boolean; hint?: string }
	| { kind: "tags"; key: string; label: string; placeholder?: string; hint?: string };

type ProviderMeta = {
	name: string;
	/** Brand colour for chips, calendar accents and icon tiles. */
	color: string;
	description: string;
	settings: SettingField[];
};

const linkedinVisibility: SettingField = {
	kind: "select",
	key: "visibility",
	label: "Visibility",
	defaultValue: "PUBLIC",
	options: [
		{ value: "PUBLIC", label: "Anyone" },
		{ value: "CONNECTIONS", label: "Connections only" },
	],
};

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
	x: {
		name: "X",
		color: "#0f1419",
		description: "Posts, images and short videos to your X timeline.",
		settings: [],
	},
	linkedin: {
		name: "LinkedIn",
		color: "#0a66c2",
		description: "Share updates from your personal LinkedIn profile.",
		settings: [linkedinVisibility],
	},
	linkedin_page: {
		name: "LinkedIn Page",
		color: "#0a66c2",
		description: "Publish as a LinkedIn company page you administer.",
		settings: [linkedinVisibility],
	},
	facebook: {
		name: "Facebook",
		color: "#0866ff",
		description: "Publish to the Facebook Pages you manage.",
		settings: [],
	},
	instagram: {
		name: "Instagram",
		color: "#e1306c",
		description: "Feed posts, carousels, reels and stories for business accounts.",
		settings: [
			{
				kind: "select",
				key: "postType",
				label: "Post type",
				defaultValue: "feed",
				options: [
					{ value: "feed", label: "Feed post" },
					{ value: "reel", label: "Reel" },
					{ value: "story", label: "Story" },
				],
			},
		],
	},
	threads: {
		name: "Threads",
		color: "#101010",
		description: "Text, images and video posts on Threads.",
		settings: [
			{
				kind: "select",
				key: "replyControl",
				label: "Who can reply",
				defaultValue: "everyone",
				options: [
					{ value: "everyone", label: "Everyone" },
					{ value: "accounts_you_follow", label: "Accounts you follow" },
					{ value: "mentioned_only", label: "Mentioned only" },
				],
			},
		],
	},
	reddit: {
		name: "Reddit",
		color: "#ff4500",
		description: "Text and link posts to the subreddits you choose.",
		settings: [
			{
				kind: "text",
				key: "subreddit",
				label: "Subreddit",
				required: true,
				placeholder: "r/socialmedia",
			},
			{ kind: "text", key: "title", label: "Title", required: true, maxLength: 300 },
			{
				kind: "text",
				key: "url",
				label: "Link (optional)",
				inputType: "url",
				placeholder: "https://",
				hint: "Makes this a link post. Link posts can't have body text.",
			},
			{ kind: "text", key: "flairId", label: "Flair ID (optional)" },
			{ kind: "boolean", key: "nsfw", label: "Mark as NSFW", defaultValue: false },
			{ kind: "boolean", key: "spoiler", label: "Mark as spoiler", defaultValue: false },
		],
	},
	youtube: {
		name: "YouTube",
		color: "#ff0000",
		description: "Upload videos to your YouTube channel.",
		settings: [
			{ kind: "text", key: "title", label: "Video title", required: true, maxLength: 100 },
			{
				kind: "select",
				key: "privacyStatus",
				label: "Privacy",
				defaultValue: "public",
				options: [
					{ value: "public", label: "Public" },
					{ value: "unlisted", label: "Unlisted" },
					{ value: "private", label: "Private" },
				],
			},
			{
				kind: "select",
				key: "categoryId",
				label: "Category",
				defaultValue: "22",
				options: [
					{ value: "22", label: "People & Blogs" },
					{ value: "27", label: "Education" },
					{ value: "24", label: "Entertainment" },
					{ value: "28", label: "Science & Technology" },
					{ value: "26", label: "Howto & Style" },
					{ value: "25", label: "News & Politics" },
					{ value: "10", label: "Music" },
					{ value: "20", label: "Gaming" },
					{ value: "17", label: "Sports" },
					{ value: "19", label: "Travel & Events" },
					{ value: "15", label: "Pets & Animals" },
					{ value: "2", label: "Autos & Vehicles" },
					{ value: "1", label: "Film & Animation" },
					{ value: "23", label: "Comedy" },
					{ value: "29", label: "Nonprofits & Activism" },
				],
			},
			{ kind: "tags", key: "tags", label: "Tags", placeholder: "launch, tutorial" },
			{ kind: "boolean", key: "madeForKids", label: "Made for kids", defaultValue: false },
		],
	},
};

const FALLBACK: ProviderMeta = { name: "", color: "#71717a", description: "", settings: [] };

export function providerMeta(id: string): ProviderMeta {
	const meta = PROVIDERS[id as ProviderId];
	return meta ?? { ...FALLBACK, name: id.replace(/_/g, " ") };
}

export const providerName = (id: string) => providerMeta(id).name;

export type TargetSettings = Record<string, unknown>;

/** Defaults for a newly selected channel, matching the schemas' own defaults. */
export function defaultSettings(provider: string): TargetSettings {
	const out: TargetSettings = {};
	for (const f of providerMeta(provider).settings) {
		if (f.kind === "select" || f.kind === "boolean") out[f.key] = f.defaultValue;
	}
	return out;
}

/**
 * Settings as the API expects them: empty optional strings dropped (they would fail
 * `z.url()` etc.), tags split into an array.
 */
export function cleanSettings(provider: string, settings: TargetSettings): TargetSettings {
	const out: TargetSettings = {};
	for (const f of providerMeta(provider).settings) {
		const value = settings[f.key];
		if (f.kind === "text") {
			const text = typeof value === "string" ? value.trim() : "";
			if (text) out[f.key] = text;
		} else if (f.kind === "tags") {
			const list = (Array.isArray(value) ? value : String(value ?? "").split(","))
				.map((t) => String(t).trim())
				.filter(Boolean);
			if (list.length) out[f.key] = list;
		} else if (value !== undefined) {
			out[f.key] = value;
		}
	}
	return out;
}

/** Client-side check for required settings, so the composer can flag them before validation. */
export function missingSettings(provider: string, settings: TargetSettings): string[] {
	return providerMeta(provider)
		.settings.filter(
			(f) => f.kind === "text" && f.required && !String(settings[f.key] ?? "").trim(),
		)
		.map((f) => f.label);
}
