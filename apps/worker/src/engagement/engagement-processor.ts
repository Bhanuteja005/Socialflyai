import {
	type AiModels,
	type BrandContext,
	isAiError,
	TRIAGE_BATCH_SIZE,
	type TriageVerdict,
	triageItems,
} from "@socialfly/ai";
import type { Logger } from "@socialfly/core/logger";
import { getMeter } from "@socialfly/core/telemetry";
import { and, type Database, eq, inArray, schema, sql } from "@socialfly/db";
import {
	type ChannelContext,
	type DiscussionItem,
	type EngagementItem,
	type EngagementSupport,
	isProviderError,
	type ProviderRegistry,
	type SocialProvider,
} from "@socialfly/integrations";
import type { EngagementJob, JobProducer } from "@socialfly/queue";
import { type CallBudget, CallBudgetExhausted } from "#src/analytics/call-budget.ts";
import { ChannelNeedsReauthError, type ChannelTokens } from "#src/channels/channel-tokens.ts";
import { budgetExceeded } from "#src/research/budget.ts";
import { missingScopes } from "./scopes.ts";

const {
	aiGenerations,
	brandProfiles,
	channels,
	engagementCursors,
	engagementItems,
	listeningQueries,
	organizations,
	postTargets,
} = schema;

export type EngagementDeps = {
	db: Database;
	/** Read on every call (not destructured) so tests can swap the text model. */
	ai: AiModels;
	providers: ProviderRegistry;
	tokens: ChannelTokens;
	/** Per-provider read budget, separate from analytics and far below publishing's share. */
	budget: CallBudget;
	jobs: JobProducer;
	logger: Logger;
	config: {
		/** Server default AI_ORG_MONTHLY_BUDGET_USD (an org override wins). */
		monthlyBudgetUsd: number;
	};
};

type ChannelRow = typeof channels.$inferSelect;
type Skipped = { skipped: string };
type ItemInsert = typeof engagementItems.$inferInsert;

/** Comments are read on posts published this recently; older threads have gone quiet. */
const COMMENT_WINDOW_DAYS = 14;
/** Most published targets read per sync (newest first). */
const MAX_TARGETS_PER_SYNC = 200;
/**
 * Each sync asks for items since the previous run MINUS this overlap: platforms index
 * comments late, and the unique key makes re-reading an item free.
 */
const SINCE_OVERLAP_MS = 10 * 60_000;
/** A listening query runs at most this often. */
const LISTEN_INTERVAL = sql.raw(`interval '1 hour'`);
/** New discussions stored per listening run: a firehose would bury the inbox. */
const LISTEN_MAX_NEW = 25;
/** How far back the first listening run looks. */
const LISTEN_FIRST_LOOKBACK_MS = 7 * 24 * 3600_000;
/** Items scored per triage job; the rest wait for the next planner run. */
const TRIAGE_MAX_PER_RUN = 100;
/** Stored text is capped: a platform can return an essay, and the inbox shows 2,000 chars. */
const MAX_TEXT = 20_000;

const meter = getMeter("engagement");
const stored = meter.createCounter("socialfly.engagement.items", {
	description: "New inbox items stored, by provider and kind",
});

const chunk = <T>(items: T[], size: number) => {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
};

const toDate = (iso: string) => {
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? new Date() : d;
};

const clipText = (text: string | null | undefined, max = MAX_TEXT) => (text ?? "").slice(0, max);

/**
 * The inbox's read side: finds new comments, mentions and discussions, and scores them.
 * Towards the platforms this is read-only, so retries are safe; the rules that matter
 * are the analytics ones — never starve publishing of rate limit (a per-provider call
 * budget), never flag a channel for reauth over a missing read scope — plus one of its
 * own: an item already stored is never overwritten, so a re-read cannot undo triage,
 * a status the user set, or a sent reply.
 */
export class EngagementProcessor {
	constructor(private readonly deps: EngagementDeps) {}

	async run(job: EngagementJob) {
		switch (job.task) {
			case "plan":
				return this.plan();
			case "sync-channel":
				return this.syncChannel(job.channelId);
			case "listen":
				return this.listen(job.queryId);
			case "triage":
				return this.triage(job.organizationId);
		}
	}

