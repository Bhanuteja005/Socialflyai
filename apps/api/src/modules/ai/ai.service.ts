import {
	type AiModels,
	type BrandContext,
	carouselOutline,
	generatePosts,
	isAiError,
	microsToUsd,
	rewrite,
	suggestHashtags,
	type TextModel,
	type TextResult,
	usdToMicros,
	videoScript,
	type videoScriptInput,
} from "@socialfly/ai";
import { AppError, notFound } from "@socialfly/core/errors";
import { and, type Database, desc, eq, inArray, lt, schema, sql } from "@socialfly/db";
import type { JobProducer } from "@socialfly/queue";
import type { z } from "zod";
import { toMediaDto } from "#src/modules/media/media.service.ts";
import { budgetPeriodStart, effectiveBudgetUsd } from "./ai.budget.ts";
import type {
	BrandProfileInput,
	CarouselInput,
	carouselOutlineInput,
	GENERATION_KINDS,
	generatePostsInput,
	hashtagsInput,
	ImageInput,
	rewriteInput,
	VideoInput,
} from "./ai.schemas.ts";

const { aiGenerations, brandProfiles, mediaAssets, organizations } = schema;

type GenerationRow = typeof aiGenerations.$inferSelect;
type BrandRow = typeof brandProfiles.$inferSelect;
type MediaRow = typeof mediaAssets.$inferSelect;
type GenerationKind = (typeof GENERATION_KINDS)[number];

const notConfigured = (what: string) =>
	new AppError(503, "ai_not_configured", `AI ${what} generation is not set up on this server`);

/**
 * Translates the provider-neutral failure kind into an HTTP answer. Keyed on `kind`,
 * never on message text: providers reword messages freely.
 */
function toAppError(error: unknown): unknown {
	if (!isAiError(error)) return error;
	switch (error.kind) {
		case "not_configured":
			return new AppError(
				503,
				"ai_not_configured",
				"AI generation is not available right now",
				undefined,
				{
					cause: error,
				},
			);
		case "refused":
			return new AppError(
				422,
				"ai_refused",
				"The AI declined this request — try rephrasing it",
				undefined,
				{
					cause: error,
				},
			);
		case "invalid_request":
			return new AppError(400, "ai_invalid_request", error.message, undefined, { cause: error });
		case "invalid_output":
			return new AppError(
				502,
				"ai_invalid_output",
				"The AI returned an unusable answer — please try again",
				undefined,
				{
					cause: error,
				},
			);
		case "rate_limited":
			return new AppError(
				429,
				"ai_rate_limited",
				"The AI provider is busy — please try again shortly",
				{ retryAfterSeconds: error.details.retryAfterSeconds },
				{ cause: error },
			);
		case "transient":
			return new AppError(
				502,
				"ai_unavailable",
				"The AI provider is unavailable — please try again",
				undefined,
				{
					cause: error,
				},
			);
	}
}

const toBrandDto = (orgId: string, row: BrandRow | undefined) => ({
	organizationId: orgId,
	brandName: row?.brandName ?? "",
	description: row?.description ?? "",
	audience: row?.audience ?? "",
	voice: row?.voice ?? "",
	website: row?.website ?? null,
	keywords: row?.keywords ?? [],
	avoid: row?.avoid ?? [],
	examplePosts: row?.examplePosts ?? [],
	updatedAt: row?.updatedAt.toISOString() ?? null,
});

const toGenerationDto = (g: GenerationRow, media: MediaRow[]) => ({
	id: g.id,
	kind: g.kind,
	status: g.status,
	model: g.model,
	input: g.input,
	output: g.output,
	media: media.map(toMediaDto),
	error: g.errorCode ? { code: g.errorCode, message: g.errorMessage ?? "" } : null,
	costUsd: microsToUsd(g.costMicros),
	createdAt: g.createdAt.toISOString(),
	completedAt: g.completedAt?.toISOString() ?? null,
});

export class AiService {
	/**
	 * `ai` is held by reference and its models are read on every call (never captured
	 * here), so a key rotation or a test swapping in a fake takes effect immediately.
	 */
	constructor(
		private readonly db: Database,
		private readonly ai: AiModels,
		private readonly jobs: JobProducer,
	) {}

