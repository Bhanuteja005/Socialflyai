import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;
/** A transaction handle — same query API, used to pass a tx through services. */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | Tx;

export type DbHandle = {
	db: Database;
	/** Liveness probe for /ready. */
	ping: () => Promise<void>;
	close: () => Promise<void>;
};

export function createDb(
	url: string,
	options: { max?: number; applicationName?: string } = {},
): DbHandle {
	const client = postgres(url, {
		max: options.max ?? 10,
		idle_timeout: 30,
		connect_timeout: 10,
		// Shows up in pg_stat_activity, so a slow query can be traced to its service.
		connection: { application_name: options.applicationName ?? "socialfly" },
	});
	const db = drizzle(client, { schema, casing: "snake_case" });
	return {
		db,
		ping: async () => {
			await db.execute(sql`select 1`);
		},
		close: () => client.end({ timeout: 5 }),
	};
}
