import { existsSync } from "node:fs";
import { join } from "node:path";
import { dockerAvailable } from "../lib/docker";
import { frontendDir, frontends } from "../lib/frontends";
import { ENV_FILE, loadRootEnv, ROOT } from "../lib/paths";
import { color, fail, mark, section } from "../lib/ui";
import { migrate } from "./db";
import { stack } from "./stack";

type App = { name: string; cwd: string; cmd: string[]; paint: (s: string) => string; url: string };

// Bun services run from the repo ROOT: `bun --watch` only watches files under its
// working directory, and a change in packages/* must reload every app that uses it.
const bunService = (app: string) => ["bun", "--watch", `apps/${app}/src/index.ts`];

const FRONTEND_COLORS = [color.green, color.cyan, color.red];

const APPS: App[] = [
	{
		name: "auth",
		cwd: ".",
		cmd: bunService("auth"),
		paint: color.magenta,
		url: "http://localhost:4800/docs",
	},
	{
		name: "api",
		cwd: ".",
		cmd: bunService("api"),
		paint: color.blue,
		url: "http://localhost:4400/docs",
	},
	{
		name: "worker",
		cwd: ".",
		cmd: bunService("worker"),
		paint: color.yellow,
		url: "http://localhost:4500/queues",
	},
	// Next.js frontends run on Node via their own `dev` script (which pins the port).
	...frontends().map((f, i) => ({
		name: f.name,
		cwd: frontendDir(f),
		cmd: ["bun", "run", "dev"],
		paint: FRONTEND_COLORS[i % FRONTEND_COLORS.length] ?? color.green,
		url: `http://localhost:${f.port}`,
	})),
];

/**
 * `bun dev`: infrastructure in Docker, apps on the host with hot reload, one
 * interleaved log stream with a coloured prefix per app. Ctrl+C stops everything.
 *
 *   bun dev                 all apps
 *   bun dev api worker      only these
 *   bun dev --no-infra      assume the stack is already up
 */
export async function dev(args: string[]) {
	if (!existsSync(ENV_FILE)) {
		fail(
			"No .env file. Create one with `bun run cli env` (copies .env.example with fresh local secrets)",
		);
	}
	const only = args.filter((a) => !a.startsWith("--"));
	const apps = only.length ? APPS.filter((a) => only.includes(a.name)) : APPS;
	if (apps.length === 0)
		fail(`Unknown app(s): ${only.join(", ")}. Choose from: ${APPS.map((a) => a.name).join(", ")}`);

	if (!args.includes("--no-infra")) {
		if (!dockerAvailable())
			fail("Docker is not running — start Docker Desktop, or pass --no-infra");
		await stack("up", args);
		await migrate();
	}

	let stopping = false;
	const env: Record<string, string | undefined> = {
		...process.env,
		...(await loadRootEnv()),
		FORCE_COLOR: "1",
	};

	// Without a collector every service would log an export error every few
	// seconds. Detect it once and switch telemetry off for this session instead.
	const otlp = env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";
	const collectorUp = await fetch(otlp, { signal: AbortSignal.timeout(1000) }).then(
		() => true,
		() => false,
	);
	if (!collectorUp && env.OTEL_SDK_DISABLED !== "true") {
		env.OTEL_SDK_DISABLED = "true";
		console.log(
			`${mark.warn} No OTel collector at ${otlp} — telemetry off. ${color.dim("Enable: bun run cli stack up observability")}`,
		);
	}
	section("Starting apps");
	const width = Math.max(...apps.map((a) => a.name.length));
	const procs = apps.map((app) => {
		const proc = Bun.spawn({
			cmd: app.cmd,
			cwd: join(ROOT, app.cwd),
			env,
			stdout: "pipe",
			stderr: "pipe",
		});
		const prefix = app.paint(`${app.name.padEnd(width)} │`);
		void pipe(proc.stdout, prefix);
		void pipe(proc.stderr, prefix);
		void proc.exited.then((code) => {
			if (code !== 0 && !stopping)
				console.log(`${prefix} ${color.red(`exited with code ${code}`)}`);
		});
		return proc;
	});

	console.log();
	for (const app of apps) console.log(`  ${mark.ok} ${app.paint(app.name.padEnd(8))} ${app.url}`);
	console.log(color.dim("\n  Ctrl+C to stop\n"));

	const stop = () => {
		if (stopping) return;
		stopping = true;
		for (const p of procs) p.kill("SIGTERM");
		setTimeout(() => process.exit(0), 5000).unref();
	};
	process.on("SIGINT", stop);
	process.on("SIGTERM", stop);
	await Promise.all(procs.map((p) => p.exited));
}

async function pipe(stream: ReadableStream<Uint8Array>, prefix: string) {
	const decoder = new TextDecoder();
	let buffer = "";
	for await (const chunk of stream) {
		buffer += decoder.decode(chunk, { stream: true });
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";
		for (const line of lines) process.stdout.write(`${prefix} ${line}\n`);
	}
	if (buffer) process.stdout.write(`${prefix} ${buffer}\n`);
}
