import { z } from "zod";
import { brandSection, PLATFORM_GUIDES, platformSection, SYSTEM_PROMPT, userText } from "./prompts";
import type { BrandContext, Platform, TextModel, TextResult } from "./types";

/**
 * The content tasks SocialFly offers. Each is one structured call: a schema for
 * the output, a prompt built from the brand + request, and post-processing that
 * enforces hard limits the model might miss (character counts, hashtag format).
 */

const PLATFORMS = Object.keys(PLATFORM_GUIDES) as [Platform, ...Platform[]];
export const platformSchema = z.enum(PLATFORMS);

/** Normalises "#Tag", "tag", "# tag" → "#tag"-style tokens without spaces; drops junk. */
export function normalizeHashtags(tags: string[], max: number): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of tags) {
		const body = raw.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "");
		if (!body || /^\d+$/.test(body)) continue;
		const key = body.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(`#${body}`);
		if (out.length >= max) break;
	}
	return out;
}

// ── Post generation ─────────────────────────────────────────────────────────

export const generatePostsInput = z.object({
	brief: z.string().trim().min(3).max(4000),
	platforms: z.array(platformSchema).min(1).max(8),
	/** Distinct angles to choose from. */
	variants: z.number().int().min(1).max(3).default(2),
	tone: z.string().trim().max(100).optional(),
	/** A URL the post should point to (the model is told not to invent one). */
	link: z.url().optional(),
	includeHashtags: z.boolean().default(true),
	includeEmojis: z.boolean().default(false),
	language: z.string().trim().max(40).default("English"),
});
export type GeneratePostsInput = z.input<typeof generatePostsInput>;

const draftSchema = z.object({
	platform: z.string(),
	text: z.string(),
	hashtags: z.array(z.string()),
});
const postsOutputSchema = z.object({
	variants: z.array(z.object({ angle: z.string(), drafts: z.array(draftSchema) })),
});

export type PostDraft = { platform: Platform; text: string; hashtags: string[] };
export type PostVariant = { angle: string; drafts: PostDraft[] };

export async function generatePosts(
	model: TextModel,
	brand: BrandContext | null,
	rawInput: GeneratePostsInput,
): Promise<TextResult<{ variants: PostVariant[] }>> {
	const input = generatePostsInput.parse(rawInput);
	const prompt = [
		brandSection(brand),
		platformSection(input.platforms),
		userText("brief", input.brief),
		`Write ${input.variants} distinct variant(s), each taking a different angle on the brief (for example: a story, a practical tip list, a bold opinion). Give each angle a short label.`,
		`In every variant, write one draft per platform: ${input.platforms.join(", ")}. Adapt each draft to its platform's guidance — do not paste the same text everywhere.`,
		`Write in ${input.language}.`,
		input.tone ? `Tone: ${input.tone}.` : "",
		input.link
			? `Include this link exactly once where it fits naturally: ${input.link}`
			: "Do not include any links.",
		input.includeHashtags
			? "Put hashtags ONLY in the hashtags array (without them in text), following each platform's hashtag range."
			: "Return an empty hashtags array for every draft.",
		input.includeEmojis ? "Emojis are welcome where they fit the platform." : "Do not use emojis.",
		"Each draft's text PLUS its hashtags (joined with spaces, after a blank line) must fit the platform's max_characters.",
	]
		.filter(Boolean)
		.join("\n\n");

	const result = await model.generate({
		system: SYSTEM_PROMPT,
		prompt,
		schema: postsOutputSchema,
	});

	const variants = result.output.variants.slice(0, input.variants).map((v) => ({
		angle: v.angle.trim(),
		drafts: input.platforms.flatMap((platform) => {
			const d = v.drafts.find((x) => x.platform === platform);
			if (!d) return [];
			const [, maxTags] = PLATFORM_GUIDES[platform].hashtags;
			const hashtags = input.includeHashtags ? normalizeHashtags(d.hashtags, maxTags) : [];
			return [
				{
					platform,
					text: fitText(d.text.trim(), hashtags, PLATFORM_GUIDES[platform].maxChars),
					hashtags,
				},
			];
		}),
	}));
	return { ...result, output: { variants } };
}

/**
 * Last line of defence for length: the model is told the limit, but a post that is
 * one character over cannot be published at all. Trims at a sentence or word
 * boundary rather than mid-word.
 */
export function fitText(text: string, hashtags: string[], maxChars: number): string {
	const tagLength = hashtags.length ? hashtags.join(" ").length + 2 : 0;
	const budget = maxChars - tagLength;
	if ([...text].length <= budget) return text;
	const chars = [...text].slice(0, Math.max(0, budget - 1)).join("");
	const cut = Math.max(chars.lastIndexOf(". "), chars.lastIndexOf("\n"));
	const trimmed = cut > budget * 0.6 ? chars.slice(0, cut + 1) : chars.replace(/\s+\S*$/, "");
	return `${trimmed.trimEnd()}…`;
}

/** Joins a draft for the composer: text, blank line, hashtags. */
export const composeDraft = (d: PostDraft) =>
	d.hashtags.length ? `${d.text}\n\n${d.hashtags.join(" ")}` : d.text;

