import { type JobsOptions, Queue } from "bullmq";
import type { Redis } from "ioredis";
import { QUEUE_PREFIX } from "./connection";
import {
	type AiMediaJob,
	type AnalyticsJob,
	jobIds,
	type PublishJob,
	type PublishStatusJob,
	publishQueueName,
	QUEUES,
	type ResearchJob,
	type TokenRefreshJob,
	WEEK_MS,
} from "./jobs";

/**
 * Publish jobs get ONE attempt at the BullMQ level. Retries for publishing are
 * decided by the worker's publishing engine, which knows whether the platform
 * could already have accepted the post (see apps/worker/src/publishing). A blind
 * queue-level retry cannot know that and would double-post.
 */
const publishJobDefaults: JobsOptions = {
	attempts: 1,
	removeOnComplete: { age: 7 * 24 * 3600, count: 10_000 },
	removeOnFail: { age: 30 * 24 * 3600 },
};

/**
 * Analytics calls are reads, so a queue-level retry is safe. Three attempts with
 * backoff ride out a platform's throttling or a blip; after that the next planner
 * run picks the channel up again anyway.
 */
const analyticsJobDefaults: JobsOptions = {
	attempts: 3,
	backoff: { type: "exponential", delay: 60_000 },
	removeOnComplete: { age: 24 * 3600 },
	removeOnFail: { age: 7 * 24 * 3600 },
};

/**
 * Research jobs make paid calls, but each processor resumes instead of repeating:
 * a crawl whose analysis failed re-uses its stored pages, a visibility run skips
 * prompt×engine pairs already answered, an SEO refresh skips keywords already
 * updated. So a second attempt costs only what the first one did not finish.
 */
const researchJobDefaults: JobsOptions = {
	attempts: 2,
	backoff: { type: "exponential", delay: 30_000 },
	removeOnComplete: { age: 24 * 3600 },
	removeOnFail: { age: 7 * 24 * 3600 },
};

/**
 * The API-side handle for enqueueing work. Queues are created lazily and cached;
 * `close()` on shutdown.
 */
export class JobProducer {
	private readonly queues = new Map<string, Queue>();

	constructor(private readonly connection: Redis) {}

	private queue(name: string) {
		let q = this.queues.get(name);
		if (!q) {
			q = new Queue(name, { connection: this.connection, prefix: QUEUE_PREFIX });
			this.queues.set(name, q);
		}
		return q;
	}

	/** Enqueue (or re-enqueue) a target to publish at `runAt`. Idempotent per (target, version). */
	async schedulePublish(provider: string, job: PublishJob, runAt: Date | null) {
		const delay = runAt ? Math.max(0, runAt.getTime() - Date.now()) : 0;
		await this.queue(publishQueueName(provider)).add("publish", job, {
			...publishJobDefaults,
			jobId: jobIds.publish(job.targetId, job.scheduleVersion),
			delay,
		});
	}

	/**
	 * Safety-net enqueue used by the worker's sweep. A deterministic job id makes
	 * `add` a no-op when a job with that id still exists — including a FAILED one
	 * kept for inspection, which would block recovery forever. So finished copies
	 * are removed first; a waiting/delayed/active copy is left alone.
	 */
	async ensurePublish(provider: string, job: PublishJob, runAt: Date | null) {
		const q = this.queue(publishQueueName(provider));
		const existing = await q.getJob(jobIds.publish(job.targetId, job.scheduleVersion));
		if (existing) {
			const state = await existing.getState();
			if (state !== "completed" && state !== "failed") return false;
			await existing.remove();
		}
		await this.schedulePublish(provider, job, runAt);
		return true;
	}

	/** Remove a pending publish job (reschedule or cancel). Missing jobs are fine. */
	async cancelPublish(provider: string, targetId: string, scheduleVersion: number) {
		const q = this.queue(publishQueueName(provider));
		const job = await q.getJob(jobIds.publish(targetId, scheduleVersion));
		// A job that is already active cannot be removed; the worker re-checks the
		// target's status before sending, so a canceled target is skipped anyway.
		if (job && !(await job.isActive())) await job.remove();
	}

	async scheduleStatusCheck(job: PublishStatusJob, delayMs: number) {
		await this.queue(QUEUES.publishStatus).add("check", job, {
			jobId: jobIds.publishStatus(job.targetId, job.check),
			delay: delayMs,
			attempts: 3,
			backoff: { type: "exponential", delay: 10_000 },
			removeOnComplete: { age: 24 * 3600 },
			removeOnFail: { age: 7 * 24 * 3600 },
		});
	}

	async scheduleTokenRefresh(job: TokenRefreshJob, expiresAt: Date) {
		// Refresh 10 minutes early; if that is already past, refresh now.
		const delay = Math.max(0, expiresAt.getTime() - Date.now() - 10 * 60_000);
		await this.queue(QUEUES.tokenRefresh).add("refresh", job, {
			jobId: jobIds.tokenRefresh(job.channelId, Math.floor(expiresAt.getTime() / 1000)),
			delay,
			attempts: 5,
			backoff: { type: "exponential", delay: 60_000 },
			removeOnComplete: { age: 24 * 3600 },
			removeOnFail: { age: 7 * 24 * 3600 },
		});
	}

