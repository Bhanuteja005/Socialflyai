import { Redis, type RedisOptions } from "ioredis";
import { tooManyRequests } from "./errors";

export type { Redis };

/**
 * One Redis client factory for cache, rate limiting and OAuth state.
 * BullMQ creates its own connections (it needs `maxRetriesPerRequest: null`, which
 * is wrong for request-path commands) — see @socialfly/queue.
 */
export const createRedis = (url: string, options: RedisOptions = {}) =>
	new Redis(url, {
		maxRetriesPerRequest: 2,
		enableAutoPipelining: true,
		lazyConnect: false,
		...options,
	});

/**
 * Fixed-window rate limiter (INCR + EXPIRE in one MULTI).
 * Throws AppError(429) with Retry-After when the window is exhausted.
 */
export async function enforceRateLimit(
	redis: Redis,
	key: string,
	limit: number,
	windowSeconds: number,
): Promise<void> {
	const bucket = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
	const [[, count]] = (await redis.multi().incr(bucket).expire(bucket, windowSeconds).exec()) as [
		[Error | null, number],
	];
	if (count > limit) {
		throw tooManyRequests(windowSeconds - (Math.floor(Date.now() / 1000) % windowSeconds));
	}
}
