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
