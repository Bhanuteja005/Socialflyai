import { AppError, badRequest, conflict, notFound } from "@socialfly/core/errors";
import type { Logger } from "@socialfly/core/logger";
import {
	and,
	asc,
	type Database,
	desc,
	eq,
	gte,
	inArray,
	isNull,
	lte,
	recordTargetEvent,
	rollUpPostStatus,
	schema,
	sql,
	type Tx,
} from "@socialfly/db";
import {
	type MediaItem,
	type ProviderRegistry,
	validateForProvider,
} from "@socialfly/integrations";
import type { JobProducer } from "@socialfly/queue";
import { publicUrl, toMediaDto } from "../media/media.service";
import type { CreatePostInput, UpdatePostInput } from "./posts.schemas";

const { posts, postTargets, postMedia, channels, mediaAssets, postTargetEvents } = schema;

type ChannelRow = typeof channels.$inferSelect;
type MediaRow = typeof mediaAssets.$inferSelect;
type TargetRow = typeof postTargets.$inferSelect;

/** Targets in these states have been (or are being) sent — their content is frozen. */
const IN_FLIGHT_OR_DONE = ["queued", "publishing", "processing", "published"] as const;
/** Targets in these states can be (re)scheduled. */
const SCHEDULABLE = ["draft", "scheduled", "failed", "canceled"] as const;

type TargetInput = CreatePostInput["targets"][number];

export class PostsService {
	constructor(
		private readonly db: Database,
		private readonly providers: ProviderRegistry,
		private readonly jobs: JobProducer,
		private readonly logger: Logger,
	) {}

	// ── create / update ────────────────────────────────────────────────────────

	async create(orgId: string, userId: string, input: CreatePostInput) {
		const refs = await this.loadRefs(orgId, input.targets, input.mediaIds);
		const postId = await this.db.transaction(async (tx) => {
			const [post] = await tx
				.insert(posts)
				.values({
					organizationId: orgId,
					authorId: userId,
					content: input.content,
					scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
				})
				.returning({ id: posts.id });
			if (!post) throw new Error("post insert returned no row");
			await this.writeMediaAndTargets(tx, orgId, post.id, input);
			return post.id;
		});

		if (input.action === "schedule") {
			return this.schedule(orgId, postId, input.scheduledAt ?? null, refs);
		}
		return this.get(orgId, postId);
	}

	/**
	 * Replaces content, media and targets. Refused once any target has been sent:
	 * editing a published post in SocialFly would not edit it on the platform, and
	 * pretending otherwise is worse than saying no.
	 */
	async update(orgId: string, postId: string, input: UpdatePostInput) {
		const post = await this.requirePost(orgId, postId);
		const existing = await this.db.select().from(postTargets).where(eq(postTargets.postId, postId));
		if (existing.some((t) => (IN_FLIGHT_OR_DONE as readonly string[]).includes(t.status))) {
			throw conflict(
				"This post has already been sent to at least one channel and can't be edited",
				"post_locked",
			);
		}
		const refs = await this.loadRefs(orgId, input.targets, input.mediaIds);
		const wasScheduled = post.status === "scheduled";

		await this.db.transaction(async (tx) => {
			await tx
				.update(posts)
				.set({
					content: input.content,
					scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
				})
				.where(eq(posts.id, postId));
			await tx.delete(postMedia).where(eq(postMedia.postId, postId));
			await tx.delete(postTargets).where(eq(postTargets.postId, postId));
			await this.writeMediaAndTargets(tx, orgId, postId, input);
			await rollUpPostStatus(tx, postId);
		});
		await this.cancelJobs(existing);

		// Editing a scheduled post keeps it scheduled (re-validated against the new content).
		if (wasScheduled) return this.schedule(orgId, postId, input.scheduledAt ?? null, refs);
		return this.get(orgId, postId);
	}

	// ── scheduling ─────────────────────────────────────────────────────────────

