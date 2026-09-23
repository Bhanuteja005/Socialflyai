import { Redis } from "ioredis";

/**
 * BullMQ connections. Separate from the request-path Redis client in
 * @socialfly/core/redis because BullMQ's blocking commands need
 * `maxRetriesPerRequest: null` (retry forever) — the opposite of what an HTTP
 * request wants when Redis is down.
 */
export const createQueueConnection = (url: string) =>
	new Redis(url, { maxRetriesPerRequest: null, enableReadyCheck: false });

/** All SocialFly keys live under one prefix, so the Redis can be shared safely. */
export const QUEUE_PREFIX = "sf";
