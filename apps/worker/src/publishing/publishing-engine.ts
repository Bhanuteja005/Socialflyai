import type { Logger } from "@socialfly/core/logger";
import { getMeter } from "@socialfly/core/telemetry";
import type { Database } from "@socialfly/db";
import {
	type ChannelContext,
	isProviderError,
	type ProviderRegistry,
	type PublishOutcome,
	type SocialProvider,
	validateForProvider,
} from "@socialfly/integrations";
import type { JobProducer, PublishJob, PublishStatusJob } from "@socialfly/queue";
import { ChannelNeedsReauthError, type ChannelTokens } from "#src/channels/channel-tokens.ts";
import { loadPublishContext, type TargetRow } from "./publish-input.ts";
import { decide } from "./retry-policy.ts";
import type { TargetState } from "./target-state.ts";

/** ~30 minutes of polling at the adapters' usual 10–20s cadence. */
const MAX_STATUS_CHECKS = 120;

export type EngineDeps = {
	db: Database;
	providers: ProviderRegistry;
	tokens: ChannelTokens;
	state: TargetState;
	jobs: JobProducer;
	logger: Logger;
	publicMediaUrl: string;
};

const meter = getMeter("publishing");
const outcomes = meter.createCounter("socialfly.publish.outcomes", {
	description: "Publish attempts by provider and outcome",
});
const duration = meter.createHistogram("socialfly.publish.duration", {
	unit: "ms",
	description: "Time spent in the provider's publish call",
});

/**
 * Turns a due target into a published post, exactly once.
 *
 * The invariants, in order of importance:
 *  1. Never publish twice. Ownership is taken with a conditional UPDATE (claim);
 *     a mutating call whose outcome is unknown becomes `unconfirmed`, never retried.
 *  2. Never lose a post. Every failure path ends in a terminal state the user sees
 *     (failed/unconfirmed) or a scheduled retry.
 *  3. Publish current content. Content and media are read at publish time.
 */
export class PublishingEngine {
	constructor(private readonly deps: EngineDeps) {}

	async publish(job: PublishJob): Promise<void> {
		const { state, logger } = this.deps;
		const target = await state.claim(job.targetId, job.scheduleVersion);
		if (!target) {
			// Canceled, rescheduled (newer version), or another job already won the claim.
			logger.debug(
				{ targetId: job.targetId, version: job.scheduleVersion },
				"stale publish job skipped",
			);
			return;
		}
		const log = logger.child({
			targetId: target.id,
			postId: target.postId,
			attempt: target.attempts,
		});

		const { post, channel, input } = await loadPublishContext(
			this.deps.db,
			target,
			this.deps.publicMediaUrl,
		);
		if (!post || post.deletedAt)
			return state.failed(target, "post_deleted", "The post was deleted");
		if (!channel) return state.failed(target, "channel_missing", "The channel no longer exists");
		const provider = this.deps.providers.get(channel.provider);
		if (!provider)
			return state.failed(
				target,
				"provider_unsupported",
				`${channel.provider} is no longer supported`,
			);

		// Re-validate: content, media or the platform's rules may have changed since scheduling.
		const problems = validateForProvider(provider, input);
		if (problems.length > 0) return state.failed(target, "invalid_content", problems.join("; "));
		const settings = provider.settingsSchema.parse(input.settings);

		let sent = false;
		let alreadyRefreshed = false;
		for (;;) {
			try {
				const ctx = await this.channelContext(channel, { forceRefresh: alreadyRefreshed });
				const started = performance.now();
				sent = true;
				const outcome = await provider.publish(ctx, { ...input, settings });
				duration.record(performance.now() - started, { provider: provider.id });
				return await this.applyOutcome(target, provider, outcome, 0);
			} catch (error) {
				if (error instanceof ChannelNeedsReauthError) {
					outcomes.add(1, { provider: provider.id, outcome: "needs_reauth" });
					return state.failed(target, "channel_needs_reauth", error.message);
				}
				const decision = decide(error, { attempt: target.attempts, sent, alreadyRefreshed });
				log.warn({ err: error, decision: decision.action }, "publish attempt failed");

				if (decision.action === "refresh_token") {
					// 401/403 means the request was refused, so re-sending after a refresh is safe.
					alreadyRefreshed = true;
					sent = false;
					continue;
				}
				return this.applyDecision(target, provider, decision);
			}
		}
	}