	/**
	 * Validates every target against its platform, then moves them to `scheduled`
	 * with a bumped schedule_version and enqueues one delayed job per target.
	 *
	 * DB first, queue second: if enqueueing fails after the commit, the worker's
	 * minute-by-minute sweep finds the due target and enqueues it (same
	 * deterministic job id), so a Redis blip delays a post instead of losing it.
	 */
	async schedule(orgId: string, postId: string, scheduledAt: string | null, preloaded?: Refs) {
		await this.requirePost(orgId, postId);
		const runAt = scheduledAt ? new Date(scheduledAt) : null;
		if (runAt && runAt.getTime() < Date.now() - 60_000)
			throw badRequest("That time is in the past");

		const { post, targets, media } = await this.loadForPublishing(orgId, postId);
		const refs =
			preloaded ??
			(await this.loadRefs(
				orgId,
				targets,
				media.map((m) => m.id),
			));
		const schedulable = targets.filter((t) =>
			(SCHEDULABLE as readonly string[]).includes(t.status),
		);
		if (schedulable.length === 0)
			throw conflict("Nothing left to schedule on this post", "nothing_to_schedule");
		this.assertValid(post.content, schedulable, refs);

		const updated = await this.db.transaction(async (tx) => {
			await tx.update(posts).set({ scheduledAt: runAt }).where(eq(posts.id, postId));
			const rows = await tx
				.update(postTargets)
				.set({
					status: "scheduled",
					scheduledAt: runAt ?? new Date(),
					scheduleVersion: sql`${postTargets.scheduleVersion} + 1`,
					attempts: 0,
					errorCode: null,
					errorMessage: null,
					pendingData: null,
				})
				.where(and(eq(postTargets.postId, postId), inArray(postTargets.status, [...SCHEDULABLE])))
				.returning();
			for (const t of rows) {
				await recordTargetEvent(
					tx,
					t.id,
					"scheduled",
					runAt ? `Scheduled for ${runAt.toISOString()}` : "Publishing now",
				);
			}
			await rollUpPostStatus(tx, postId);
			return rows;
		});

		await this.enqueue(orgId, updated, refs.channels, runAt);
		return this.get(orgId, postId);
	}

	/** Back to draft: pending jobs are removed, and bumping the version makes any that slipped through stale. */
	async unschedule(orgId: string, postId: string) {
		await this.requirePost(orgId, postId);
		const rows = await this.db.transaction(async (tx) => {
			const updated = await tx
				.update(postTargets)
				.set({ status: "draft", scheduleVersion: sql`${postTargets.scheduleVersion} + 1` })
				.where(
					and(eq(postTargets.postId, postId), inArray(postTargets.status, ["scheduled", "queued"])),
				)
				.returning();
			if (updated.length === 0) throw conflict("This post is not scheduled", "not_scheduled");
			await tx.update(posts).set({ scheduledAt: null }).where(eq(posts.id, postId));
			await rollUpPostStatus(tx, postId);
			return updated;
		});
		await this.cancelJobs(rows.map((r) => ({ ...r, scheduleVersion: r.scheduleVersion - 1 })));
		return this.get(orgId, postId);
	}