	/** Configured providers with inbox support. */
	private supported() {
		return this.deps.providers.available().filter((p) => p.engagement);
	}

	// ── plan ────────────────────────────────────────────────────────────────────

	/**
	 * Every 10 minutes: a sync per readable channel, due listening queries, and triage
	 * for organizations with unscored items. Bucketed job ids make it safe on every
	 * replica and at any cadence.
	 */
	async plan() {
		const now = Date.now();
		const supported = this.supported();
		let syncs = 0;
		let skippedScopes = 0;
		if (supported.length > 0) {
			const rows = await this.deps.db
				.select({ id: channels.id, provider: channels.provider, scopes: channels.scopes })
				.from(channels)
				.innerJoin(organizations, eq(organizations.id, channels.organizationId))
				.where(
					and(
						eq(channels.status, "active"),
						sql`${organizations.deletedAt} is null`,
						inArray(
							channels.provider,
							supported.map((p) => p.id as string),
						),
					),
				);
			for (const row of rows) {
				const engagement = this.deps.providers.get(row.provider)?.engagement;
				if (!engagement) continue;
				const missing = missingScopes(row.scopes, engagement.requiredScopes.read);
				if (missing.length > 0) {
					// Connected before the inbox existed (or the user declined): publishing still
					// works; the inbox settings screen tells them what a reconnect unlocks.
					this.deps.logger.debug(
						{ channelId: row.id, provider: row.provider, missing },
						"inbox sync skipped: read scopes missing",
					);
					skippedScopes++;
					continue;
				}
				await this.deps.jobs.enqueueEngagement(
					{ task: "sync-channel", channelId: row.id },
					{ now },
				);
				syncs++;
			}
		}

		const queries = (await this.deps.db.execute(sql`
			select q.id from listening_queries q
			join organizations o on o.id = q.organization_id
			where q.active and o.deleted_at is null
				and (q.last_run_at is null or q.last_run_at < now() - ${LISTEN_INTERVAL})
		`)) as unknown as { id: string }[];
		if (supported.some((p) => p.engagement?.searchDiscussions)) {
			for (const q of queries) {
				await this.deps.jobs.enqueueEngagement({ task: "listen", queryId: q.id }, { now });
			}
		}

		let triage = 0;
		if (this.deps.ai.text) {
			// Served by the partial "untriaged" index.
			const orgs = (await this.deps.db.execute(sql`
				select distinct i.organization_id as id from engagement_items i
				join organizations o on o.id = i.organization_id
				where i.triaged_at is null and i.from_self = false and o.deleted_at is null
			`)) as unknown as { id: string }[];
			for (const org of orgs) {
				await this.deps.jobs.enqueueEngagement({ task: "triage", organizationId: org.id }, { now });
				triage++;
			}
		}
		return {
			syncs,
			skippedScopes,
			listens: supported.some((p) => p.engagement?.searchDiscussions) ? queries.length : 0,
			triage,
		};
	}

	// ── sync ────────────────────────────────────────────────────────────────────

