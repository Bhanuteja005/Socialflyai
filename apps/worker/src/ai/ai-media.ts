import {
	AiError,
	type AiModels,
	buildImagePrompt,
	CAROUSEL_SIZE,
	CAROUSEL_THEMES,
	carouselSlideSchema,
	type GeneratedImage,
	type GeneratedSpeech,
	renderCarousel,
	renderVideo,
	type VideoSceneInput,
	VOICES,
	videoSceneSchema,
} from "@socialfly/ai";
import { newId } from "@socialfly/core/ids";
import type { Logger } from "@socialfly/core/logger";
import { and, type Database, eq, inArray, ne, schema, sql } from "@socialfly/db";
import type { AiMediaJob } from "@socialfly/queue";
import type { S3Client } from "bun";
import { z } from "zod";

const { aiGenerations, brandProfiles, mediaAssets } = schema;

/** The generation kinds this processor owns; text kinds complete synchronously in the API. */
const MEDIA_KINDS = ["image", "carousel", "video"] as const;

/**
 * Paid calls in flight per video. Enough to overlap provider latency, small enough
 * that one 12-scene reel cannot hog the org's provider rate limit.
 */
const VIDEO_PROVIDER_CONCURRENCY = 2;

// The API validated these before inserting the row. They are re-checked here because
// the row is jsonb: a stale job from an older API version must fail cleanly, not crash.
const imageInput = z.object({
	prompt: z.string().trim().min(1),
	aspectRatio: z.enum(["1:1", "4:5", "9:16", "16:9"]),
	style: z.string().trim().optional(),
});
const carouselInput = z.object({
	slides: z.array(carouselSlideSchema).min(1).max(20),
	theme: z.string(),
	footer: z.string().trim().optional(),
});

const videoInput = z.object({
	scenes: z.array(videoSceneSchema).min(1).max(12),
	background: z.enum(["ai", "theme"]),
	sceneMediaIds: z.array(z.string().nullable()).optional(),
	voiceover: z.object({
		enabled: z.boolean(),
		voice: z.enum(VOICES),
		style: z.string().optional(),
	}),
	theme: z.string(),
	footer: z.string().trim().optional(),
});

type Generation = typeof aiGenerations.$inferSelect;

/** One object produced by this attempt, before it has a media_assets row. */
type Produced = {
	id: string;
	storageKey: string;
	fileName: string;
	kind: "image" | "video";
	mimeType: string;
	bytes: Uint8Array;
	width: number;
	height: number;
	durationMs?: number;
	altText: string;
};

type Outcome = {
	files: Produced[];
	model: string;
	inputTokens: number;
	outputTokens: number;
	costMicros: number;
	output: Record<string, unknown>;
};

export type AiMediaDeps = {
	db: Database;
	/** Read on every call (not destructured) so tests can swap the image model. */
	ai: AiModels;
	/** `file` reads the org's own images used as video backgrounds. */
	storage: Pick<S3Client, "write" | "delete" | "file">;
	logger: Logger;
	/** Base URL media is served from; stored in the output so the UI can preview it directly. */
	publicMediaUrl: string;
};

/**
 * Runs AI media generations (images, rendered carousels, short videos) queued by the API.
 *
 * This processor is the ONLY writer of ai_generations.status for media kinds —
 * the same ownership rule as target-state.ts for post_targets.status. The API
 * inserts the row as `pending` and enqueues; everything after that happens here
 * (plus the maintenance timeout sweep for jobs that died).
 *
 * Billing rule: a generation must never be produced or charged twice. The status
 * guard makes duplicate/late jobs no-ops, and cost is accumulated (never
 * overwritten) so an attempt that paid the provider and then failed to store the
 * result is still on the organization's ledger.
 */
export class AiMediaProcessor {
	constructor(private readonly deps: AiMediaDeps) {}