	/**
	 * Manual retry of one target. `unconfirmed` needs an explicit "I checked the
	 * platform and it is not there" — the first attempt may have succeeded.
	 */
	async retryTarget(orgId: string, postId: string, targetId: string, confirmNotPublished: boolean) {
		await this.requirePost(orgId, postId);
		const [target] = await this.db
			.select()
			.from(postTargets)
			.where(and(eq(postTargets.id, targetId), eq(postTargets.postId, postId)))
			.limit(1);
		if (!target) throw notFound("Target");
		if (target.status === "unconfirmed" && !confirmNotPublished) {
			throw new AppError(
				409,
				"confirm_required",
				"This post may already be live. Check the platform, then confirm to publish it again.",
			);
		}
		if (target.status !== "failed" && target.status !== "unconfirmed") {
			throw conflict("Only failed posts can be retried", "not_retryable");
		}

		const { targets, media } = await this.loadForPublishing(orgId, postId);
		const current = targets.filter((t) => t.id === targetId);
		const refs = await this.loadRefs(
			orgId,
			current,
			media.map((m) => m.id),
		);
		const [post] = await this.db.select().from(posts).where(eq(posts.id, postId));
		this.assertValid(post?.content ?? "", current, refs);

		const [updated] = await this.db.transaction(async (tx) => {
			const rows = await tx
				.update(postTargets)
				.set({
					status: "scheduled",
					scheduledAt: new Date(),
					scheduleVersion: sql`${postTargets.scheduleVersion} + 1`,
					errorCode: null,
					errorMessage: null,
					pendingData: null,
				})
				.where(eq(postTargets.id, targetId))
				.returning();
			await recordTargetEvent(tx, targetId, "retry_requested", "Retry requested by a user");
			await rollUpPostStatus(tx, postId);
			return rows;
		});
		if (updated) await this.enqueue(orgId, [updated], refs.channels, null);
		return this.get(orgId, postId);
	}

	/**
	 * Removes the post from SocialFly. Anything not yet sent is canceled; anything
	 * already published stays on the platform (we say so in the UI).
	 */
	async remove(orgId: string, postId: string) {
		await this.requirePost(orgId, postId);
		const pending = await this.db.transaction(async (tx) => {
			const rows = await tx
				.update(postTargets)
				.set({ status: "canceled", scheduleVersion: sql`${postTargets.scheduleVersion} + 1` })
				.where(
					and(
						eq(postTargets.postId, postId),
						inArray(postTargets.status, ["draft", "scheduled", "queued"]),
					),
				)
				.returning();
			await tx.update(posts).set({ deletedAt: new Date() }).where(eq(posts.id, postId));
			return rows;
		});
		await this.cancelJobs(pending.map((r) => ({ ...r, scheduleVersion: r.scheduleVersion - 1 })));
	}

	/** Dry run for the composer: per-channel problems, without saving anything. */
	async validate(
		orgId: string,
		input: { content: string; mediaIds: string[]; targets: TargetInput[] },
	) {
		const refs = await this.loadRefs(orgId, input.targets, input.mediaIds);
		return { targets: this.collectErrors(input.content, input.targets, refs) };
	}

	// ── reads ──────────────────────────────────────────────────────────────────

	async list(
		orgId: string,
		q: { from?: string; to?: string; status?: string; channelId?: string; limit: number },
	) {
		const rows = await this.db
			.select()
			.from(posts)
			.where(
				and(
					eq(posts.organizationId, orgId),
					isNull(posts.deletedAt),
					q.from ? gte(posts.scheduledAt, new Date(q.from)) : undefined,
					q.to ? lte(posts.scheduledAt, new Date(q.to)) : undefined,
					q.status
						? eq(posts.status, q.status as (typeof posts.status.enumValues)[number])
						: undefined,
					q.channelId
						? inArray(
								posts.id,
								this.db
									.select({ id: postTargets.postId })
									.from(postTargets)
									.where(eq(postTargets.channelId, q.channelId)),
							)
						: undefined,
				),
			)
			.orderBy(asc(posts.scheduledAt), desc(posts.createdAt))
			.limit(q.limit);
		return { posts: await this.hydrate(rows) };
	}

	async get(orgId: string, postId: string) {
		const post = await this.requirePost(orgId, postId);
		const [hydrated] = await this.hydrate([post]);
		if (!hydrated) throw notFound("Post");
		const targetIds = hydrated.targets.map((t) => t.id);
		const events = targetIds.length
			? await this.db
					.select()
					.from(postTargetEvents)
					.where(inArray(postTargetEvents.targetId, targetIds))
					.orderBy(asc(postTargetEvents.createdAt))
			: [];
		return {
			...hydrated,
			events: events.map((e) => ({
				targetId: e.targetId,
				type: e.type,
				message: e.message,
				createdAt: e.createdAt.toISOString(),
			})),
		};
	}

