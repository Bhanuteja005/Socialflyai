import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HonoAdapter } from "@bull-board/hono";
import { workerEnv as env } from "@socialfly/config";
import { createErrorHandler, healthRoutes } from "@socialfly/core/http";
import type { Queue } from "bullmq";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { database, logger, queueConnection } from "#src/infrastructure/index.ts";

/**
 * The worker's only HTTP surface: probes for the orchestrator, and (outside
 * production, or when explicitly enabled) Bull Board to inspect and replay jobs.
 * It is never exposed publicly — Container Apps keeps the worker ingress internal.
 */
export function createServer(queues: Queue[]) {
	const app = new Hono().route(
		"/",
		healthRoutes({
			service: "worker",
			version: env.APP_VERSION,
			checks: { postgres: database.ping, redis: () => queueConnection.ping() },
		}),
	);

	if (env.BULL_BOARD_ENABLED) {
		const board = new HonoAdapter(serveStatic);
		createBullBoard({ queues: queues.map((q) => new BullMQAdapter(q)), serverAdapter: board });
		board.setBasePath("/queues");
		app.route("/queues", board.registerPlugin());
	}

	app.onError(createErrorHandler(logger));
	return app;
}