	async syncChannel(channelId: string) {
		const loaded = await this.loadChannel(channelId);
		if ("skipped" in loaded) return loaded;
		const { channel, provider, engagement } = loaded;
		const log = this.deps.logger.child({ channelId, provider: provider.id });
		const missing = missingScopes(channel.scopes, engagement.requiredScopes.read);
		if (missing.length > 0) return { skipped: "missing_scopes" };

		const startedAt = new Date();
		const [cursor] = await this.deps.db
			.select()
			.from(engagementCursors)
			.where(eq(engagementCursors.channelId, channelId))
			.limit(1);
		const sinceOf = (at: Date | null | undefined) =>
			new Date(
				at
					? at.getTime() - SINCE_OVERLAP_MS
					: startedAt.getTime() - COMMENT_WINDOW_DAYS * 24 * 3600_000,
			).toISOString();

		const targets = (await this.deps.db.execute(sql`
			select t.external_id as "externalId" from post_targets t
			where t.channel_id = ${channelId} and t.status = 'published'
				and t.external_id is not null
				and t.published_at > now() - make_interval(days => ${COMMENT_WINDOW_DAYS})
			order by t.published_at desc
			limit ${MAX_TARGETS_PER_SYNC}
		`)) as unknown as { externalId: string }[];

		let inserted = 0;
		let lastError: string | null = null;
		const commentsSince = sinceOf(cursor?.commentsSince);
		for (const batch of chunk(targets, Math.max(1, engagement.maxPostsPerCall))) {
			let items: EngagementItem[];
			try {
				items = await this.call(channel, provider, (ctx) =>
					engagement.listComments(ctx, {
						postExternalIds: batch.map((t) => t.externalId),
						since: commentsSince,
					}),
				);
			} catch (error) {
				const handled = this.handled(error, log);
				if (handled === "skip_batch") {
					lastError = "The platform rejected a comments request";
					continue;
				}
				if (handled) return this.giveUp(channelId, handled, inserted);
				throw error;
			}
			inserted += await this.store(channel, provider.id, items);
		}

		const listMentions = engagement.listMentions?.bind(engagement);
		let mentionsOk = false;
		if (listMentions) {
			try {
				const items = await this.call(channel, provider, (ctx) =>
					listMentions(ctx, { since: sinceOf(cursor?.mentionsSince) }),
				);
				inserted += await this.store(channel, provider.id, items);
				mentionsOk = true;
			} catch (error) {
				const handled = this.handled(error, log);
				if (handled === "skip_batch") lastError = "The platform rejected the mentions request";
				else if (handled) return this.giveUp(channelId, handled, inserted);
				else throw error;
			}
		}

		// The cursor moves to when this run STARTED: anything posted during the run is
		// re-read next time (and deduplicated), never skipped.
		await this.deps.db
			.insert(engagementCursors)
			.values({
				channelId,
				commentsSince: startedAt,
				mentionsSince: mentionsOk ? startedAt : null,
				lastSyncedAt: new Date(),
				lastError,
			})
			.onConflictDoUpdate({
				target: engagementCursors.channelId,
				set: {
					commentsSince: startedAt,
					...(mentionsOk ? { mentionsSince: startedAt } : {}),
					lastSyncedAt: new Date(),
					lastError,
					updatedAt: new Date(),
				},
			});

		if (inserted > 0) {
			log.info({ inserted, posts: targets.length }, "inbox synced");
			// Score new items promptly instead of waiting for the next planner run.
			if (this.deps.ai.text) {
				await this.deps.jobs.enqueueEngagement({
					task: "triage",
					organizationId: channel.organizationId,
				});
			}
		}
		return { inserted, posts: targets.length };
	}

	/** Upserts platform items; returns how many were NEW. Existing rows are never touched. */
	private async store(channel: ChannelRow, provider: string, items: EngagementItem[]) {
		if (items.length === 0) return 0;
		// Link comments to our post target by the post's platform id.
		const postIds = [
			...new Set(items.map((i) => i.postExternalId).filter((x): x is string => !!x)),
		];
		const targetByExternal = new Map<string, string>();
		if (postIds.length > 0) {
			const rows = await this.deps.db
				.select({ id: postTargets.id, externalId: postTargets.externalId })
				.from(postTargets)
				.where(
					and(eq(postTargets.channelId, channel.id), inArray(postTargets.externalId, postIds)),
				);
			for (const r of rows) if (r.externalId) targetByExternal.set(r.externalId, r.id);
		}

		// One row per external id (a platform may repeat an item across pages).
		const unique = new Map<string, EngagementItem>();
		for (const item of items) if (item.externalId) unique.set(item.externalId, item);
		const rows: ItemInsert[] = [...unique.values()].map((item) => ({
			organizationId: channel.organizationId,
			channelId: channel.id,
			provider,
			kind: item.kind,
			externalId: item.externalId,
			postTargetId: item.postExternalId
				? (targetByExternal.get(item.postExternalId) ?? null)
				: null,
			postExternalId: item.postExternalId,
			parentExternalId: item.parentExternalId,
			author: item.author,
			fromSelf: item.fromSelf,
			text: clipText(item.text),
			url: item.url,
			postedAt: toDate(item.createdAt),
			// Our own replies are thread context, never something to answer.
			status: item.fromSelf ? "read" : "new",
		}));
		const inserted = await this.deps.db
			.insert(engagementItems)
			.values(rows)
			// DO NOTHING, not an update: a stored item may be triaged, archived or answered.
			.onConflictDoNothing({ target: [engagementItems.channelId, engagementItems.externalId] })
			.returning({ id: engagementItems.id, kind: engagementItems.kind });
		for (const row of inserted) stored.add(1, { provider, kind: row.kind });
		return inserted.length;
	}

