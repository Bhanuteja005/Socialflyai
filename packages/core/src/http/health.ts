import { Hono } from "hono";

export type HealthCheck = () => Promise<unknown>;

export type HealthOptions = {
	service: string;
	version: string;
	/** Dependencies that must answer for the service to take traffic (db, redis, ...). */
	checks: Record<string, HealthCheck>;
	timeoutMs?: number;
};

/**
 * Two probes with different meanings — the reference repo returned a static "ok"
 * from both, so a service with a dead database still passed its deploy smoke test.
 *
 *   GET /health  liveness: the process is up and the event loop answers. Never
 *                touches dependencies (a DB blip must not make the orchestrator
 *                restart every replica at once).
 *   GET /ready   readiness: every dependency answered within the timeout. The
 *                deploy smoke test and the load balancer use this one.
 */
export function healthRoutes({ service, version, checks, timeoutMs = 2000 }: HealthOptions) {
	const app = new Hono();
	const startedAt = Date.now();

	app.get("/health", (ctx) =>
		ctx.json({
			status: "ok",
			service,
			version,
			uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
		}),
	);

	app.get("/ready", async (ctx) => {
		const results = await Promise.all(
			Object.entries(checks).map(async ([name, check]) => {
				const started = performance.now();
				try {
					await Promise.race([
						check(),
						new Promise((_, reject) =>
							setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs),
						),
					]);
					return [name, { ok: true, latencyMs: Math.round(performance.now() - started) }] as const;
				} catch (error) {
					return [
						name,
						{ ok: false, error: error instanceof Error ? error.message : String(error) },
					] as const;
				}
			}),
		);
		const ready = results.every(([, r]) => r.ok);
		return ctx.json(
			{
				status: ready ? "ready" : "degraded",
				service,
				version,
				checks: Object.fromEntries(results),
			},
			ready ? 200 : 503,
		);
	});

	app.get("/version", (ctx) => ctx.json({ service, version }));

	return app;
}