	// ── internals ──────────────────────────────────────────────────────────────

	private async requirePost(orgId: string, postId: string) {
		const [post] = await this.db
			.select()
			.from(posts)
			.where(and(eq(posts.id, postId), eq(posts.organizationId, orgId), isNull(posts.deletedAt)))
			.limit(1);
		if (!post) throw notFound("Post");
		return post;
	}

	private async writeMediaAndTargets(
		tx: Tx,
		orgId: string,
		postId: string,
		input: { mediaIds: string[]; targets: TargetInput[] },
	) {
		if (input.mediaIds.length > 0) {
			await tx
				.insert(postMedia)
				.values(input.mediaIds.map((mediaId, position) => ({ postId, mediaId, position })));
		}
		await tx.insert(postTargets).values(
			input.targets.map((t) => ({
				organizationId: orgId,
				postId,
				channelId: t.channelId,
				contentOverride: t.contentOverride ?? null,
				settings: t.settings,
				status: "draft" as const,
			})),
		);
	}

	private async loadForPublishing(orgId: string, postId: string) {
		const [post] = await this.db
			.select()
			.from(posts)
			.where(and(eq(posts.id, postId), eq(posts.organizationId, orgId)));
		if (!post) throw notFound("Post");
		const targets = await this.db.select().from(postTargets).where(eq(postTargets.postId, postId));
		const media = await this.db
			.select({ id: mediaAssets.id })
			.from(postMedia)
			.innerJoin(mediaAssets, eq(mediaAssets.id, postMedia.mediaId))
			.where(eq(postMedia.postId, postId))
			.orderBy(asc(postMedia.position));
		return { post, targets, media };
	}

	/** Channels and media referenced by a post, checked to belong to the org and be usable. */
	private async loadRefs(
		orgId: string,
		targets: { channelId: string }[],
		mediaIds: string[],
	): Promise<Refs> {
		const channelIds = [...new Set(targets.map((t) => t.channelId))];
		const channelRows = channelIds.length
			? await this.db
					.select()
					.from(channels)
					.where(and(eq(channels.organizationId, orgId), inArray(channels.id, channelIds)))
			: [];
		const byId = new Map(channelRows.map((c) => [c.id, c]));
		for (const id of channelIds) {
			const c = byId.get(id);
			if (!c || c.status === "disconnected")
				throw badRequest("One of the selected channels no longer exists");
		}

		const mediaRows = mediaIds.length
			? await this.db
					.select()
					.from(mediaAssets)
					.where(and(eq(mediaAssets.organizationId, orgId), inArray(mediaAssets.id, mediaIds)))
			: [];
		const mediaById = new Map(mediaRows.map((m) => [m.id, m]));
		const media = mediaIds.map((id) => {
			const m = mediaById.get(id);
			if (m?.status !== "ready")
				throw badRequest("One of the attached files is missing or still uploading");
			return m;
		});
		return { channels: byId, media };
	}

	private collectErrors(
		content: string,
		targets: { channelId: string; contentOverride?: string | null; settings: unknown }[],
		refs: Refs,
	) {
		const media: MediaItem[] = refs.media.map(toMediaItem);
		return targets.map((t) => {
			const channel = refs.channels.get(t.channelId) as ChannelRow;
			const provider = this.providers.get(channel.provider);
			const errors = provider
				? validateForProvider(provider, {
						text: t.contentOverride ?? content,
						media,
						settings: (t.settings ?? {}) as Record<string, unknown>,
					})
				: [`${channel.provider} is no longer supported`];
			if (channel.status === "needs_reauth") errors.push(`${channel.name} needs to be reconnected`);
			return {
				channelId: t.channelId,
				channelName: channel.name,
				provider: channel.provider,
				errors,
			};
		});
	}

