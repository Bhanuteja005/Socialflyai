import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const MIGRATION_LOCK = 727274;

/**
 * Migrates the test database before a suite runs. The advisory lock matters:
 * Turbo runs the api, auth and worker suites in PARALLEL against one test
 * database, and without it their setups race each other's DDL.
 */
export async function migrateTestDatabase(url: string) {
	const client = postgres(url, { max: 1, onnotice: () => {} });
	try {
		await client`select pg_advisory_lock(${MIGRATION_LOCK})`;
		await migrate(drizzle(client), { migrationsFolder: join(import.meta.dir, "../drizzle") });
	} finally {
		await client`select pg_advisory_unlock(${MIGRATION_LOCK})`.catch(() => {});
		await client.end();
	}
}
