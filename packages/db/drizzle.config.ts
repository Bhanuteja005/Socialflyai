import { defineConfig } from "drizzle-kit";

// `bun run db:generate` diffs src/schema against the last snapshot and writes a new
// SQL migration into ./drizzle. Review the SQL before committing it — it is what
// runs in production. Migrations are applied by `bun run db:migrate` (CI deploy
// step), never on service boot: N replicas racing the same DDL is how schemas break.
export default defineConfig({
	dialect: "postgresql",
	schema: "./src/schema/index.ts",
	out: "./drizzle",
	casing: "snake_case",
	dbCredentials: {
		url: process.env.DATABASE_URL ?? "postgres://socialfly:socialfly@localhost:5434/socialfly",
	},
	strict: true,
	verbose: true,
});
