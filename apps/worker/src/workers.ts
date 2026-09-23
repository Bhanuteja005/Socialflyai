import { workerEnv as env } from "@socialfly/config";
import {
	aiMediaJobSchema,
	type MaintenanceJob,
	maintenanceJobSchema,
	publishJobSchema,
	publishQueueName,
	publishStatusJobSchema,
	QUEUE_PREFIX,
	QUEUES,
	tokenRefreshJobSchema,
} from "@socialfly/queue";
import { type Processor, Queue, Worker } from "bullmq";
import { ChannelNeedsReauthError } from "#src/channels/channel-tokens.ts";
import {
	aiMedia,
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
