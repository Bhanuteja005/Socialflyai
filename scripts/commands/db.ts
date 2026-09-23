import { join } from "node:path";
import { loadRootEnv, ROOT } from "../lib/paths";
import { color, fail, mark, section } from "../lib/ui";

const DB_DIR = join(ROOT, "packages/db");

async function run(cmd: string[], extraEnv: Record<string, string> = {}) {
	const proc = Bun.spawn({
		cmd,
		cwd: DB_DIR,
		env: { ...process.env, ...(await loadRootEnv()), ...extraEnv },
		stdout: "inherit",
		stderr: "inherit",
	});
	return (await proc.exited) === 0;
}

export async function migrate() {
	if (!(await run(["bun", "run", "src/migrate.ts"]))) fail("migration failed");
}

export async function db(sub: string | undefined, args: string[]) {
	switch (sub) {
		case "migrate":
			section("Applying migrations");
			return migrate();
		case "generate": {
			const name = args.find((a) => !a.startsWith("--"));
			if (!name) fail("Name the migration: bun run cli db generate add_post_labels");
			section("Generating migration from schema changes");
			if (!(await run(["bunx", "drizzle-kit", "generate", "--name", name])))
				fail("generate failed");
			console.log(
				`\n${mark.warn} Review the SQL in packages/db/drizzle before committing — it is what runs in production.`,
			);
			return;
		}
		case "seed":
			section("Seeding local data");
			if (!(await run(["bun", "run", "src/seed.ts"]))) fail("seed failed");
			return;
		case "studio":
			await run(["bunx", "drizzle-kit", "studio"]);
			return;
		case "reset": {
			if (!args.includes("--yes")) fail("This wipes the LOCAL database. Re-run with --yes");
			const env = await loadRootEnv();
			const url = env.DATABASE_URL ?? "postgres://socialfly:socialfly@localhost:5434/socialfly";
			if (!/localhost|127\.0\.0\.1/.test(url))
				fail(`Refusing to reset a non-local database (${url})`);
			section("Resetting local database");
			const sql =
				"drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public; create extension if not exists vector; create extension if not exists pg_trgm; create extension if not exists citext;";
			const ok =
				Bun.spawnSync({
					cmd: [
						"docker",
						"compose",
						"-f",
						join(ROOT, "infra/compose/compose.yaml"),
						"exec",
						"-T",
						"postgres",
						"psql",
						"-U",
						"socialfly",
						"-q",
						"-c",
						sql,
					],
					stdout: "inherit",
					stderr: "inherit",
				}).exitCode === 0;
			if (!ok) fail("reset failed");
			await migrate();
			console.log(
				`${mark.ok} ${color.green("fresh database")} — run ${color.cyan("bun run cli db seed")} for demo data`,
			);
			return;
		}
		default:
			fail(
				`Unknown db command "${sub ?? ""}". Use: migrate | generate <name> | seed | studio | reset --yes`,
			);
	}
}
