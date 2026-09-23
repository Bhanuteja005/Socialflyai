import { color, mark, section } from "../lib/ui";

type Check = { label: string; url: string; required: boolean };

const CHECKS: Check[] = [
	{ label: "Auth    /ready", url: "http://localhost:4800/ready", required: true },
	{ label: "API     /ready", url: "http://localhost:4400/ready", required: true },
	{ label: "Worker  /ready", url: "http://localhost:4500/ready", required: true },
	{ label: "Web", url: "http://localhost:3000", required: false },
	{ label: "Grafana", url: "http://localhost:3001/api/health", required: false },
];

/** Readiness of every local service — the same /ready probes production uses. */
export async function status() {
	section("Local status");
	let healthy = true;
	for (const check of CHECKS) {
		const res = await fetch(check.url, { signal: AbortSignal.timeout(3000) }).catch(() => null);
		const ok = res?.ok ?? false;
		const detail =
			res && !res.ok ? color.dim(` (${res.status})`) : !res ? color.dim(" (not running)") : "";
		console.log(
			`  ${ok ? mark.ok : check.required ? mark.fail : mark.warn} ${check.label.padEnd(16)} ${check.url}${detail}`,
		);
		if (!ok && check.required) healthy = false;
		if (res && !res.ok && check.url.endsWith("/ready")) {
			const body = (await res.json().catch(() => null)) as {
				checks?: Record<string, { ok: boolean; error?: string }>;
			} | null;
			for (const [name, c] of Object.entries(body?.checks ?? {})) {
				if (!c.ok) console.log(`      ${mark.fail} ${name}: ${c.error}`);
			}
		}
	}
	console.log();
	if (!healthy) {
		console.log(
			`${mark.fail} ${color.red("not fully healthy")} — start everything with ${color.cyan("bun dev")}`,
		);
		process.exit(1);
	}
	console.log(`${mark.ok} ${color.green("all required services ready")}`);
}
