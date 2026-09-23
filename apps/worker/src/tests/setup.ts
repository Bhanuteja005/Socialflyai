import { migrateTestDatabase } from "@socialfly/db/testing";

// Must run before any module reads the env: bunfig.toml preloads this file.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://socialfly:socialfly@localhost:5434/socialfly_test";
// Redis db 2: worker tests never touch dev queues or the API suite (db 1).
process.env.REDIS_URL ??= "redis://localhost:6380/2";
process.env.OTEL_SDK_DISABLED = "true";
process.env.LOG_LEVEL = "fatal";
process.env.WEB_URL = "http://localhost:3000";
// Worker tests use a fake provider registry; no platform credentials needed.

await migrateTestDatabase(process.env.DATABASE_URL);