	/** Polls a `processing` target (async platform media) until it resolves. */
	async checkStatus(job: PublishStatusJob): Promise<void> {
		const { db, state, logger } = this.deps;
		const [target] = await db.query.postTargets.findMany({
			where: (t, { and, eq }) => and(eq(t.id, job.targetId), eq(t.status, "processing")),
			limit: 1,
		});
		if (!target?.pendingData) return;
		const { channel } = await loadPublishContext(db, target, this.deps.publicMediaUrl);
		const provider = channel ? this.deps.providers.get(channel.provider) : undefined;
		if (!channel || !provider?.checkStatus) {
			return state.unconfirmed(target, "Could not check processing status");
		}

		try {
			const ctx = await this.channelContext(channel, {});
			const outcome = await provider.checkStatus(ctx, target.pendingData);
			return await this.applyOutcome(target, provider, outcome, job.check + 1);
		} catch (error) {
			if (error instanceof ChannelNeedsReauthError)
				return state.failed(target, "channel_needs_reauth", error.message);
			if (isProviderError(error) && (error.kind === "transient" || error.kind === "rate_limited")) {
				logger.warn({ err: error, targetId: target.id }, "status check failed — will check again");
				return this.pollAgain(target, job.check + 1, error.details.retryAfterMs ?? 30_000);
			}
			// checkStatus may perform the final publish call (e.g. IG media_publish):
			// anything else is treated as an unknown outcome rather than retried.
			const decision = decide(error, {
				attempt: Number.POSITIVE_INFINITY,
				sent: true,
				alreadyRefreshed: true,
			});
			return this.applyDecision(target, provider, decision);
		}
	}

	// ── internals ──────────────────────────────────────────────────────────────

	private async applyOutcome(
		target: TargetRow,
		provider: SocialProvider,
		outcome: PublishOutcome,
		check: number,
	) {
		if (outcome.status === "published") {
			outcomes.add(1, { provider: provider.id, outcome: "published" });
			this.deps.logger.info(
				{ targetId: target.id, provider: provider.id, url: outcome.url },
				"published",
			);
			return this.deps.state.published(target, outcome);
		}
		if (check === 0) await this.deps.state.processing(target, outcome.pendingData);
		else await this.deps.state.updatePending(target.id, outcome.pendingData);
		return this.pollAgain(target, check, outcome.pollAfterMs);
	}

	private async pollAgain(target: TargetRow, check: number, delayMs: number) {
		if (check >= MAX_STATUS_CHECKS) {
			outcomes.add(1, { outcome: "processing_timeout" });
			return this.deps.state.failed(
				target,
				"processing_timeout",
				"The platform did not finish processing the media in time",
			);
		}
		await this.deps.jobs.scheduleStatusCheck(
			{ targetId: target.id, organizationId: target.organizationId, check },
			delayMs,
		);
	}

	private async applyDecision(
		target: TargetRow,
		provider: SocialProvider,
		decision: ReturnType<typeof decide>,
	): Promise<void> {
		const { state, jobs } = this.deps;
		switch (decision.action) {
			case "retry": {
				outcomes.add(1, { provider: provider.id, outcome: "retry" });
				const runAt = new Date(Date.now() + decision.delayMs);
				const version = await state.rescheduleForRetry(target, runAt, decision.reason);
				await jobs.schedulePublish(
					provider.id,
					{ targetId: target.id, organizationId: target.organizationId, scheduleVersion: version },
					runAt,
				);
				return;
			}
			case "fail":
				outcomes.add(1, { provider: provider.id, outcome: "failed" });
				if (decision.code === "channel_needs_reauth") {
					await this.deps.tokens.markNeedsReauth(target.channelId, decision.message);
				}
				return state.failed(target, decision.code, decision.message);
			case "unconfirmed":
				outcomes.add(1, { provider: provider.id, outcome: "unconfirmed" });
				return state.unconfirmed(target, decision.message);
			case "refresh_token":
				// Only reachable from checkStatus, where refresh-and-resend is not safe.
				return state.unconfirmed(target, "Lost access while the platform was processing the post");
		}
	}

	private async channelContext(
		channel: { id: string; externalId: string; metadata: Record<string, unknown> },
		opts: { forceRefresh?: boolean },
	): Promise<ChannelContext> {
		return {
			externalId: channel.externalId,
			metadata: channel.metadata,
			accessToken: await this.deps.tokens.getAccessToken(channel.id, opts),
			logger: this.deps.logger.child({ channelId: channel.id }),
		};
	}
}