	async process(job: AiMediaJob, attempt: { attemptsMade: number; maxAttempts: number }) {
		const { db, logger } = this.deps;
		const [generation] = await db
			.select()
			.from(aiGenerations)
			.where(
				and(
					eq(aiGenerations.id, job.generationId),
					eq(aiGenerations.organizationId, job.organizationId),
				),
			)
			.limit(1);
		if (!generation) {
			// Deleted with its organization, or a forged/mismatched job: nothing to do, nothing to retry.
			logger.warn({ ...job }, "ai media job for a missing generation");
			return;
		}
		if (!(MEDIA_KINDS as readonly string[]).includes(generation.kind)) {
			logger.error({ ...job, kind: generation.kind }, "ai media job for a non-media generation");
			return;
		}
		if (generation.status === "succeeded" || generation.status === "failed") return;

		// `running` is claimable too: a worker that crashed mid-job leaves it running and
		// BullMQ's retry must be able to pick it up. Two live workers on one generation
		// cannot happen in practice — the job id is the generation id, so BullMQ holds a
		// single lock — and the final conditional UPDATE below settles it if it ever did.
		const [claimed] = await db
			.update(aiGenerations)
			.set({ status: "running" })
			.where(
				and(
					eq(aiGenerations.id, generation.id),
					inArray(aiGenerations.status, ["pending", "running"]),
				),
			)
			.returning({ id: aiGenerations.id });
		if (!claimed) return;

		const startedAt = Date.now();
		let outcome: Outcome | undefined;
		try {
			outcome =
				generation.kind === "image"
					? await this.generateImage(generation)
					: generation.kind === "video"
						? await this.renderVideo(generation)
						: await this.renderCarousel(generation);
			await this.upload(outcome.files);
			await this.succeed(generation, outcome, startedAt);
		} catch (error) {
			// The provider already charged us: record it before failing, or a retry that
			// succeeds would under-report what the organization actually spent.
			if (outcome && outcome.costMicros > 0) await this.bill(generation.id, outcome);
			await this.handleFailure(generation, error, attempt, startedAt);
		}
	}

	private async generateImage(generation: Generation): Promise<Outcome> {
		const input = parseInput(imageInput, generation.input);
		const model = this.deps.ai.images;
		if (!model) throw new AiError("not_configured", "Image generation is not configured");

		const [brand] = await this.deps.db
			.select()
			.from(brandProfiles)
			.where(eq(brandProfiles.organizationId, generation.organizationId))
			.limit(1);
		const prompt = buildImagePrompt(input.prompt, brand ?? null, input.style);

		const image = await model.generate({ prompt, aspectRatio: input.aspectRatio });
		const mediaId = newId();
		const outcome: Outcome = {
			files: [
				{
					id: mediaId,
					storageKey: mediaKey(generation.organizationId, mediaId, "ai-image.png"),
					fileName: "ai-image.png",
					kind: "image",
					mimeType: "image/png",
					bytes: image.bytes,
					width: image.width,
					height: image.height,
					altText: input.prompt.slice(0, 500),
				},
			],
			model: image.model,
			inputTokens: image.usage.inputTokens,
			outputTokens: image.usage.outputTokens,
			costMicros: image.costMicros,
			output: { prompt },
		};
		return outcome;
	}

	private async renderCarousel(generation: Generation): Promise<Outcome> {
		const input = parseInput(carouselInput, generation.input);
		const theme =
			CAROUSEL_THEMES[input.theme] ??
			(CAROUSEL_THEMES.midnight as (typeof CAROUSEL_THEMES)[string]);
		const pngs = await renderCarousel(input.slides, { ...theme, footer: input.footer });
		const files = pngs.map((bytes, i): Produced => {
			const id = newId();
			const fileName = `slide-${i + 1}.png`;
			const slide = input.slides[i];
			return {
				id,
				storageKey: mediaKey(generation.organizationId, id, fileName),
				fileName,
				kind: "image",
				mimeType: "image/png",
				bytes,
				...CAROUSEL_SIZE,
				altText: (slide?.body ? `${slide.heading} — ${slide.body}` : (slide?.heading ?? "")).slice(
					0,
					500,
				),
			};
		});
		// Rendering is local: no provider, no cost — but it is still recorded for the audit trail.
		return { files, model: "renderer", inputTokens: 0, outputTokens: 0, costMicros: 0, output: {} };
	}

