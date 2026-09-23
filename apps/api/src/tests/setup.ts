import { afterAll } from "bun:test";
import { migrateTestDatabase } from "@socialfly/db/testing";

// Must run before any module reads the env: bunfig.toml preloads this file.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://socialfly:socialfly@localhost:5434/socialfly_test";
// Redis db 1: tests never touch dev queues or OAuth state.
process.env.REDIS_URL ??= "redis://localhost:6380/1";
process.env.OTEL_SDK_DISABLED = "true";
process.env.LOG_LEVEL = "fatal";
process.env.WEB_URL = "http://localhost:3000";
// Enough to make LinkedIn "configured" so connect/validation paths run. Never called for real.
process.env.LINKEDIN_CLIENT_ID = "test-client";
process.env.LINKEDIN_CLIENT_SECRET = "test-secret";

await migrateTestDatabase(process.env.DATABASE_URL);

// Every test file runs in this one process and shares the infrastructure singletons, so
// they are closed once after the whole run — a per-file afterAll would close them under
// the files that run after it. Imported lazily: the env above must be set first.
afterAll(async () => {
	const { database, jobs, queueConnection, queueStats, redis } = await import(
		"#src/infrastructure/index.ts"
	);
	await Promise.all([jobs.close(), queueStats.close()]);
	await Promise.all([queueConnection.quit(), redis.quit(), database.close()]);
});
