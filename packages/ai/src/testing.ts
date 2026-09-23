import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AiError } from "./errors";
import { runFfmpeg } from "./ffmpeg";
import { ASPECT_SIZES } from "./images";
import { cropToAspect } from "./render";
import type { GeneratedSpeech, SpeechModel, SpeechRequest } from "./speech";
import type {
	GeneratedImage,
	ImageModel,
	ImageRequest,
	TextModel,
	TextRequest,
	TextResult,
} from "./types";

/**
 * Deterministic stand-ins for the real providers, for the api and worker test
 * suites: no network, no keys, no cost. Queue a response per call; every request
 * is recorded so tests can assert on the prompt that would have been sent.
 */
export class FakeTextModel implements TextModel {
	readonly id = "fake:text";
	readonly requests: TextRequest<unknown>[] = [];
	private readonly queue: (unknown | Error)[] = [];

	/** Next call returns this output (validated against the caller's schema) or throws it. */
	reply(output: unknown | Error) {
		this.queue.push(output);
		return this;
	}

	async generate<T>(request: TextRequest<T>): Promise<TextResult<T>> {
		this.requests.push(request as TextRequest<unknown>);
		const next = this.queue.shift();
		if (next === undefined) throw new Error("FakeTextModel: no reply queued");
		if (next instanceof Error) throw next;
		const parsed = request.schema.safeParse(next);
		if (!parsed.success) throw new AiError("invalid_output", "fake reply did not match schema");
		return {
			model: this.id,
			usage: { inputTokens: 1000, outputTokens: 500 },
			costMicros: 17_500,
			output: parsed.data,
		};
	}
}

/** A 1×1 PNG, scaled up to the requested ratio so dimensions are realistic. */
const PIXEL = Uint8Array.from(
	Buffer.from(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
		"base64",
	),
);

export class FakeImageModel implements ImageModel {
	readonly id = "fake:image";
	readonly requests: ImageRequest[] = [];
	private readonly failures: Error[] = [];

	failNext(error: Error) {
		this.failures.push(error);
		return this;
	}

	async generate(request: ImageRequest): Promise<GeneratedImage> {
		this.requests.push(request);
		const failure = this.failures.shift();
		if (failure) throw failure;
		const size = ASPECT_SIZES[request.aspectRatio];
		return {
			model: this.id,
			usage: { inputTokens: 50, outputTokens: 0 },
			costMicros: 40_000,
			bytes: await cropToAspect(PIXEL, "image/png", size.width, size.height),
			mimeType: "image/png",
			...size,
		};
	}
}

/**
 * Real MP3 audio (a quiet tone) whose length follows the text — ~15 characters per
 * second like natural speech — so video tests exercise the narration-driven timing.
 */
export class FakeSpeechModel implements SpeechModel {
	readonly id = "fake:speech";
	readonly requests: SpeechRequest[] = [];

	async generate(request: SpeechRequest): Promise<GeneratedSpeech> {
		this.requests.push(request);
		const seconds = Math.max(0.5, request.text.length / 15).toFixed(2);
		const dir = await mkdtemp(join(tmpdir(), "sf-speech-"));
		try {
			const file = join(dir, "voice.mp3");
			await runFfmpeg([
				"-f",
				"lavfi",
				"-i",
				`sine=frequency=330:duration=${seconds}`,
				"-af",
				"volume=0.1",
				"-c:a",
				"libmp3lame",
				file,
			]);
			return {
				model: this.id,
				usage: { inputTokens: 0, outputTokens: 0 },
				costMicros: request.text.length * 20,
				bytes: new Uint8Array(await Bun.file(file).arrayBuffer()),
				mimeType: "audio/mpeg",
			};
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	}
}
