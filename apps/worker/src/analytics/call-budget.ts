import type { createQueueConnection } from "@socialfly/queue";

type Redis = ReturnType<typeof createQueueConnection>;

export interface CallBudget {
	/** Takes one call from the provider's budget: 0 when allowed, else ms until the window resets. */
	take(provider: string): Promise<number>;
}

/**
 * Per-provider analytics call budget, shared by every worker replica (fixed window
 * in Redis).
 *
 * Why not a BullMQ limiter: that limits a whole QUEUE, and analytics is one queue for
 * every platform — one busy platform would stall the others. Why so low (30 calls a
 * minute per platform by default): platforms meter the APP, not the endpoint, and
 * publishing spends the same allowance. Numbers that land a few minutes late cost
 * nothing; a throttled or suspended app cannot publish at all, so analytics must
 * always leave most of the budget to publishing.
 */
export class RedisCallBudget implements CallBudget {
	constructor(
		private readonly redis: Redis,
		private readonly limit = { max: 30, windowMs: 60_000 },
		/** Separate budgets per feature (analytics, engagement), each well below publishing's share. */
		private readonly namespace = "analytics",
	) {}

	async take(provider: string): Promise<number> {
		const now = Date.now();
		const window = Math.floor(now / this.limit.windowMs);
		const key = `sf:${this.namespace}:budget:${provider}:${window}`;
		const [[, count]] = (await this.redis
			.multi()
			.incr(key)
			.pexpire(key, this.limit.windowMs)
			.exec()) as [[Error | null, number]];
		if (count <= this.limit.max) return 0;
		return (window + 1) * this.limit.windowMs - now;
	}
}

/** Thrown when a provider's budget is spent: the job is delayed, not failed. */
export class CallBudgetExhausted extends Error {
	override readonly name = "CallBudgetExhausted";

	constructor(
		readonly provider: string,
		readonly retryInMs: number,
	) {
		super(`Call budget for ${provider} is spent for this window`);
	}
}
