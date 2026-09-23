import { CAROUSEL_THEMES, carouselSlideSchema } from "@socialfly/ai";
import { z } from "zod";

// The text-task bodies are the task input schemas from @socialfly/ai, re-exported so the
// route and the model call validate against the same rules and can never drift apart.
export {
	carouselOutlineInput,
	generatePostsInput,
	hashtagsInput,
	rewriteInput,
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

export const GENERATION_KINDS = [
	"post",
	"rewrite",
	"hashtags",
	"carousel_outline",
	"image",
	"carousel",
] as const;

export const listGenerationsQuery = z.object({
	kind: z.enum(GENERATION_KINDS).optional(),
	before: z.uuid().optional(),
	limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const generationIdParam = z.object({ id: z.uuid() });
