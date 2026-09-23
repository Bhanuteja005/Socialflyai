import { AiError } from "./errors";

/**
 * Locates the ffmpeg binary: FFMPEG_PATH if set; else the `ffmpeg-static` binary
 * (a dev dependency, so local development and tests need nothing installed); else
 * `ffmpeg` on PATH — production images install Alpine's ffmpeg package.
 */
let resolved: Promise<string> | null = null;
export function ffmpegPath(): Promise<string> {
	resolved ??= (async () => {
		if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
		try {
			const mod = (await import("ffmpeg-static")) as { default: string | null };
			if (mod.default) return mod.default;
		} catch {
			// Not installed (production): fall through to PATH.
		}
		return "ffmpeg";
	})();
	return resolved;
}

/** Runs ffmpeg, returning stderr (where ffmpeg writes its diagnostics). Throws on failure. */
export async function runFfmpeg(args: string[], opts: { timeoutMs?: number } = {}) {
	const bin = await ffmpegPath();
	let proc: ReturnType<typeof Bun.spawn>;
	try {
		proc = Bun.spawn([bin, "-hide_banner", "-nostdin", "-y", ...args], {
			stdout: "ignore",
			stderr: "pipe",
		});
	} catch (error) {
		throw new AiError(
			"not_configured",
			"ffmpeg is not installed on this server",
			{},
			{ cause: error },
		);
	}
	const timer = setTimeout(() => proc.kill(), opts.timeoutMs ?? 10 * 60_000);
	const [stderr, code] = await Promise.all([
		new Response(proc.stderr as ReadableStream).text(),
		proc.exited,
	]);
	clearTimeout(timer);
	if (code !== 0) {
		// The tail of stderr names the failing filter/input; the head is noise.
		throw new Error(`ffmpeg exited with ${code}: ${stderr.slice(-1500)}`);
	}
	return stderr;
}

/** Media duration in seconds, read from ffmpeg's own probe output (no ffprobe needed). */
export async function mediaDurationSeconds(file: string): Promise<number> {
	const bin = await ffmpegPath();
	const proc = Bun.spawn([bin, "-hide_banner", "-nostdin", "-i", file], {
		stdout: "ignore",
		stderr: "pipe",
	});
	const stderr = await new Response(proc.stderr as ReadableStream).text();
	await proc.exited; // exits non-zero ("no output file"), which is expected here
	const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
	if (!m) throw new Error(`could not read duration of ${file}`);
	return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}
