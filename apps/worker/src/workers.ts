import { workerEnv as env } from "@socialfly/config";
import {
	aiMediaJobSchema,
	analyticsJobSchema,
	type MaintenanceJob,
	maintenanceJobSchema,
	publishJobSchema,
	publishQueueName,
	publishStatusJobSchema,
	QUEUE_PREFIX,
	QUEUES,
	tokenRefreshJobSchema,
} from "@socialfly/queue";
import { DelayedError, type Processor, Queue, Worker } from "bullmq";
import { CallBudgetExhausted } from "#src/analytics/call-budget.ts";
import { ChannelNeedsReauthError } from "#src/channels/channel-tokens.ts";
import {
	aiMedia,
	analytics,
	channelTokens,
	database,
	engine,
	jobs,
	logger,
	maintenance,
	providers,
	queueConnection,
} from "#src/infrastructure/index.ts";

/** Maintenance cadence. Cheap indexed queries — safe to run every minute. */
const SCHEDULES: { id: MaintenanceJob["task"]; everyMs: number }[] = [
	{ id: "sweep-due-targets", everyMs: 60_000 },
	{ id: "recover-stuck-targets", everyMs: 5 * 60_000 },
	{ id: "schedule-token-refresh", everyMs: 60 * 60_000 },
];

/**
 * The planner is a few indexed queries; the 15-minute cadence only bounds how late
 * a due collection starts (the shortest collection interval is an hour).
 */
const ANALYTICS_PLAN_EVERY_MS = 15 * 60_000;
/** Low on purpose: each job is a platform read that competes with publishing for budget. */
const ANALYTICS_CONCURRENCY = 2;

const wanted = (queue: string) =>
	env.WORKER_QUEUES.length === 0 || env.WORKER_QUEUES.includes(queue);

export async function startWorkers() {
	const workers: Worker[] = [];
	const queues: Queue[] = [];

	const start = (
		name: string,
		processor: Processor,
		options: Partial<ConstructorParameters<typeof Worker>[2]> = {},
	) => {
		if (!wanted(name)) return;
		const worker = new Worker(name, processor, {
			connection: queueConnection.duplicate(),
			prefix: QUEUE_PREFIX,
			concurrency: 5,
			...options,
		});
		worker.on("failed", (job, err) =>
			logger.error({ err, queue: name, jobId: job?.id, attempts: job?.attemptsMade }, "job failed"),
		);
		worker.on("error", (err) => logger.error({ err, queue: name }, "worker error"));
		workers.push(worker);
		queues.push(new Queue(name, { connection: queueConnection, prefix: QUEUE_PREFIX }));
	};

	// One publish queue per configured platform, rate limited to that platform's budget.
	for (const provider of providers.available()) {
		start(
			publishQueueName(provider.id),
			async (job) => engine.publish(publishJobSchema.parse(job.data)),
			{
				concurrency: env.PUBLISH_CONCURRENCY,
				limiter: {
					max: provider.publishRateLimit.max,
					duration: provider.publishRateLimit.durationMs,
				},
			},
		);
	}

	start(QUEUES.publishStatus, async (job) =>
		engine.checkStatus(publishStatusJobSchema.parse(job.data)),
	);

	start(QUEUES.tokenRefresh, async (job) => {
		const { channelId } = tokenRefreshJobSchema.parse(job.data);
		try {
			await channelTokens.getAccessToken(channelId, { forceRefresh: true });
		} catch (error) {
			if (error instanceof ChannelNeedsReauthError) return; // recorded on the channel; nothing to retry
			throw error; // transient: BullMQ retries with backoff
		}
		const [channel] = await database.db.query.channels.findMany({
			where: (c, { eq }) => eq(c.id, channelId),
			columns: { tokenExpiresAt: true },
			limit: 1,
		});
		if (channel?.tokenExpiresAt)
			await jobs.scheduleTokenRefresh({ channelId }, channel.tokenExpiresAt);
	});

	// Always started, even with no image keys: carousels render locally, and an image
	// job must still be consumed so its generation is marked `not_configured`.
	start(
		QUEUES.aiMedia,
		async (job) =>
			aiMedia.process(aiMediaJobSchema.parse(job.data), {
				attemptsMade: job.attemptsMade,
				maxAttempts: job.opts.attempts ?? 1,
			}),
		{
			concurrency: env.AI_MEDIA_CONCURRENCY,
			// A reel takes minutes (paid calls, then ffmpeg), and caption rendering is
			// synchronous WASM that can delay BullMQ's lock renewal timer. With the default
			// 30 s lock a healthy render could be declared stalled and handed to a second
			// worker. 10 minutes only delays recovery from a crashed worker, which the
			// status claim and maintenance timeout already make safe.
			lockDuration: 10 * 60_000,
		},
	);

	start(QUEUES.maintenance, async (job) => maintenance.run(maintenanceJobSchema.parse(job.data)), {
		concurrency: 1,
	});

	// Analytics reads share the platforms' rate limits with publishing, so they get a
	// small, separate concurrency and a per-provider call budget (see call-budget.ts).
	start(
		QUEUES.analytics,
		async (job, token) => {
			try {
				return await analytics.run(analyticsJobSchema.parse(job.data));
			} catch (error) {
				if (error instanceof CallBudgetExhausted) {
					// Budget spent: wait for the next window without using up a retry attempt.
					await job.moveToDelayed(Date.now() + error.retryInMs, token);
					throw new DelayedError();
				}
				throw error;
			}
		},
		{ concurrency: ANALYTICS_CONCURRENCY },
	);

	if (wanted(QUEUES.analytics)) {
		const q = new Queue(QUEUES.analytics, { connection: queueConnection, prefix: QUEUE_PREFIX });
		await q.upsertJobScheduler(
			"analytics-plan",
			{ every: ANALYTICS_PLAN_EVERY_MS },
			{ name: "plan", data: { task: "plan" } },
		);
		await q.close();
	}

	if (wanted(QUEUES.maintenance)) {
		const q = new Queue(QUEUES.maintenance, { connection: queueConnection, prefix: QUEUE_PREFIX });
		for (const s of SCHEDULES) {
			// Upsert is idempotent across replicas and restarts: one schedule per id.
			await q.upsertJobScheduler(s.id, { every: s.everyMs }, { name: s.id, data: { task: s.id } });
		}
		await q.close();
	}

	logger.info({ queues: workers.map((w) => w.name) }, "workers started");
	return { workers, queues };
}