	/**
	 * Per scene: background (the org's own image > AI image > theme gradient) and
	 * narration, then one ffmpeg render. Paid calls run first; if any of them or the
	 * render fails, what was already spent is billed before the error propagates.
	 */
	private async renderVideo(generation: Generation): Promise<Outcome> {
		const input = parseInput(videoInput, generation.input);
		const theme =
			CAROUSEL_THEMES[input.theme] ??
			(CAROUSEL_THEMES.midnight as (typeof CAROUSEL_THEMES)[string]);
		const ownMedia = input.sceneMediaIds ?? [];
		const wantsAi = input.background === "ai" && input.scenes.some((_, i) => !ownMedia[i]);
		const wantsVoice = input.voiceover.enabled && input.scenes.some((s) => s.narration.length > 0);
		const images = this.deps.ai.images;
		const speech = this.deps.ai.speech;
		if (wantsAi && !images)
			throw new AiError("not_configured", "Image generation is not configured");
		if (wantsVoice && !speech) throw new AiError("not_configured", "Voiceover is not configured");

		const spent: Outcome = {
			files: [],
			model: "renderer",
			inputTokens: 0,
			outputTokens: 0,
			costMicros: 0,
			output: {},
		};
		const charge = (r: GeneratedImage | GeneratedSpeech) => {
			spent.inputTokens += r.usage.inputTokens;
			spent.outputTokens += r.usage.outputTokens;
			spent.costMicros += r.costMicros;
		};

		try {
			// Library images first: a deleted pick fails fast, before anything is paid for.
			const library = await this.loadSceneImages(generation.organizationId, ownMedia);
			const [brand] = wantsAi
				? await this.deps.db
						.select()
						.from(brandProfiles)
						.where(eq(brandProfiles.organizationId, generation.organizationId))
						.limit(1)
				: [];

			let imageModel: string | undefined;
			// allSettled, not all: if images fail, narration still in flight must finish and be
			// charged before the partial spend is billed below.
			const [bgResult, voiceResult] = await Promise.allSettled([
				mapLimit(input.scenes, VIDEO_PROVIDER_CONCURRENCY, async (scene, i) => {
					const own = library.get(ownMedia[i] ?? "");
					if (own) return own;
					if (input.background !== "ai" || !images) return null;
					const image = await images.generate({
						prompt: buildImagePrompt(scene.visual || scene.caption, brand ?? null),
						aspectRatio: "9:16",
					});
					charge(image);
					imageModel ??= image.model;
					return { bytes: image.bytes, mimeType: image.mimeType };
				}),
				mapLimit(input.scenes, VIDEO_PROVIDER_CONCURRENCY, async (scene) => {
					if (!input.voiceover.enabled || !speech || !scene.narration) return null;
					const voice = await speech.generate({
						text: scene.narration,
						voice: input.voiceover.voice,
						style: input.voiceover.style,
					});
					charge(voice);
					return voice.bytes;
				}),
			]);
			if (imageModel) spent.model = imageModel;
			if (bgResult.status === "rejected") throw bgResult.reason;
			if (voiceResult.status === "rejected") throw voiceResult.reason;
			const backgrounds = bgResult.value;
			const narration = voiceResult.value;

			const scenes: VideoSceneInput[] = input.scenes.map((scene, i) => ({
				caption: scene.caption,
				durationSeconds: scene.durationSeconds,
				background: backgrounds[i] ?? null,
				audio: narration[i] ?? null,
			}));
			const video = await renderVideo(scenes, { ...theme, footer: input.footer });

			const id = newId();
			const fileName = "ai-video.mp4";
			spent.files.push({
				id,
				storageKey: mediaKey(generation.organizationId, id, fileName),
				fileName,
				kind: "video",
				mimeType: video.mimeType,
				bytes: video.bytes,
				width: video.width,
				height: video.height,
				durationMs: video.durationMs,
				altText: (input.scenes[0]?.caption ?? "").slice(0, 500),
			});
			spent.output = { scenes: input.scenes.length, durationMs: video.durationMs };
			return spent;
		} catch (error) {
			// process() only bills an outcome that was returned, so partial spend is recorded here.
			if (spent.costMicros > 0) await this.bill(generation.id, spent);
			throw error;
		}
	}

