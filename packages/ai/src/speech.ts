import OpenAI from "openai";
import { AiError, kindFromStatus } from "./errors";
import type { Metered } from "./types";

export const VOICES = ["alloy", "ash", "coral", "echo", "sage", "shimmer", "verse"] as const;
export type Voice = (typeof VOICES)[number];

export type SpeechRequest = {
	text: string;
	voice: Voice;
	/** Delivery direction, e.g. "upbeat and friendly" (models that support it). */
	style?: string;
	signal?: AbortSignal;
};

export type GeneratedSpeech = Metered & { bytes: Uint8Array; mimeType: "audio/mpeg" };

export interface SpeechModel {
	readonly id: string;
	generate(request: SpeechRequest): Promise<GeneratedSpeech>;
}

/**
 * Speech bills per audio token, which we only know after the fact; ~20 micro-USD per
 * input character is a deliberately high estimate for gpt-4o-mini-tts (roughly
 * $0.015/min of speech), so metering never under-counts.
 */
const MICROS_PER_CHAR = 20;

/** OpenAI text-to-speech — narration for reels. */
export class OpenAiSpeechModel implements SpeechModel {
	readonly id: string;
	private readonly client: OpenAI;

	constructor(private readonly options: { apiKey: string; model: string }) {
		this.id = `openai:${options.model}`;
		this.client = new OpenAI({ apiKey: options.apiKey, maxRetries: 2, timeout: 120_000 });
	}

	async generate(request: SpeechRequest): Promise<GeneratedSpeech> {
		try {
			const response = await this.client.audio.speech.create(
				{
					model: this.options.model,
					voice: request.voice,
					input: request.text.slice(0, 4096),
					instructions: request.style,
					response_format: "mp3",
				},
				{ signal: request.signal },
			);
			return {
				model: this.id,
				usage: { inputTokens: 0, outputTokens: 0 },
				costMicros: request.text.length * MICROS_PER_CHAR,
				bytes: new Uint8Array(await response.arrayBuffer()),
				mimeType: "audio/mpeg",
			};
		} catch (error) {
			if (error instanceof AiError) throw error;
			const status = error instanceof OpenAI.APIError ? error.status : undefined;
			throw new AiError(
				status === undefined ? "transient" : kindFromStatus(status),
				"Voiceover generation failed",
				{ provider: "openai", status },
				{ cause: error },
			);
		}
	}
}
