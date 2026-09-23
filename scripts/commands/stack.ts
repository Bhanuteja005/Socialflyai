import { compose, dockerAvailable, waitHealthy } from "../lib/docker";
import { color, fail, mark, section } from "../lib/ui";

const PROFILES = ["observability", "apps", "full"];

export async function stack(sub: string | undefined, args: string[]) {
	if (!dockerAvailable()) fail("Docker is not running — start Docker Desktop first");
	const profiles = args.filter((a) => PROFILES.includes(a));

	switch (sub) {
		case "up":
			section("Starting infrastructure");
			compose(["up", "-d", "--wait", "--remove-orphans"], { profiles });
			await waitHealthy();
			console.log(`\n${mark.ok} ${color.green("infrastructure ready")}`);
			printUrls(profiles);
			return;
		case "down":
			compose(["down"], { profiles: PROFILES });
			return;
		case "nuke":
			if (!args.includes("--yes"))
				fail("This deletes ALL local data (db, redis, storage). Re-run with --yes");
			compose(["down", "--volumes"], { profiles: PROFILES });
			return;
		case "ps":
			compose(["ps"], { profiles: PROFILES });
			return;
		case "logs":
			compose(["logs", "-f", "--tail", "100", ...args.filter((a) => !PROFILES.includes(a))], {
				profiles: PROFILES,
			});
			return;
		default:
			fail(
				`Unknown stack command "${sub ?? ""}". Use: up [observability|apps|full] | down | nuke --yes | ps | logs [service]`,
			);
	}
}

export function printUrls(profiles: string[]) {
	const rows: [string, string][] = [
		["Postgres", "postgres://socialfly:socialfly@localhost:5434/socialfly"],
		["Redis", "redis://localhost:6380"],
		["Storage (S3)", "http://localhost:9000  console → http://localhost:9001"],
		["Mail inbox", "http://localhost:8025"],
	];
	if (profiles.includes("observability") || profiles.includes("full")) {
		rows.push(["Grafana (traces/logs/metrics)", "http://localhost:4703  (admin / admin)"]);
	}
	console.log();
	for (const [name, url] of rows) console.log(`  ${color.cyan(name.padEnd(30))} ${url}`);
}
