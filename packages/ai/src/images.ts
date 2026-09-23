import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { AiError, kindFromStatus } from "./errors";
import { imageCostMicros } from "./pricing";
import { cropToAspect } from "./render";
import type { AspectRatio, GeneratedImage, ImageModel, ImageRequest } from "./types";

/** Final pixel sizes per aspect ratio — what the platforms expect (IG portrait is 4:5). */
export const ASPECT_SIZES: Record<AspectRatio, { width: number; height: number }> = {
	"1:1": { width: 1080, height: 1080 },
	"4:5": { width: 1080, height: 1350 },
	"9:16": { width: 1080, height: 1920 },
	"16:9": { width: 1920, height: 1080 },
};

/**
 * OpenAI image generation (gpt-image-*). It only renders 1:1, 2:3 and 3:2, so the
 * closest shape is generated and centre-cropped to the exact ratio — a 2:3 image
 * posted as-is would be rejected by Instagram's feed (4:5 is its tallest).
 */
export class OpenAiImageModel implements ImageModel {
	readonly id: string;
	private readonly client: OpenAI;

	constructor(private readonly options: { apiKey: string; model: string }) {
		this.id = `openai:${options.model}`;
		this.client = new OpenAI({ apiKey: options.apiKey, maxRetries: 1, timeout: 180_000 });
	}

	async generate(request: ImageRequest): Promise<GeneratedImage> {
		const size =
			request.aspectRatio === "1:1"
				? "1024x1024"
				: request.aspectRatio === "16:9"
					? "1536x1024"
					: "1024x1536";
		let response: OpenAI.ImagesResponse;
		try {
			response = await this.client.images.generate(
				{
					model: this.options.model,
					prompt: request.prompt,
					size,
					quality: "medium",
					n: 1,
					output_format: "png",
				},
				{ signal: request.signal },
			);
		} catch (error) {
			throw toAiError("openai", error, OpenAI.APIError);
		}
		const b64 = response.data?.[0]?.b64_json;
		if (!b64)
			throw new AiError("invalid_output", "The image provider returned no image", {
				provider: "openai",
			});

		const usage = {
			inputTokens: response.usage?.input_tokens ?? 0,
			outputTokens: response.usage?.output_tokens ?? 0,
		};
		const target = ASPECT_SIZES[request.aspectRatio];
		return {
			model: this.id,
			usage,
			costMicros: imageCostMicros(this.id, usage),
			bytes: await cropToAspect(
				Buffer.from(b64, "base64"),
				"image/png",
				target.width,
				target.height,
			),
			mimeType: "image/png",
			...target,
		};
	}
}

/** Gemini native image generation. Supports every ratio we need directly. */
export class GeminiImageModel implements ImageModel {
	readonly id: string;
	private readonly client: GoogleGenAI;

	constructor(private readonly options: { apiKey: string; model: string }) {
		this.id = `gemini:${options.model}`;
		this.client = new GoogleGenAI({ apiKey: options.apiKey });
	}

	async generate(request: ImageRequest): Promise<GeneratedImage> {
		let response: Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>;
		try {
			response = await this.client.models.generateContent({
				model: this.options.model,
				contents: request.prompt,
				config: {
					responseModalities: ["IMAGE"],
					imageConfig: { aspectRatio: request.aspectRatio },
					abortSignal: request.signal,
				},
			});
		} catch (error) {
			throw toAiError("gemini", error, Error);
		}
		const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
		if (!part?.inlineData?.data) {
			const blocked =
				response.promptFeedback?.blockReason || response.candidates?.[0]?.finishReason === "SAFETY";
			throw new AiError(
				blocked ? "refused" : "invalid_output",
				blocked
					? "The image request was declined by the provider's safety filters"
					: "No image was returned",
				{ provider: "gemini" },
			);
		}
		const mimeType = (part.inlineData.mimeType ?? "image/png") as GeneratedImage["mimeType"];
		const usage = {
			inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
			outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
		};
		const target = ASPECT_SIZES[request.aspectRatio];
		return {
			model: this.id,
			usage,
			costMicros: imageCostMicros(this.id, usage),
			// Normalise to exact platform dimensions (and PNG) whatever size came back.
			bytes: await cropToAspect(
				Buffer.from(part.inlineData.data, "base64"),
				mimeType,
				target.width,
				target.height,
			),
			mimeType: "image/png",
			...target,
		};
	}
}

/**
 * Tries each configured image model in order. A provider outage or rate limit
 * falls through to the next; a safety refusal or invalid prompt does not — the
 * next provider would most likely refuse too, and the user should rephrase.
 */
export class ImageModelChain implements ImageModel {
	readonly id: string;

	constructor(private readonly models: ImageModel[]) {
		if (models.length === 0) throw new Error("ImageModelChain needs at least one model");
		this.id = models.map((m) => m.id).join(",");
	}

	async generate(request: ImageRequest): Promise<GeneratedImage> {
		let last: unknown;
		for (const model of this.models) {
			try {
				return await model.generate(request);
			} catch (error) {
				last = error;
				if (
					error instanceof AiError &&
					(error.kind === "refused" || error.kind === "invalid_request")
				)
					throw error;
			}
		}
		throw last;
	}
}

function toAiError(
	provider: string,
	error: unknown,
	apiErrorClass: abstract new (...args: never[]) => Error,
) {
	if (error instanceof AiError) return error;
	const status =
		error instanceof apiErrorClass || typeof (error as { status?: unknown })?.status === "number"
			? (error as { status?: number }).status
			: undefined;
	// OpenAI returns 400 with code "moderation_blocked" for unsafe prompts.
	const code = (error as { code?: string } | null)?.code;
	if (code === "moderation_blocked" || code === "content_policy_violation") {
		return new AiError(
			"refused",
			"The image request was declined by the provider's safety filters",
			{ provider, status },
			{ cause: error },
		);
	}
	return new AiError(
		status === undefined ? "transient" : kindFromStatus(status),
		status === 429 ? "The image provider is busy — try again shortly" : "Image generation failed",
		{ provider, status },
		{ cause: error },
	);
}
