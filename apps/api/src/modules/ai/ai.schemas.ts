import { CAROUSEL_THEMES, carouselSlideSchema, VOICES, videoSceneSchema } from "@socialfly/ai";
import { schema } from "@socialfly/db";
import { z } from "zod";

// The text-task bodies are the task input schemas from @socialfly/ai, re-exported so the
// route and the model call validate against the same rules and can never drift apart.
export {
	carouselOutlineInput,
	generatePostsInput,
	hashtagsInput,
	rewriteInput,
	videoScriptInput,
} from "@socialfly/ai";

/** Trimmed, bounded free text that may be empty (brand fields are all optional in practice). */
const text = (max: number) => z.string().trim().max(max).default("");
const tagList = z.array(z.string().trim().min(1).max(60)).max(30).default([]);

export const brandProfileBody = z.object({
	brandName: text(100),
	description: text(1000),
	audience: text(1000),
	voice: text(1000),
	website: z.url().max(500).nullable().optional(),
	keywords: tagList,
	avoid: tagList,
	examplePosts: z.array(z.string().trim().min(1).max(3000)).max(5).default([]),
});
export type BrandProfileInput = z.infer<typeof brandProfileBody>;

export const ASPECT_RATIOS = ["1:1", "4:5", "9:16", "16:9"] as const;

export const imageBody = z.object({
	prompt: z.string().trim().min(3).max(2000),
	aspectRatio: z.enum(ASPECT_RATIOS).default("1:1"),
	style: z.string().trim().max(100).optional(),
});
export type ImageInput = z.infer<typeof imageBody>;

const THEMES = Object.keys(CAROUSEL_THEMES) as [string, ...string[]];

export const carouselBody = z.object({
	slides: z.array(carouselSlideSchema).min(2).max(10),
	theme: z.enum(THEMES).default("midnight"),
	/** Small text on every slide, e.g. the brand or @handle. */
	footer: z.string().trim().max(60).optional(),
});
export type CarouselInput = z.infer<typeof carouselBody>;

/** Longest reel we render: Reels/Shorts sweet spot, and a bound on worker time and cost. */
export const MAX_VIDEO_SECONDS = 120;

export const videoBody = z
	.object({
		scenes: z.array(videoSceneSchema).min(1).max(12),
		/** "ai": one generated image per scene from its `visual`; "theme": gradient backgrounds. */
		background: z.enum(["ai", "theme"]).default("theme"),
		/**
		 * Optional per-scene background from the org's own library (index-aligned with
		 * `scenes`; null = use `background`). Wins over "ai" for that scene, so a user
		 * can mix their own photos with generated ones and pay only for the rest.
		 */
		sceneMediaIds: z.array(z.uuid().nullable()).max(12).optional(),
		voiceover: z
			.object({
				enabled: z.boolean().default(false),
				voice: z.enum(VOICES).default("alloy"),
				/** Delivery direction for the voice, e.g. "upbeat and friendly". */
				style: z.string().trim().max(200).optional(),
			})
			.default({ enabled: false, voice: "alloy" }),
		theme: z.enum(THEMES).default("midnight"),
		footer: z.string().trim().max(60).optional(),
	})
	.superRefine((body, ctx) => {
		if (body.sceneMediaIds && body.sceneMediaIds.length > body.scenes.length) {
			ctx.addIssue({
				code: "custom",
				path: ["sceneMediaIds"],
				message: "There are more scene backgrounds than scenes",
			});
		}
		// Planned length only: narration can stretch a scene at render time, which the
		// per-scene narration cap (400 chars ≈ 27 s) keeps bounded.
		const total = body.scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
		if (total > MAX_VIDEO_SECONDS) {
			ctx.addIssue({
				code: "custom",
				path: ["scenes"],
				message: `A video can be at most ${MAX_VIDEO_SECONDS} seconds long`,
			});
		}
	});
export type VideoInput = z.output<typeof videoBody>;

// Straight from the database enum, so a new kind can never be missing from the API filters.
export const GENERATION_KINDS = schema.aiGenerationKind.enumValues;

export const listGenerationsQuery = z.object({
	kind: z.enum(GENERATION_KINDS).optional(),
	before: z.uuid().optional(),
	limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const generationIdParam = z.object({ id: z.uuid() });