// ── Rewrite ─────────────────────────────────────────────────────────────────

export const REWRITE_ACTIONS = {
	shorter: "Make it noticeably shorter while keeping the core message.",
	longer: "Expand it with more concrete detail or an example, without padding.",
	professional: "Make the tone more professional and polished.",
	casual: "Make the tone more casual and conversational.",
	punchier: "Make it punchier: a stronger hook, shorter sentences, active verbs.",
	fix_grammar: "Fix spelling, grammar and punctuation only. Change nothing else.",
	add_emojis: "Add a few relevant emojis where they help. Change nothing else.",
	remove_emojis: "Remove all emojis. Change nothing else.",
	custom: "",
} as const;

export const rewriteInput = z
	.object({
		text: z.string().trim().min(1).max(10_000),
		action: z.enum(Object.keys(REWRITE_ACTIONS) as [keyof typeof REWRITE_ACTIONS]),
		/** Required when action is "custom", e.g. "mention our free trial". */
		instruction: z.string().trim().max(500).optional(),
		platform: platformSchema.optional(),
	})
	.refine((v) => v.action !== "custom" || !!v.instruction, {
		message: "instruction is required for a custom rewrite",
		path: ["instruction"],
	});
export type RewriteInput = z.input<typeof rewriteInput>;

export async function rewrite(
	model: TextModel,
	brand: BrandContext | null,
	rawInput: RewriteInput,
) {
	const input = rewriteInput.parse(rawInput);
	const instruction =
		input.action === "custom" ? (input.instruction ?? "") : REWRITE_ACTIONS[input.action];
	const prompt = [
		brandSection(brand),
		input.platform ? platformSection([input.platform]) : "",
		userText("draft", input.text),
		userText("instruction", instruction),
		"Rewrite the draft following the instruction. Keep the same language as the draft. Keep any hashtags and links unless the instruction says otherwise.",
	]
		.filter(Boolean)
		.join("\n\n");
	const result = await model.generate({
		system: SYSTEM_PROMPT,
		prompt,
		schema: z.object({ text: z.string() }),
	});
	const text = input.platform
		? fitText(result.output.text.trim(), [], PLATFORM_GUIDES[input.platform].maxChars)
		: result.output.text.trim();
	return { ...result, output: { text } };
}

// ── Hashtags ────────────────────────────────────────────────────────────────

export const hashtagsInput = z.object({
	text: z.string().trim().min(3).max(10_000),
	platform: platformSchema.optional(),
	count: z.number().int().min(1).max(30).default(8),
});
export type HashtagsInput = z.input<typeof hashtagsInput>;

export async function suggestHashtags(
	model: TextModel,
	brand: BrandContext | null,
	rawInput: HashtagsInput,
) {
	const input = hashtagsInput.parse(rawInput);
	const prompt = [
		brandSection(brand),
		input.platform ? platformSection([input.platform]) : "",
		userText("post", input.text),
		`Suggest ${input.count} hashtags for this post: a mix of broad and niche tags that real people follow on ${input.platform ? PLATFORM_GUIDES[input.platform].name : "social media"}. No spaces inside a tag. Order from most to least relevant.`,
	]
		.filter(Boolean)
		.join("\n\n");
	const result = await model.generate({
		system: SYSTEM_PROMPT,
		prompt,
		schema: z.object({ hashtags: z.array(z.string()) }),
	});
	return {
		...result,
		output: { hashtags: normalizeHashtags(result.output.hashtags, input.count) },
	};
}

// ── Carousel outline ────────────────────────────────────────────────────────

export const carouselOutlineInput = z.object({
	topic: z.string().trim().min(3).max(2000),
	slideCount: z.number().int().min(3).max(10).default(6),
	platform: platformSchema.default("linkedin"),
	language: z.string().trim().max(40).default("English"),
});
export type CarouselOutlineInput = z.input<typeof carouselOutlineInput>;

export const carouselSlideSchema = z.object({
	heading: z.string().trim().min(1).max(80),
	body: z.string().trim().max(280).default(""),
});
export type CarouselSlide = z.infer<typeof carouselSlideSchema>;

export async function carouselOutline(
	model: TextModel,
	brand: BrandContext | null,
	rawInput: CarouselOutlineInput,
) {
	const input = carouselOutlineInput.parse(rawInput);
	const prompt = [
		brandSection(brand),
		platformSection([input.platform]),
		userText("topic", input.topic),
		`Plan a ${input.slideCount}-slide carousel on this topic in ${input.language}.`,
		"Slide 1 is the cover: a heading that makes people swipe (under 60 characters) and an optional one-line subtitle as its body. Middle slides: one idea each — a heading under 60 characters and a body under 220 characters. The last slide is a call to action (follow, save, visit).",
		"Also write the caption to post with the carousel, following the platform guidance, and suggest hashtags separately.",
	]
		.filter(Boolean)
		.join("\n\n");
	const result = await model.generate({
		system: SYSTEM_PROMPT,
		prompt,
		schema: z.object({
			slides: z.array(z.object({ heading: z.string(), body: z.string() })),
			caption: z.string(),
			hashtags: z.array(z.string()),
		}),
	});
	const [, maxTags] = PLATFORM_GUIDES[input.platform].hashtags;
	const hashtags = normalizeHashtags(result.output.hashtags, maxTags);
	return {
		...result,
		output: {
			slides: result.output.slides.slice(0, input.slideCount).map((s) => ({
				heading: s.heading.trim().slice(0, 80),
				body: s.body.trim().slice(0, 280),
			})),
			caption: fitText(
				result.output.caption.trim(),
				hashtags,
				PLATFORM_GUIDES[input.platform].maxChars,
			),
			hashtags,
		},
	};
}

