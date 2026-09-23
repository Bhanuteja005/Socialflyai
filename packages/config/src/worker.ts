import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { baseServerEnv } from "./base";
import { integrationsEnv } from "./integrations";
import { boolFlag, csv, port } from "./shared";

export const workerEnv = createEnv({
	server: {
		...baseServerEnv,
		...integrationsEnv,
		OTEL_SERVICE_NAME: z.string().default("socialfly-worker"),
		/** Serves /health, /ready and (outside production) Bull Board. */
		WORKER_PORT: port(4500),
		/** Queues this process consumes; empty = all. Lets prod put heavy queues on their own replicas. */
		WORKER_QUEUES: csv(""),
		BULL_BOARD_ENABLED: boolFlag(process.env.NODE_ENV !== "production"),
		/** Public base URL of the media bucket — platforms fetch media from here. Must match the API's. */
		S3_PUBLIC_URL: z.string().default("http://localhost:9000/socialfly-media"),
		/** Parallel jobs per publish queue (per replica); each queue is also rate limited per platform. */
		PUBLISH_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});

export type WorkerEnv = typeof workerEnv;