	/**
	 * AI media is paid per call, so a blind retry spends money twice. Two attempts
	 * cover a worker crash or a transient provider error; the worker records the
	 * cost of each attempt, so the budget stays accurate either way.
	 */
	async enqueueAiMedia(job: AiMediaJob) {
		await this.queue(QUEUES.aiMedia).add("generate", job, {
			jobId: jobIds.aiMedia(job.generationId),
			attempts: 2,
			backoff: { type: "exponential", delay: 15_000 },
			removeOnComplete: { age: 24 * 3600 },
			removeOnFail: { age: 7 * 24 * 3600 },
		});
	}

	/**
	 * Planner → collect jobs. The bucketed id is a no-op while the previous job of
	 * the same bucket is retained (waiting, active or completed), which is what
	 * limits a channel to one posts collection per hour and one account collection
	 * per UTC day, whatever the planner cadence or replica count.
	 */
	async enqueueAnalyticsPosts(channelId: string, now = Date.now()) {
		await this.queue(QUEUES.analytics).add(
			"collect-posts",
			{ task: "collect-posts", channelId } satisfies AnalyticsJob,
			{
				...analyticsJobDefaults,
				jobId: jobIds.analyticsPosts(channelId, Math.floor(now / 3600_000)),
			},
		);
	}

	async enqueueAnalyticsAccount(channelId: string, now = Date.now()) {
		await this.queue(QUEUES.analytics).add(
			"collect-account",
			{ task: "collect-account", channelId } satisfies AnalyticsJob,
			{
				...analyticsJobDefaults,
				jobId: jobIds.analyticsAccount(channelId, new Date(now).toISOString().slice(0, 10)),
				// Kept past the end of the UTC day so a replan later that day stays a no-op.
				removeOnComplete: { age: 26 * 3600 },
			},
		);
	}

	/**
	 * "Refresh now" from the API: forced post collection plus account numbers for
	 * each channel, immediately. Returns the number of collect jobs queued (bucketed
	 * ids collapse a repeat within the same 10 minutes onto the same jobs).
	 */
	async refreshAnalytics(
		channels: { channelId: string; account: boolean }[],
		now = Date.now(),
	): Promise<number> {
		const bucket = Math.floor(now / 600_000);
		const q = this.queue(QUEUES.analytics);
		const added = await q.addBulk(
			channels.flatMap(({ channelId, account }) => [
				{
					name: "collect-posts",
					data: { task: "collect-posts", channelId, force: true } satisfies AnalyticsJob,
					opts: {
						...analyticsJobDefaults,
						jobId: jobIds.analyticsRefresh("posts", channelId, bucket),
					},
				},
				...(account
					? [
							{
								name: "collect-account",
								data: { task: "collect-account", channelId } satisfies AnalyticsJob,
								opts: {
									...analyticsJobDefaults,
									jobId: jobIds.analyticsRefresh("account", channelId, bucket),
								},
							},
						]
					: []),
			]),
		);
		return added.length;
	}

	/** Crawl + analyse one research run (the API inserted it as `pending`). */
	async enqueueResearchCrawl(runId: string) {
		await this.queue(QUEUES.research).add("crawl", { task: "crawl", runId } satisfies ResearchJob, {
			...researchJobDefaults,
			jobId: jobIds.researchCrawl(runId),
		});
	}

	/** AI-visibility checks for one organization: weekly from the planner, or forced by a user. */
	async enqueueVisibilityCheck(
		organizationId: string,
		opts: { force?: boolean; now?: number } = {},
	) {
		await this.enqueueResearchOrg("visibility", organizationId, opts);
	}

	/** Keyword metrics and rankings for one organization: weekly, or forced after keywords are added. */
	async enqueueSeoRefresh(organizationId: string, opts: { force?: boolean; now?: number } = {}) {
		await this.enqueueResearchOrg("seo", organizationId, opts);
	}

	private async enqueueResearchOrg(
		kind: "visibility" | "seo",
		organizationId: string,
		{ force = false, now = Date.now() }: { force?: boolean; now?: number },
	) {
		const data = {
			task: kind === "visibility" ? "visibility-org" : "seo-refresh",
			organizationId,
			...(force ? { force: true } : {}),
		} satisfies ResearchJob;
		await this.queue(QUEUES.research).add(data.task, data, {
			...researchJobDefaults,
			jobId: force
				? jobIds.researchOrgForced(kind, organizationId, Math.floor(now / 600_000))
				: jobIds.researchOrg(kind, organizationId, Math.floor(now / WEEK_MS)),
			// A scheduled job is kept past its week so a late replan within it stays a no-op.
			...(force ? {} : { removeOnComplete: { age: 8 * 24 * 3600 } }),
		});
	}

	/** Readiness probe: the queue Redis answers. */
	async ping() {
		await this.connection.ping();
	}

	async close() {
		await Promise.all([...this.queues.values()].map((q) => q.close()));
	}
}