// ── Image prompt ────────────────────────────────────────────────────────────

/** Adds brand context to a user's image prompt. No LLM call: cheap and predictable. */
export function buildImagePrompt(prompt: string, brand: BrandContext | null, style?: string) {
	const parts = [prompt.trim()];
	if (style) parts.push(`Style: ${style}.`);
	if (brand?.brandName || brand?.description) {
		parts.push(
			`For a social media post by ${brand.brandName || "a business"}${brand.description ? ` (${brand.description.slice(0, 200)})` : ""}.`,
		);
	}
	parts.push(
		"No text, letters, logos or watermarks in the image unless explicitly requested above.",
	);
	return parts.join(" ");
}

// ── Short video script ──────────────────────────────────────────────────────

export const videoScriptInput = z.object({
	topic: z.string().trim().min(3).max(2000),
	/** Target length; the render stretches scenes to fit narration. */
	durationSeconds: z.number().int().min(10).max(90).default(30),
	platform: platformSchema.default("instagram"),
	language: z.string().trim().max(40).default("English"),
	/** Write narration lines (spoken) in addition to on-screen captions. */
	voiceover: z.boolean().default(true),
});
export type VideoScriptInput = z.input<typeof videoScriptInput>;

export const videoSceneSchema = z.object({
	/** On screen, big and bold: keep it short. */
	caption: z.string().trim().min(1).max(90),
	/** Spoken over the scene. Empty when there is no voiceover. */
	narration: z.string().trim().max(400).default(""),
	/** Image prompt for the scene's background. */
	visual: z.string().trim().max(500).default(""),
	durationSeconds: z.number().min(2).max(15).default(4),
});
export type VideoScene = z.infer<typeof videoSceneSchema>;

export async function videoScript(
	model: TextModel,
	brand: BrandContext | null,
	rawInput: VideoScriptInput,
) {
	const input = videoScriptInput.parse(rawInput);
	const sceneCount = Math.max(3, Math.min(12, Math.round(input.durationSeconds / 4)));
	const prompt = [
		brandSection(brand),
		platformSection([input.platform]),
		userText("topic", input.topic),
		`Write a ${input.durationSeconds}-second vertical short video (Reels / Shorts style) in ${input.language}, as ${sceneCount} scenes.`,
		"Scene 1 is the hook: it must stop the scroll in under 2 seconds. The last scene is a call to action.",
		"For each scene give: caption — the on-screen text, under 60 characters, readable in one glance; " +
			(input.voiceover
				? "narration — what the voiceover says, natural spoken language, about 2.5 words per second of the scene; "
				: "narration — an empty string (no voiceover); ") +
			"visual — a concrete photographic description of the background image (subject, setting, lighting), with no text, logos or people's faces in close-up; " +
			"durationSeconds — how long the scene stays on screen.",
		`Scene durations must add up to about ${input.durationSeconds} seconds.`,
		"Also write the post caption to publish with the video, following the platform guidance, and suggest hashtags separately.",
	]
		.filter(Boolean)
		.join("\n\n");

	const result = await model.generate({
		system: SYSTEM_PROMPT,
		prompt,
		schema: z.object({
			title: z.string(),
			scenes: z.array(
				z.object({
					caption: z.string(),
					narration: z.string(),
					visual: z.string(),
					durationSeconds: z.number(),
				}),
			),
			caption: z.string(),
			hashtags: z.array(z.string()),
		}),
	});

	const [, maxTags] = PLATFORM_GUIDES[input.platform].hashtags;
	const hashtags = normalizeHashtags(result.output.hashtags, maxTags);
	const scenes: VideoScene[] = result.output.scenes.slice(0, 12).map((s) => ({
		caption: s.caption.trim().slice(0, 90),
		narration: input.voiceover ? s.narration.trim().slice(0, 400) : "",
		visual: s.visual.trim().slice(0, 500),
		durationSeconds: Math.min(
			15,
			Math.max(2, Number.isFinite(s.durationSeconds) ? s.durationSeconds : 4),
		),
	}));
	return {
		...result,
		output: {
			title: result.output.title.trim().slice(0, 120),
			scenes,
			caption: fitText(
				result.output.caption.trim(),
				hashtags,
				PLATFORM_GUIDES[input.platform].maxChars,
			),
			hashtags,
		},
	};
}