	private assertValid(
		content: string,
		targets: { channelId: string; contentOverride?: string | null; settings: unknown }[],
		refs: Refs,
	) {
		const results = this.collectErrors(content, targets, refs);
		if (results.some((r) => r.errors.length > 0)) {
			throw new AppError(422, "post_invalid", "Some channels can't publish this post as it is", {
				targets: results.filter((r) => r.errors.length > 0),
			});
		}
	}

	private async enqueue(
		orgId: string,
		targets: TargetRow[],
		channelMap: Map<string, ChannelRow>,
		runAt: Date | null,
	) {
		for (const t of targets) {
			const provider = channelMap.get(t.channelId)?.provider;
			if (!provider) continue;
			try {
				await this.jobs.schedulePublish(
					provider,
					{ targetId: t.id, organizationId: orgId, scheduleVersion: t.scheduleVersion },
					runAt,
				);
			} catch (error) {
				// Not fatal: the worker's sweep enqueues due targets that have no job.
				this.logger.error({ err: error, targetId: t.id }, "enqueue failed — sweep will recover it");
			}
		}
	}

	private async cancelJobs(targets: Pick<TargetRow, "id" | "channelId" | "scheduleVersion">[]) {
		if (targets.length === 0) return;
		const rows = await this.db
			.select({ id: channels.id, provider: channels.provider })
			.from(channels)
			.where(inArray(channels.id, [...new Set(targets.map((t) => t.channelId))]));
		const providerOf = new Map(rows.map((r) => [r.id, r.provider]));
		await Promise.all(
			targets.map((t) => {
				const provider = providerOf.get(t.channelId);
				return provider
					? this.jobs.cancelPublish(provider, t.id, t.scheduleVersion).catch(() => {})
					: Promise.resolve();
			}),
		);
	}

	/** Posts + their targets (with channel identity) + ordered media, in three queries total. */
	private async hydrate(rows: (typeof posts.$inferSelect)[]) {
		if (rows.length === 0) return [];
		const ids = rows.map((p) => p.id);
		const [targetRows, mediaRows] = await Promise.all([
			this.db
				.select({ target: postTargets, channel: channels })
				.from(postTargets)
				.innerJoin(channels, eq(channels.id, postTargets.channelId))
				.where(inArray(postTargets.postId, ids)),
			this.db
				.select({ link: postMedia, media: mediaAssets })
				.from(postMedia)
				.innerJoin(mediaAssets, eq(mediaAssets.id, postMedia.mediaId))
				.where(inArray(postMedia.postId, ids))
				.orderBy(asc(postMedia.position)),
		]);

		return rows.map((p) => ({
			id: p.id,
			content: p.content,
			status: p.status,
			scheduledAt: p.scheduledAt?.toISOString() ?? null,
			authorId: p.authorId,
			createdAt: p.createdAt.toISOString(),
			updatedAt: p.updatedAt.toISOString(),
			media: mediaRows.filter((m) => m.link.postId === p.id).map((m) => toMediaDto(m.media)),
			targets: targetRows
				.filter((t) => t.target.postId === p.id)
				.map(({ target, channel }) => ({
					id: target.id,
					channel: {
						id: channel.id,
						provider: channel.provider,
						name: channel.name,
						avatarUrl: channel.avatarUrl,
						status: channel.status,
					},
					contentOverride: target.contentOverride,
					settings: target.settings,
					status: target.status,
					scheduledAt: target.scheduledAt?.toISOString() ?? null,
					publishedAt: target.publishedAt?.toISOString() ?? null,
					externalUrl: target.externalUrl,
					errorCode: target.errorCode,
					errorMessage: target.errorMessage,
				})),
		}));
	}
}

type Refs = { channels: Map<string, ChannelRow>; media: MediaRow[] };

export const toMediaItem = (m: MediaRow): MediaItem => ({
	url: publicUrl(m.storageKey),
	kind: m.kind === "video" ? "video" : "image",
	mimeType: m.mimeType,
	sizeBytes: m.sizeBytes,
	width: m.width,
	height: m.height,
	durationMs: m.durationMs,
	altText: m.altText,
});
