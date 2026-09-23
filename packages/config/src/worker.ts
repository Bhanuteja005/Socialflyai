import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { aiEnv } from "./ai";
import { baseServerEnv } from "./base";
import { integrationsEnv } from "./integrations";
import { boolFlag, csv, port } from "./shared";
import { storageEnv } from "./storage";

export const workerEnv = createEnv({
	server: {
		...baseServerEnv,
		...integrationsEnv,
		...storageEnv,
		...aiEnv,
		OTEL_SERVICE_NAME: z.string().default("socialfly-worker"),
		/** Serves /health, /ready and (outside production) Bull Board. */
		WORKER_PORT: port(4500),
		/** Queues this process consumes; empty = all. Lets prod put heavy queues on their own replicas. */
		WORKER_QUEUES: csv(""),
		BULL_BOARD_ENABLED: boolFlag(process.env.NODE_ENV !== "production"),
		/** Parallel jobs per publish queue (per replica); each queue is also rate limited per platform. */
		PUBLISH_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),
		/** Parallel AI media jobs (image generation, carousel rendering) per replica. */
		AI_MEDIA_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(2),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});

export type WorkerEnv = typeof workerEnv;
