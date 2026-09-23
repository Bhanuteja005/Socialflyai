import { migrateTestDatabase } from "@socialfly/db/testing";

// Must run before any module reads the env: bunfig.toml preloads this file.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://socialfly:socialfly@localhost:5434/socialfly_test";
process.env.OTEL_SDK_DISABLED = "true";
process.env.LOG_LEVEL = "fatal";
process.env.WEB_URL = "http://localhost:3000";

await migrateTestDatabase(process.env.DATABASE_URL);