	/** The org's own images, by media id — scoped to the org like every other media read. */
	private async loadSceneImages(orgId: string, ids: (string | null)[]) {
		const wanted = [...new Set(ids.filter((id): id is string => !!id))];
		const found = new Map<string, { bytes: Uint8Array; mimeType: string }>();
		if (!wanted.length) return found;
		const rows = await this.deps.db
			.select()
			.from(mediaAssets)
			.where(and(eq(mediaAssets.organizationId, orgId), inArray(mediaAssets.id, wanted)));
		for (const id of wanted) {
			const row = rows.find((r) => r.id === id);
			// The API checked these on submit; one deleted since cannot be rendered as asked,
			// and silently swapping in another background would not be what the user approved.
			if (row?.kind !== "image" || row.status !== "ready") {
				throw new AiError(
					"invalid_request",
					"A background image for this video was deleted — pick another and try again",
				);
			}
			const bytes = new Uint8Array(await this.deps.storage.file(row.storageKey).arrayBuffer());
			found.set(id, { bytes, mimeType: row.mimeType });
		}
		return found;
	}

	private async bill(generationId: string, outcome: Outcome) {
		await this.deps.db
			.update(aiGenerations)
			.set({
				model: outcome.model,
				inputTokens: sql`${aiGenerations.inputTokens} + ${outcome.inputTokens}`,
				outputTokens: sql`${aiGenerations.outputTokens} + ${outcome.outputTokens}`,
				costMicros: sql`${aiGenerations.costMicros} + ${outcome.costMicros}`,
			})
			.where(eq(aiGenerations.id, generationId));
	}

	/** Writes every file; on any failure removes what this attempt already wrote. */
	private async upload(files: Produced[]) {
		const written: string[] = [];
		try {
			for (const file of files) {
				await this.deps.storage.write(file.storageKey, file.bytes, { type: file.mimeType });
				written.push(file.storageKey);
			}
		} catch (error) {
			await this.removeObjects(written);
			throw error;
		}
	}

	/** Best effort: an orphaned object costs pennies; masking the real error costs a debugging session. */
	private async removeObjects(keys: string[]) {
		await Promise.allSettled(keys.map((key) => this.deps.storage.delete(key)));
	}

