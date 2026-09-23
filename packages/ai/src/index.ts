import { AnthropicTextModel } from "./anthropic";
import { GeminiImageModel, ImageModelChain, OpenAiImageModel } from "./images";
import { OpenAiSpeechModel, type SpeechModel } from "./speech";
import type { ImageModel, TextModel } from "./types";

export { AnthropicTextModel } from "./anthropic";
export * from "./engagement";
export { AiError, type AiErrorKind, isAiError } from "./errors";
export { ffmpegPath, mediaDurationSeconds, runFfmpeg } from "./ffmpeg";
export { ASPECT_SIZES, GeminiImageModel, ImageModelChain, OpenAiImageModel } from "./images";
export { imageCostMicros, microsToUsd, textCostMicros, usdToMicros } from "./pricing";
export { PLATFORM_GUIDES } from "./prompts";
export {
	CAROUSEL_SIZE,
	CAROUSEL_THEMES,
	type CarouselTheme,
	cropToAspect,
	renderCarousel,
} from "./render";
export {
	type GeneratedSpeech,
	OpenAiSpeechModel,
	type SpeechModel,
	type SpeechRequest,
	VOICES,
	type Voice,
} from "./speech";
export * from "./tasks";
export type * from "./types";
export { type RenderedVideo, renderVideo, VIDEO_SIZE, type VideoSceneInput } from "./video";

export type AiEnv = {
	ANTHROPIC_API_KEY: string;
	AI_TEXT_MODEL: string;
	AI_TEXT_EFFORT: "low" | "medium" | "high" | "xhigh" | "max";
	OPENAI_API_KEY: string;
	OPENAI_IMAGE_MODEL: string;
	GEMINI_API_KEY: string;
	GEMINI_IMAGE_MODEL: string;
	OPENAI_TTS_MODEL: string;
};

export type AiModels = {
	/** Null when no text provider is configured — the feature is hidden, not broken. */
	text: TextModel | null;
	images: ImageModel | null;
	/** Voiceover for videos (OpenAI key). */
	speech: SpeechModel | null;
};

/** Builds the configured models from env. Like the platform registry, missing keys disable, never crash. */
export function createAi(env: AiEnv): AiModels {
	const text = env.ANTHROPIC_API_KEY
		? new AnthropicTextModel({
				apiKey: env.ANTHROPIC_API_KEY,
				model: env.AI_TEXT_MODEL,
				effort: env.AI_TEXT_EFFORT,
			})
		: null;

	const imageModels: ImageModel[] = [];
	if (env.OPENAI_API_KEY)
		imageModels.push(
			new OpenAiImageModel({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_IMAGE_MODEL }),
		);
	if (env.GEMINI_API_KEY)
		imageModels.push(
			new GeminiImageModel({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_IMAGE_MODEL }),
		);
	const images = imageModels.length ? new ImageModelChain(imageModels) : null;

	const speech = env.OPENAI_API_KEY
		? new OpenAiSpeechModel({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_TTS_MODEL })
		: null;

	return { text, images, speech };
}
