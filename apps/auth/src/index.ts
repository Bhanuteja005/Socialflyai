import "./instrumentation";
import { authEnv as env } from "@socialfly/config";
import { shutdownTelemetry } from "@socialfly/core/telemetry";
import { app } from "#src/app.ts";
import { database, logger } from "#src/infrastructure/index.ts";

const server = Bun.serve({ port: env.PORT, fetch: app.fetch, idleTimeout: 30 });
logger.info({ port: server.port }, "auth service listening");

let shuttingDown = false;
async function shutdown(signal: string) {
	if (shuttingDown) return;
	shuttingDown = true;
	logger.info({ signal }, "shutting down");
	// Stop accepting, let in-flight requests finish, then release resources in
	// reverse order of acquisition. Telemetry last, so the shutdown itself is traced.
	await server.stop();
	await database.close();
	await shutdownTelemetry();
	process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
