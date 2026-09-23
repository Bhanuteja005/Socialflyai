import {
	AiError,
	type AiModels,
	buildImagePrompt,
	CAROUSEL_SIZE,
	CAROUSEL_THEMES,
	carouselSlideSchema,
	renderCarousel,
} from "@socialfly/ai";
import { newId } from "@socialfly/core/ids";
import type { Logger } from "@socialfly/core/logger";
import { and, type Database, eq, inArray, ne, schema, sql } from "@socialfly/db";
import type { AiMediaJob } from "@socialfly/queue";
import type { S3Client } from "bun";
import { z } from "zod";

const { aiGenerations, brandProfiles, mediaAssets } = schema;

/** The generation kinds this processor owns; text kinds complete synchronously in the API. */
const MEDIA_KINDS = ["image", "carousel"] as const;

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

type Generation = typeof aiGenerations.$inferSelect;

/** One object produced by this attempt, before it has a media_assets row. */
type Produced = {
	id: string;
	storageKey: string;
	fileName: string;
	bytes: Uint8Array;
	width: number;
	height: number;
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
	storage: Pick<S3Client, "write" | "delete">;
	logger: Logger;
	/** Base URL media is served from; stored in the output so the UI can preview it directly. */
	publicMediaUrl: string;
};

/**
 * Runs AI media generations (images, rendered carousels) queued by the API.
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
				await this.deps.storage.write(file.storageKey, file.bytes, { type: "image/png" });
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
						mimeType: "image/png",
						kind: "image" as const,
						sizeBytes: f.bytes.byteLength,
						width: f.width,
						height: f.height,
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

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
	const parsed = schema.safeParse(input);
	if (!parsed.success) throw new AiError("invalid_request", "The generation request is invalid");
	return parsed.data;
}
