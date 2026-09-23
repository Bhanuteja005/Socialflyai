import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

export const ROOT = resolve(import.meta.dir, "../..");
export const COMPOSE_FILE = join(ROOT, "infra/compose/compose.yaml");
export const ENV_FILE = join(ROOT, ".env");

/**
 * The root .env, parsed. Every app reads one shared .env (like the reference repo),
 * and the CLI injects it into the processes it spawns — so there is exactly one
 * place to put local secrets.
 */
export async function loadRootEnv(): Promise<Record<string, string>> {
	if (!existsSync(ENV_FILE)) return {};
	const env: Record<string, string> = {};
	for (const line of (await Bun.file(ENV_FILE).text()).split(/\r?\n/)) {
		const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
		if (!m?.[1]) continue;
		env[m[1]] = (m[2] ?? "").replace(/^(['"])(.*)\1$/, "$2");
	}
	return env;
}
