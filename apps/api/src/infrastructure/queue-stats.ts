import { type createQueueConnection, QUEUE_PREFIX } from "@socialfly/queue";
import { Queue } from "bullmq";

type Redis = ReturnType<typeof createQueueConnection>;

export type QueueCounts = {
	name: string;
	waiting: number;
	active: number;
	delayed: number;
	failed: number;
	completed: number;
};

/**
 * Read-only view of BullMQ job counts for the admin console. Every queue shares one
 * connection and each Queue handle is created once and cached: a dashboard polling
 * every few seconds must not open a Redis connection per queue per request.
 */
export class QueueStats {
	private readonly queues = new Map<string, Queue>();

	constructor(
		private readonly connection: Redis,
		private readonly names: () => string[],
	) {}

	private queue(name: string) {
		let q = this.queues.get(name);
		if (!q) {
			q = new Queue(name, { connection: this.connection, prefix: QUEUE_PREFIX });
			this.queues.set(name, q);
		}
		return q;
	}

	async counts(): Promise<QueueCounts[]> {
		return Promise.all(
			this.names().map(async (name) => {
				const c = await this.queue(name).getJobCounts(
					"waiting",
					"active",
					"delayed",
					"failed",
					"completed",
				);
				return {
					name,
					waiting: c.waiting ?? 0,
					active: c.active ?? 0,
					delayed: c.delayed ?? 0,
					failed: c.failed ?? 0,
					completed: c.completed ?? 0,
				};
			}),
		);
	}

	/** Closes the Queue handles only; the shared connection is quit by its owner. */
	async close() {
		await Promise.all([...this.queues.values()].map((q) => q.close()));
	}
}