	/**
	 * Media rows and the success mark commit together, so a crash between them can
	 * never leave media without its generation (or the reverse). The status guard
	 * rejects a late duplicate: its rows roll back and its objects are removed.
	 */
	private async succeed(generation: Generation, outcome: Outcome, startedAt: number) {
		const { db, publicMediaUrl } = this.deps;
		const committed = await db
			.transaction(async (tx) => {
				const [row] = await tx
					.update(aiGenerations)
					.set({
						status: "succeeded",
						mediaIds: outcome.files.map((f) => f.id),
						model: outcome.model,
						inputTokens: sql`${aiGenerations.inputTokens} + ${outcome.inputTokens}`,
						outputTokens: sql`${aiGenerations.outputTokens} + ${outcome.outputTokens}`,
						costMicros: sql`${aiGenerations.costMicros} + ${outcome.costMicros}`,
						durationMs: Date.now() - startedAt,
						completedAt: new Date(),
						errorCode: null,
						errorMessage: null,
						output: {
							...outcome.output,
							urls: outcome.files.map((f) => `${publicMediaUrl}/${f.storageKey}`),
						},
					})
					// Not "running" only: if the maintenance sweep timed it out while we were still
					// working, the finished, paid-for result is the truth and should win.
					.where(and(eq(aiGenerations.id, generation.id), ne(aiGenerations.status, "succeeded")))
					.returning({ id: aiGenerations.id });
				if (!row) return false;
				await tx.insert(mediaAssets).values(
					outcome.files.map((f) => ({
						id: f.id,
						organizationId: generation.organizationId,
						uploadedBy: generation.userId,
						storageKey: f.storageKey,
						fileName: f.fileName,
						mimeType: f.mimeType,
						kind: f.kind,
						sizeBytes: f.bytes.byteLength,
						width: f.width,
						height: f.height,
						durationMs: f.durationMs ?? null,
						altText: f.altText,
						status: "ready" as const,
						source: "ai" as const,
					})),
				);
				return true;
			})
			.catch(async (error: unknown) => {
				await this.removeObjects(outcome.files.map((f) => f.storageKey));
				throw error;
			});
		if (!committed) {
			await this.removeObjects(outcome.files.map((f) => f.storageKey));
			this.deps.logger.warn(
				{ generationId: generation.id },
				"generation already succeeded; discarded duplicate output",
			);
			return;
		}
		this.deps.logger.info(
			{
				generationId: generation.id,
				kind: generation.kind,
				files: outcome.files.length,
				costMicros: outcome.costMicros,
			},
			"ai media generated",
		);
	}

	private async handleFailure(
		generation: Generation,
		error: unknown,
		attempt: { attemptsMade: number; maxAttempts: number },
		startedAt: number,
	) {
		const log = { err: error, generationId: generation.id, kind: generation.kind };
		if (error instanceof AiError && !error.retryable) {
			// Refused / invalid / not configured: the same request would fail the same way.
			this.deps.logger.info({ ...log, errorCode: error.kind }, "ai media generation rejected");
			return this.fail(generation, error.kind, error.message, startedAt);
		}
		const lastAttempt = attempt.attemptsMade + 1 >= attempt.maxAttempts;
		if (!lastAttempt) {
			// Stay `running`: the retry re-claims it. The user sees "still working", not a flicker to failed.
			this.deps.logger.warn(log, "ai media generation failed; will retry");
			throw error;
		}
		this.deps.logger.error(log, "ai media generation failed on its last attempt");
		// AiError messages are written for users; anything else may leak internals.
		return error instanceof AiError
			? this.fail(generation, "transient", error.message, startedAt)
			: this.fail(
					generation,
					"internal",
					"Something went wrong generating this. Please try again.",
					startedAt,
				);
	}

	private async fail(
		generation: Generation,
		errorCode: string,
		errorMessage: string,
		startedAt: number,
	) {
		await this.deps.db
			.update(aiGenerations)
			.set({
				status: "failed",
				errorCode,
				errorMessage,
				durationMs: Date.now() - startedAt,
				completedAt: new Date(),
			})
			.where(
				and(
					eq(aiGenerations.id, generation.id),
					inArray(aiGenerations.status, ["pending", "running"]),
				),
			);
	}
}

const mediaKey = (orgId: string, mediaId: string, fileName: string) =>
	`orgs/${orgId}/media/${mediaId}/${fileName}`;

/**
 * Maps with at most `limit` calls in flight, keeping input order. Every started call
 * settles before a failure is rethrown, so calls that did succeed have been charged by
 * the time the caller bills the partial spend.
 */
async function mapLimit<T, R>(
	items: T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	let failure: { error: unknown } | undefined;
	const lane = async () => {
		while (!failure && next < items.length) {
			const i = next++;
			try {
				results[i] = await fn(items[i] as T, i);
			} catch (error) {
				failure ??= { error };
			}
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
	if (failure) throw failure.error;
	return results;
}

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
	const parsed = schema.safeParse(input);
	if (!parsed.success) throw new AiError("invalid_request", "The generation request is invalid");
	return parsed.data;
}
