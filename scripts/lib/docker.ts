import { COMPOSE_FILE, ROOT } from "./paths";
import { fail } from "./ui";

/** `docker compose` against infra/compose/compose.yaml, streaming output. */
export function compose(args: string[], { profiles = [] as string[], check = true } = {}) {
	const result = Bun.spawnSync({
		cmd: [
			"docker",
			"compose",
			"-f",
			COMPOSE_FILE,
			...profiles.flatMap((p) => ["--profile", p]),
			...args,
		],
		cwd: ROOT,
		stdout: "inherit",
		stderr: "inherit",
	});
	if (check && result.exitCode !== 0) fail(`docker compose ${args.join(" ")} failed`);
	return result.exitCode === 0;
}

export function dockerAvailable() {
	return (
		Bun.spawnSync({ cmd: ["docker", "info"], stdout: "ignore", stderr: "ignore" }).exitCode === 0
	);
}

/** Waits until every service with a healthcheck reports healthy (or times out). */
export async function waitHealthy(timeoutMs = 90_000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const out = Bun.spawnSync({
			cmd: ["docker", "compose", "-f", COMPOSE_FILE, "ps", "--format", "{{.Service}} {{.Health}}"],
			stdout: "pipe",
		});
		const lines = new TextDecoder().decode(out.stdout).trim().split("\n").filter(Boolean);
		const pending = lines.filter((l) => /starting|unhealthy/.test(l));
		if (lines.length > 0 && pending.length === 0) return;
		await Bun.sleep(1000);
	}
	fail("infrastructure did not become healthy in time — check `bun run cli stack logs`");
}
