import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Applies pending SQL migrations from ./drizzle, in order, inside a transaction,
 * recording each in drizzle.__drizzle_migrations.
 *
 * Run explicitly — `bun run db:migrate` locally, a dedicated step in deploy.yml
 * before new images roll out — never on service boot. A single connection and a
 * Postgres advisory lock make concurrent runs (two deploys) queue, not collide.
 */
const url = process.env.DATABASE_URL ?? "postgres://socialfly:socialfly@localhost:5434/socialfly";
const client = postgres(url, { max: 1, onnotice: () => {} });

try {
	await client`select pg_advisory_lock(727274)`;
	await migrate(drizzle(client), { migrationsFolder: join(import.meta.dir, "../drizzle") });
	console.warn("migrations: up to date");
} catch (error) {
	console.error("migrations: FAILED", error);
	process.exitCode = 1;
} finally {
	await client`select pg_advisory_unlock(727274)`.catch(() => {});
	await client.end();
}
