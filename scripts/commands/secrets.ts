import { existsSync } from "node:fs";
import { join } from "node:path";
import { generateKey } from "@socialfly/core/crypto";
import { hashToken, randomToken } from "@socialfly/core/security";
import { ENV_FILE, ROOT } from "../lib/paths";
import { color, fail, mark, section } from "../lib/ui";

/** Fresh values for the secrets in .env.example. */
export const freshSecrets = () => ({
	AUTH_JWT_SECRET: randomToken(48),
	TOKEN_ENCRYPTION_KEY: generateKey(),
});

/** `bun run cli env` — create .env from .env.example with freshly generated local secrets. */
export async function createEnvFile(args: string[]) {
	if (existsSync(ENV_FILE) && !args.includes("--force")) {
		fail(".env already exists (pass --force to overwrite it)");
	}
	let text = await Bun.file(join(ROOT, ".env.example")).text();
	for (const [key, value] of Object.entries(freshSecrets())) {
		text = text.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`);
	}
	await Bun.write(ENV_FILE, text);
	console.log(
		`${mark.ok} ${color.green(".env created")} with fresh local secrets. Add platform app credentials as you get them.`,
	);
}

/** `bun run cli secrets` — print new secrets (for a production key vault). */
export function printSecrets() {
	section("New secrets — store them in your secret manager, never in git");
	for (const [key, value] of Object.entries(freshSecrets()))
		console.log(`${color.cyan(key)}=${value}`);
	console.log(
		color.dim(
			"\nRotating TOKEN_ENCRYPTION_KEY? Move the current value to TOKEN_ENCRYPTION_KEY_PREVIOUS first.",
		),
	);
}

/**
 * `bun run cli service-client <client_id> <scope...>` — prints the SQL to register
 * a machine client plus its secret. The secret is shown once and only its hash is
 * stored, so it cannot be recovered later.
 */
export function serviceClient(args: string[]) {
	const [clientId, ...scopes] = args;
	if (!clientId) fail("Usage: bun run cli service-client <client_id> <scope> [scope...]");
	const secret = randomToken(32);
	section(`Service client "${clientId}"`);
	console.log(`${color.cyan("client_secret")}=${secret}   ${color.yellow("← shown once")}`);
	const scopeList = scopes.map((s) => `'${s.replace(/'/g, "''")}'`).join(", ");
	console.log(
		`\n${color.dim("-- run against the target database:")}\ninsert into service_clients (id, client_id, name, secret_hash, scopes) values (gen_random_uuid(), '${clientId.replace(/'/g, "''")}', '${clientId.replace(/'/g, "''")}', '${hashToken(secret)}', array[${scopeList}]::text[]);`,
	);
}