	// ── capabilities & budget ───────────────────────────────────────────────────

	async capabilities(orgId: string) {
		return {
			text: this.ai.text !== null,
			images: this.ai.images !== null,
			// Carousels are rendered locally (no provider), so they are always available.
			carousels: true as const,
			// Also rendered locally; AI backgrounds and voiceover are gated by `images`/`voiceover`.
			videos: true as const,
			voiceover: this.ai.speech !== null,
			budget: (await this.budget(orgId)).summary,
		};
	}

	private async budget(orgId: string) {
		const start = budgetPeriodStart();
		// One round trip: the override lives on the org row, the spend is summed from the ledger.
		const [row] = await this.db
			.select({
				override: organizations.aiMonthlyBudgetUsd,
				// Written out qualified: drizzle leaves columns unqualified in single-table queries,
				// and an unqualified "id" inside the subquery would bind to ai_generations.id.
				used: sql<string>`(select coalesce(sum(g.cost_micros), 0) from ai_generations g where g.organization_id = organizations.id and g.created_at >= ${start.toISOString()})`,
			})
			.from(organizations)
			.where(eq(organizations.id, orgId))
			.limit(1);
		const usedMicros = Number(row?.used ?? 0);
		const limitUsd = effectiveBudgetUsd(row?.override ?? null);
		const usedUsd = microsToUsd(usedMicros);
		return {
			summary: {
				limitUsd,
				usedUsd,
				remainingUsd:
					limitUsd === null ? null : microsToUsd(Math.max(0, usdToMicros(limitUsd) - usedMicros)),
				periodStart: start.toISOString(),
			},
			exceeded: limitUsd !== null && usedMicros >= usdToMicros(limitUsd),
		};
	}

	/**
	 * Checked before every paid call. A single call can still overshoot by its own cost —
	 * we cannot know that cost up front — but the org cannot keep spending past the limit.
	 */
	private async assertBudget(orgId: string) {
		const { summary, exceeded } = await this.budget(orgId);
		if (exceeded) {
			throw new AppError(
				429,
				"ai_budget_exceeded",
				`This organization has used its monthly AI budget of $${summary.limitUsd}. It resets at the start of next month.`,
				{ limitUsd: summary.limitUsd, usedUsd: summary.usedUsd },
			);
		}
	}

	// ── brand profile ───────────────────────────────────────────────────────────

	async getBrand(orgId: string) {
		return toBrandDto(orgId, await this.brandRow(orgId));
	}

	async saveBrand(orgId: string, userId: string, input: BrandProfileInput) {
		const values = { ...input, website: input.website ?? null, updatedBy: userId };
		const [row] = await this.db
			.insert(brandProfiles)
			.values({ organizationId: orgId, ...values })
			.onConflictDoUpdate({
				target: brandProfiles.organizationId,
				set: { ...values, updatedAt: new Date() },
			})
			.returning();
		return toBrandDto(orgId, row);
	}

	private async brandRow(orgId: string) {
		const [row] = await this.db
			.select()
			.from(brandProfiles)
			.where(eq(brandProfiles.organizationId, orgId))
			.limit(1);
		return row;
	}

	private async brandContext(orgId: string): Promise<BrandContext | null> {
		const row = await this.brandRow(orgId);
		if (!row) return null;
		return {
			brandName: row.brandName,
			description: row.description,
			audience: row.audience,
			voice: row.voice,
			website: row.website,
			keywords: row.keywords,
			avoid: row.avoid,
			examplePosts: row.examplePosts,
		};
	}

	// ── text tasks (synchronous) ────────────────────────────────────────────────

	async generatePosts(orgId: string, userId: string, input: z.output<typeof generatePostsInput>) {
		const r = await this.runText(orgId, userId, "post", input, (m, b) =>
			generatePosts(m, b, input),
		);
		return { generationId: r.generationId, model: r.model, variants: r.output.variants };
	}

