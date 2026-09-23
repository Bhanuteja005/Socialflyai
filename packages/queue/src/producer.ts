import { type JobsOptions, Queue } from "bullmq";
import type { Redis } from "ioredis";
import { QUEUE_PREFIX } from "./connection";
import {
	jobIds,
	type PublishJob,
	type PublishStatusJob,
	publishQueueName,
	QUEUES,
	type TokenRefreshJob,
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

	/** Readiness probe: the queue Redis answers. */
	async ping() {
		await this.connection.ping();
	}

	async close() {
		await Promise.all([...this.queues.values()].map((q) => q.close()));
	}
}
