import "./instrumentation.ts";
import { workerEnv as env } from "@socialfly/config";
import { shutdownTelemetry } from "@socialfly/core/telemetry";
import { database, jobs, logger, queueConnection } from "#src/infrastructure/index.ts";
import { createServer } from "#src/server.ts";
import { startWorkers } from "#src/workers.ts";

const { workers, queues } = await startWorkers();
const server = Bun.serve({ port: env.WORKER_PORT, fetch: createServer(queues).fetch });
logger.info({ port: server.port, bullBoard: env.BULL_BOARD_ENABLED }, "worker ready");

let shuttingDown = false;
async function shutdown(signal: string) {
	if (shuttingDown) return;
	shuttingDown = true;
	logger.info({ signal }, "shutting down — finishing in-flight jobs");
	// worker.close() waits for active jobs to finish, so a deploy never kills a
	// publish mid-request (which would leave it `unconfirmed`). Container Apps
	// gives 30s by default; publish calls are bounded well under that.
	await Promise.allSettled(workers.map((w) => w.close()));
	await server.stop();
	await Promise.allSettled([...queues.map((q) => q.close()), jobs.close()]);
	await queueConnection.quit();
	await database.close();
	await shutdownTelemetry();
	process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