	async rewrite(orgId: string, userId: string, input: z.output<typeof rewriteInput>) {
		const r = await this.runText(orgId, userId, "rewrite", input, (m, b) => rewrite(m, b, input));
		return { generationId: r.generationId, text: r.output.text };
	}

	async hashtags(orgId: string, userId: string, input: z.output<typeof hashtagsInput>) {
		const r = await this.runText(orgId, userId, "hashtags", input, (m, b) =>
			suggestHashtags(m, b, input),
		);
		return { generationId: r.generationId, hashtags: r.output.hashtags };
	}

	async carouselOutline(
		orgId: string,
		userId: string,
		input: z.output<typeof carouselOutlineInput>,
	) {
		const r = await this.runText(orgId, userId, "carousel_outline", input, (m, b) =>
			carouselOutline(m, b, input),
		);
		return { generationId: r.generationId, ...r.output };
	}

	async videoScript(orgId: string, userId: string, input: z.output<typeof videoScriptInput>) {
		const r = await this.runText(orgId, userId, "video_script", input, (m, b) =>
			videoScript(m, b, input),
		);
		return { generationId: r.generationId, ...r.output };
	}

	/**
	 * One text call, recorded either way: the ledger row is what the budget sums, and a
	 * failed row keeps the audit trail honest about what users tried.
	 */
	private async runText<T extends Record<string, unknown>>(
		orgId: string,
		userId: string,
		kind: GenerationKind,
		input: Record<string, unknown>,
		call: (model: TextModel, brand: BrandContext | null) => Promise<TextResult<T>>,
	) {
		const model = this.ai.text;
		if (!model) throw notConfigured("text");
		await this.assertBudget(orgId);
		const brand = await this.brandContext(orgId);

		const started = performance.now();
		const base = { organizationId: orgId, userId, kind, input };
		let result: TextResult<T>;
		try {
			result = await call(model, brand);
		} catch (error) {
			await this.db.insert(aiGenerations).values({
				...base,
				status: "failed",
				model: model.id,
				// Anything that is not an AiError is our bug; "internal" keeps it distinguishable.
				errorCode: isAiError(error) ? error.kind : "internal",
				errorMessage: error instanceof Error ? error.message.slice(0, 1000) : String(error),
				durationMs: Math.round(performance.now() - started),
				completedAt: new Date(),
			});
			throw toAppError(error);
		}

		const [row] = await this.db
			.insert(aiGenerations)
			.values({
				...base,
				status: "succeeded",
				model: result.model,
				output: result.output,
				inputTokens: result.usage.inputTokens,
				outputTokens: result.usage.outputTokens,
				costMicros: result.costMicros,
				durationMs: Math.round(performance.now() - started),
				completedAt: new Date(),
			})
			.returning({ id: aiGenerations.id });
		if (!row) throw new Error("ai_generations insert returned no row");
		return { generationId: row.id, model: result.model, output: result.output };
	}

	// ── media (asynchronous, rendered by the worker) ─────────────────────────────

	async startImage(orgId: string, userId: string, input: ImageInput) {
		if (!this.ai.images) throw notConfigured("image");
		await this.assertBudget(orgId);
		return this.enqueue(orgId, userId, "image", input);
	}

	/** Rendering slides costs nothing, so there is no provider or budget requirement. */
	async startCarousel(orgId: string, userId: string, input: CarouselInput) {
		return this.enqueue(orgId, userId, "carousel", input);
	}

	/**
	 * Rendering is local, but AI backgrounds and voiceover are paid calls: each needs its
	 * provider, and the budget is checked only when at least one of them will run.
	 */
	async startVideo(orgId: string, userId: string, input: VideoInput) {
		const ownMedia = input.sceneMediaIds ?? [];
		// A scene with its own library image never asks the image model.
		const wantsAiImages = input.background === "ai" && input.scenes.some((_, i) => !ownMedia[i]);
		const wantsVoice = input.voiceover.enabled && input.scenes.some((s) => s.narration.length > 0);
		if (wantsAiImages && !this.ai.images) throw notConfigured("image");
		if (input.voiceover.enabled && !this.ai.speech) throw notConfigured("voiceover");
		await this.assertSceneMedia(orgId, ownMedia);
		if (wantsAiImages || wantsVoice) await this.assertBudget(orgId);
		return this.enqueue(orgId, userId, "video", input);
	}