	private async giveUp(channelId: string, handled: Skipped, inserted: number) {
		// Keep the cursor where it was (the next run re-reads), but say why on the cursor.
		await this.deps.db
			.insert(engagementCursors)
			.values({ channelId, lastError: handled.skipped })
			.onConflictDoUpdate({
				target: engagementCursors.channelId,
				set: { lastError: handled.skipped, updatedAt: new Date() },
			});
		return { inserted, ...handled };
	}

	// ── listening ───────────────────────────────────────────────────────────────

	async listen(queryId: string) {
		const [query] = await this.deps.db
			.select({ q: listeningQueries, orgDeletedAt: organizations.deletedAt })
			.from(listeningQueries)
			.innerJoin(organizations, eq(organizations.id, listeningQueries.organizationId))
			.where(eq(listeningQueries.id, queryId))
			.limit(1);
		if (!query || query.orgDeletedAt || !query.q.active) return { skipped: "inactive" };
		const q = query.q;
		const since = new Date(
			q.lastRunAt
				? q.lastRunAt.getTime() - SINCE_OVERLAP_MS
				: Date.now() - LISTEN_FIRST_LOOKBACK_MS,
		).toISOString();

		let inserted = 0;
		const byProvider: Record<string, number | string> = {};
		for (const providerId of q.providers) {
			if (inserted >= LISTEN_MAX_NEW) break;
			const provider = this.deps.providers.get(providerId);
			const search = provider?.isConfigured()
				? provider.engagement?.searchDiscussions?.bind(provider.engagement)
				: undefined;
			if (!provider?.engagement || !search) {
				byProvider[providerId] = "unsupported";
				continue;
			}
			// Searching needs a signed-in account on that platform: any active channel of the
			// org that holds the read scopes will do.
			const candidates = await this.deps.db
				.select()
				.from(channels)
				.where(
					and(
						eq(channels.organizationId, q.organizationId),
						eq(channels.provider, providerId),
						eq(channels.status, "active"),
					),
				)
				.orderBy(channels.createdAt);
			const readScopes = provider.engagement.requiredScopes.read;
			const channel = candidates.find((c) => missingScopes(c.scopes, readScopes).length === 0);
			if (!channel) {
				byProvider[providerId] = "no_channel";
				continue;
			}
			const log = this.deps.logger.child({ queryId, channelId: channel.id, provider: providerId });

			let found: DiscussionItem[];
			try {
				found = await this.call(channel, provider, (ctx) =>
					search(ctx, { query: q.query, since, limit: LISTEN_MAX_NEW }),
				);
			} catch (error) {
				const handled = this.handled(error, log);
				if (handled === "skip_batch") {
					byProvider[providerId] = "rejected";
					continue;
				}
				if (handled) {
					byProvider[providerId] = handled.skipped;
					continue;
				}
				throw error;
			}

			let added = 0;
			// Newest first; one insert at a time so the cap counts NEW rows, not results.
			const sorted = [...found].sort(
				(a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime(),
			);
			for (const d of sorted) {
				if (inserted >= LISTEN_MAX_NEW) break;
				if (!d.externalId) continue;
				const rows = await this.deps.db
					.insert(engagementItems)
					.values({
						organizationId: q.organizationId,
						channelId: channel.id,
						provider: providerId,
						kind: "discussion",
						externalId: d.externalId,
						listeningQueryId: q.id,
						author: d.author,
						fromSelf: false,
						title: d.title ? clipText(d.title, 500) : null,
						text: clipText(d.text),
						url: d.url,
						community: d.community,
						postedAt: toDate(d.createdAt),
					})
					.onConflictDoNothing({ target: [engagementItems.channelId, engagementItems.externalId] })
					.returning({ id: engagementItems.id });
				if (rows.length > 0) {
					added++;
					inserted++;
				}
			}
			byProvider[providerId] = added;
			if (added > 0) stored.add(added, { provider: providerId, kind: "discussion" });
		}

		await this.deps.db
			.update(listeningQueries)
			.set({ lastRunAt: new Date() })
			.where(eq(listeningQueries.id, q.id));
		if (inserted > 0 && this.deps.ai.text) {
			await this.deps.jobs.enqueueEngagement({ task: "triage", organizationId: q.organizationId });
		}
		return { inserted, byProvider };
	}

	// ── triage ──────────────────────────────────────────────────────────────────

	/**
	 * Scores an organization's untriaged items with the text model, 25 per call. Paid,
	 * so it obeys the monthly AI budget exactly like the API (checked before every
	 * call) and writes one ledger row (kind `triage`) per call, failed calls included.
	 */
	async triage(organizationId: string) {
		const model = this.deps.ai.text;
		const log = this.deps.logger.child({ organizationId, task: "triage" });
		if (!model) {
			log.info("inbox triage skipped: no text model configured");
			return { skipped: "no_text_model" };
		}
		const items = await this.deps.db
			.select({
				id: engagementItems.id,
				kind: engagementItems.kind,
				provider: engagementItems.provider,
				text: engagementItems.text,
				title: engagementItems.title,
				author: engagementItems.author,
				postTargetId: engagementItems.postTargetId,
			})
			.from(engagementItems)
			.where(
				and(
					eq(engagementItems.organizationId, organizationId),
					sql`${engagementItems.triagedAt} is null`,
					eq(engagementItems.fromSelf, false),
				),
			)
			.orderBy(engagementItems.createdAt)
			.limit(TRIAGE_MAX_PER_RUN);
		if (items.length === 0) return { triaged: 0 };
		const brand = await this.brandContext(organizationId);

		let triaged = 0;
		for (const batch of chunk(items, TRIAGE_BATCH_SIZE)) {
			if (await budgetExceeded(this.deps.db, organizationId, this.deps.config.monthlyBudgetUsd)) {
				log.info(
					{ triaged, left: items.length - triaged },
					"inbox triage skipped: AI budget spent",
				);
				return { triaged, skipped: "budget_exceeded" };
			}
			const input = { itemIds: batch.map((i) => i.id) };
			const started = performance.now();
			let verdicts: TriageVerdict[];
			try {
				const result = await triageItems(
					model,
					brand,
					batch.map((i) => ({
						id: i.id,
						kind: i.kind,
						provider: i.provider,
						text: i.text,
						title: i.title,
						authorName: i.author.name ?? i.author.handle,
						onOurPost: i.postTargetId !== null,
					})),
				);
				verdicts = result.output;
				await this.deps.db.insert(aiGenerations).values({
					organizationId,
					kind: "triage",
					status: "succeeded",
					model: result.model,
					input,
					output: { scored: verdicts.length },
					inputTokens: result.usage.inputTokens,
					outputTokens: result.usage.outputTokens,
					costMicros: result.costMicros,
					durationMs: Math.round(performance.now() - started),
					completedAt: new Date(),
				});
			} catch (error) {
				await this.deps.db.insert(aiGenerations).values({
					organizationId,
					kind: "triage",
					status: "failed",
					model: model.id,
					input,
					errorCode: isAiError(error) ? error.kind : "internal",
					errorMessage: error instanceof Error ? error.message.slice(0, 1000) : String(error),
					durationMs: Math.round(performance.now() - started),
					completedAt: new Date(),
				});
				// Retryable (rate limit, outage, malformed answer): BullMQ retries the job, which
				// resumes with what is still untriaged. A refusal would repeat: mark the batch
				// triaged without a score so it is not paid for again and again.
				if (!isAiError(error) || error.retryable) throw error;
				log.warn({ err: error }, "triage batch refused; stored without a score");
				verdicts = [];
			}

			const byId = new Map(verdicts.map((v) => [v.id, v]));
			await this.deps.db.transaction(async (tx) => {
				const now = new Date();
				for (const item of batch) {
					const v = byId.get(item.id);
					// An item the model skipped is marked triaged without a score, so the
					// planner does not buy the same answer again every ten minutes.
					await tx
						.update(engagementItems)
						.set({
							relevance: v?.relevance ?? null,
							relevanceReason: v?.reason ?? null,
							sentiment: v?.sentiment ?? null,
							triagedAt: now,
						})
						.where(eq(engagementItems.id, item.id));
				}
			});
			triaged += batch.length;
		}
		return { triaged };
	}

	private async brandContext(orgId: string): Promise<BrandContext | null> {
		const [row] = await this.deps.db
			.select()
			.from(brandProfiles)
			.where(eq(brandProfiles.organizationId, orgId))
			.limit(1);
		if (row) {
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
		// No profile yet: the organization's name is still better than nothing.
		const [org] = await this.deps.db
			.select({ name: organizations.name })
			.from(organizations)
			.where(eq(organizations.id, orgId))
			.limit(1);
		return org
			? {
					brandName: org.name,
					description: "",
					audience: "",
					voice: "",
					keywords: [],
					avoid: [],
					examplePosts: [],
				}
			: null;
	}

	// ── internals ───────────────────────────────────────────────────────────────

	private async loadChannel(
		channelId: string,
	): Promise<
		Skipped | { channel: ChannelRow; provider: SocialProvider; engagement: EngagementSupport }
	> {
		const [row] = await this.deps.db
			.select({ channel: channels, orgDeletedAt: organizations.deletedAt })
			.from(channels)
			.innerJoin(organizations, eq(organizations.id, channels.organizationId))
			.where(eq(channels.id, channelId))
			.limit(1);
		// Checked again here: a job can wait while the channel is disconnected or revoked.
		if (!row || row.orgDeletedAt) return { skipped: "channel_missing" };
		if (row.channel.status !== "active") return { skipped: `channel_${row.channel.status}` };
		const provider = this.deps.providers.get(row.channel.provider);
		if (!provider?.isConfigured() || !provider.engagement) return { skipped: "unsupported" };
		return { channel: row.channel, provider, engagement: provider.engagement };
	}

	/**
	 * One platform read with the analytics rules: spend from the provider's inbox budget
	 * first, and on a 401/403 refresh the token once (through ChannelTokens, the same
	 * locked path publishing uses) and ask again.
	 */
	private async call<T>(
		channel: ChannelRow,
		provider: SocialProvider,
		fn: (ctx: ChannelContext) => Promise<T>,
	): Promise<T> {
		let refreshed = false;
		for (;;) {
			const waitMs = await this.deps.budget.take(provider.id);
			if (waitMs > 0) throw new CallBudgetExhausted(provider.id, waitMs);
			try {
				return await fn({
					externalId: channel.externalId,
					metadata: channel.metadata,
					accessToken: await this.deps.tokens.getAccessToken(channel.id, {
						forceRefresh: refreshed,
					}),
					logger: this.deps.logger.child({ channelId: channel.id }),
				});
			} catch (error) {
				if (!refreshed && isProviderError(error) && error.kind === "auth") {
					refreshed = true;
					continue;
				}
				throw error;
			}
		}
	}

	/**
	 * Failures that end the run quietly; everything else propagates so BullMQ retries
	 * with backoff (reads are safe to repeat, and stored items dedupe).
	 */
	private handled(error: unknown, log: Logger): Skipped | "skip_batch" | null {
		if (error instanceof ChannelNeedsReauthError) {
			// ChannelTokens already flagged the channel — publishing would have too.
			return { skipped: "needs_reauth" };
		}
		if (!isProviderError(error)) return null;
		if (error.kind === "auth") {
			// Still refused after a refresh. Not flagged: usually a missing inbox scope while
			// publishing works, and flagging would stop publishing.
			log.warn({ err: error }, "inbox access refused after token refresh");
			return { skipped: "auth" };
		}
		if (error.kind === "invalid_request") {
			log.warn({ err: error }, "platform rejected the inbox request");
			return "skip_batch";
		}
		return null;
	}
}
