import "./instrumentation";
import { apiEnv as env } from "@socialfly/config";
import { shutdownTelemetry } from "@socialfly/core/telemetry";
import { app } from "#src/app.ts";
import { database, jobs, logger, redis } from "#src/infrastructure/index.ts";

const server = Bun.serve({ port: env.PORT, fetch: app.fetch, idleTimeout: 60 });
logger.info({ port: server.port }, "api listening");

let shuttingDown = false;
async function shutdown(signal: string) {
	if (shuttingDown) return;
	shuttingDown = true;
	logger.info({ signal }, "shutting down");
	// Stop accepting, drain in-flight requests, then release resources in reverse
	// order of acquisition. Telemetry last, so the shutdown itself is exported.
	await server.stop();
	await Promise.allSettled([jobs.close(), redis.quit(), database.close()]);
	await shutdownTelemetry();
	process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