	/**
	 * Checked here so the user hears about a bad pick now, not minutes later from the
	 * worker. Scoped to the org: another tenant's id is indistinguishable from a missing one.
	 */
	private async assertSceneMedia(orgId: string, ids: (string | null)[]) {
		const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
		if (!wanted.length) return;
		const rows = await this.loadMedia(orgId, wanted);
		for (const id of wanted) {
			const m = rows.get(id);
			if (!m) throw notFound("Media");
			if (m.kind !== "image" || m.status !== "ready") {
				throw new AppError(
					422,
					"media_invalid",
					"Scene backgrounds must be images that have finished uploading",
					{ mediaId: id },
				);
			}
		}
	}

	private async enqueue(
		orgId: string,
		userId: string,
		kind: GenerationKind,
		input: Record<string, unknown>,
	) {
		const [row] = (await this.db
			.insert(aiGenerations)
			.values({ organizationId: orgId, userId, kind, status: "pending", input })
			.returning()) as [GenerationRow];
		// The row is committed before the job exists, so the worker always finds it.
		try {
			await this.jobs.enqueueAiMedia({ generationId: row.id, organizationId: orgId });
		} catch (error) {
			// Without a job nothing will ever pick this row up: fail it now rather than
			// leave the user watching a spinner until maintenance times it out.
			await this.db
				.update(aiGenerations)
				.set({
					status: "failed",
					errorCode: "enqueue_failed",
					errorMessage: "Could not start the job — please try again",
					completedAt: new Date(),
				})
				.where(eq(aiGenerations.id, row.id));
			throw error;
		}
		return toGenerationDto(row, []);
	}

	// ── history ─────────────────────────────────────────────────────────────────

	async getGeneration(orgId: string, id: string) {
		const [row] = await this.db
			.select()
			.from(aiGenerations)
			.where(and(eq(aiGenerations.id, id), eq(aiGenerations.organizationId, orgId)))
			.limit(1);
		if (!row) throw notFound("Generation");
		const media = await this.loadMedia(orgId, row.mediaIds);
		return toGenerationDto(row, this.pick(media, row.mediaIds));
	}

	/** Keyset pagination on the time-ordered id, like the media library. */
	async listGenerations(
		orgId: string,
		opts: { kind?: GenerationKind; before?: string; limit: number },
	) {
		const rows = await this.db
			.select()
			.from(aiGenerations)
			.where(
				and(
					eq(aiGenerations.organizationId, orgId),
					opts.kind ? eq(aiGenerations.kind, opts.kind) : undefined,
					opts.before ? lt(aiGenerations.id, opts.before) : undefined,
				),
			)
			.orderBy(desc(aiGenerations.id))
			.limit(opts.limit + 1);
		const page = rows.slice(0, opts.limit);
		// One query for every page's media instead of one per generation.
		const media = await this.loadMedia(
			orgId,
			page.flatMap((g) => g.mediaIds),
		);
		return {
			items: page.map((g) => toGenerationDto(g, this.pick(media, g.mediaIds))),
			nextCursor: rows.length > opts.limit ? (page.at(-1)?.id ?? null) : null,
		};
	}

	/** Scoped to the org: a generation can never surface another tenant's file. */
	private async loadMedia(orgId: string, ids: string[]) {
		if (!ids.length) return new Map<string, MediaRow>();
		const rows = await this.db
			.select()
			.from(mediaAssets)
			.where(and(eq(mediaAssets.organizationId, orgId), inArray(mediaAssets.id, ids)));
		return new Map(rows.map((m) => [m.id, m]));
	}

	/** Keeps the generation's order (slide 1 first); files deleted since are skipped. */
	private pick(media: Map<string, MediaRow>, ids: string[]) {
		return ids.flatMap((id) => {
			const m = media.get(id);
			return m ? [m] : [];
		});
	}
}
