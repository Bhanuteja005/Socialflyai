import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mediaDurationSeconds, runFfmpeg } from "./ffmpeg";
import { type CarouselTheme, cropToAspect, el, FONT_FAMILY, renderElement } from "./render";

/**
 * Vertical short-form video (Reels, Shorts, TikTok-style) from scenes, with no
 * browser and no licensed renderer:
 *
 *   per scene: background (image or theme gradient) ──zoompan──┐
 *              caption overlay (Satori → transparent PNG) ──────┴─ overlay → scene clip
 *   all scenes: xfade crossfades → + narration track → H.264/AAC MP4 (faststart)
 *
 * Captions are rendered by the same engine as carousels, so fonts, scripts
 * (Latin/Cyrillic/Greek) and themes behave identically across formats.
 */

export const VIDEO_SIZE = { width: 1080, height: 1920 } as const;
const FPS = 30;
/** Crossfade between scenes. Short enough to feel snappy on mobile. */
const FADE = 0.4;
/** Breathing room after a scene's narration before the next scene starts. */
const TAIL = 0.35;

export type VideoSceneInput = {
	caption: string;
	/** Planned length; stretched when the narration is longer. */
	durationSeconds: number;
	/** Background image (any size/ratio — cropped to 9:16). None = theme gradient. */
	background?: { bytes: Uint8Array; mimeType: string } | null;
	/** Narration for this scene (mp3/wav/m4a). */
	audio?: Uint8Array | null;
};

export type RenderedVideo = {
	bytes: Uint8Array;
	mimeType: "video/mp4";
	width: number;
	height: number;
	durationMs: number;
};

function captionOverlay(caption: string, theme: CarouselTheme, index: number, total: number) {
	const size = caption.length > 70 ? 64 : caption.length > 40 ? 76 : 88;
	return el(
		"div",
		{
			width: "100%",
			height: "100%",
			display: "flex",
			flexDirection: "column",
			justifyContent: "flex-end",
			padding: "0 72px 260px",
			fontFamily: FONT_FAMILY,
			// A soft bottom gradient keeps white text readable on any photo.
			backgroundImage: "linear-gradient(to bottom, rgba(0,0,0,0) 45%, rgba(0,0,0,0.72) 100%)",
		},
		[
			el(
				"div",
				{
					display: "flex",
					fontSize: size,
					fontWeight: 800,
					lineHeight: 1.12,
					letterSpacing: -1,
					color: "#FFFFFF",
				},
				caption,
			),
			el("div", { display: "flex", alignItems: "center", gap: 20, marginTop: 44 }, [
				el("div", {
					display: "flex",
					width: 96,
					height: 10,
					borderRadius: 5,
					backgroundColor: theme.accent,
				}),
				el(
					"div",
					{ display: "flex", fontSize: 30, fontWeight: 700, color: "rgba(255,255,255,0.85)" },
					theme.footer ?? `${index + 1} / ${total}`,
				),
			]),
		],
	);
}

function gradientBackground(theme: CarouselTheme) {
	return el("div", {
		width: "100%",
		height: "100%",
		display: "flex",
		backgroundColor: theme.background,
		backgroundImage: `radial-gradient(circle at 30% 20%, ${theme.accent}55 0%, ${theme.background} 60%)`,
	});
}

/** Renders scenes to an MP4. Work happens in a private temp dir that is always removed. */
export async function renderVideo(
	scenes: VideoSceneInput[],
	theme: CarouselTheme,
): Promise<RenderedVideo> {
	if (scenes.length === 0) throw new Error("renderVideo needs at least one scene");
	const dir = await mkdtemp(join(tmpdir(), "sf-video-"));
	try {
		const { width, height } = VIDEO_SIZE;
		const durations: number[] = [];

		for (const [i, scene] of scenes.entries()) {
			const bg = join(dir, `bg-${i}.png`);
			const fg = join(dir, `fg-${i}.png`);
			// Backgrounds are rendered 10% oversize so the slow zoom never reveals an edge.
			const bgW = Math.round(width * 1.1);
			const bgH = Math.round(height * 1.1);
			await writeFile(
				bg,
				scene.background
					? await cropToAspect(scene.background.bytes, scene.background.mimeType, bgW, bgH)
					: await renderElement(gradientBackground(theme), bgW, bgH),
			);
			await writeFile(
				fg,
				await renderElement(captionOverlay(scene.caption, theme, i, scenes.length), width, height),
			);

			let duration = Math.max(2, scene.durationSeconds);
			if (scene.audio) {
				const audio = join(dir, `audio-${i}`);
				await writeFile(audio, scene.audio);
				duration = Math.max(duration, (await mediaDurationSeconds(audio)) + FADE + TAIL);
			}
			duration = Math.round(duration * FPS) / FPS;
			durations.push(duration);

			const frames = Math.round(duration * FPS);
			// Alternate zoom in / zoom out so consecutive scenes don't feel identical.
			const zoom = i % 2 === 0 ? "min(1+0.0009*on,1.1)" : "max(1.1-0.0009*on,1)";
			await runFfmpeg([
				"-loop",
				"1",
				"-framerate",
				String(FPS),
				"-t",
				String(duration),
				"-i",
				bg,
				"-i",
				fg,
				"-filter_complex",
				`[0:v]zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${width}x${height}:fps=${FPS}[bgz];[bgz][1:v]overlay=0:0,format=yuv420p[v]`,
				"-map",
				"[v]",
				"-frames:v",
				String(frames),
				"-c:v",
				"libx264",
				"-preset",
				"veryfast",
				"-crf",
				"20",
				"-an",
				join(dir, `scene-${i}.mp4`),
			]);
		}

		// Crossfade chain. Scene i starts at sum(d<i) - i*FADE on the final timeline.
		const inputs = scenes.flatMap((_, i) => ["-i", join(dir, `scene-${i}.mp4`)]);
		let chain = "";
		let last = "0:v";
		let offset = 0;
		for (let i = 1; i < scenes.length; i++) {
			offset += (durations[i - 1] ?? 0) - FADE;
			const out = `x${i}`;
			chain += `[${last}][${i}:v]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(3)}[${out}];`;
			last = out;
		}
		const total = durations.reduce((a, b) => a + b, 0) - FADE * (scenes.length - 1);

		// Narration: each scene's audio padded/trimmed to that scene's slot on the timeline.
		const audioInputs: string[] = [];
		let audioChain = "";
		const slots: string[] = [];
		// Audio inputs follow the scene clips; count them explicitly (each kind adds a
		// different number of CLI arguments, so args.length is not an input count).
		let audioIndex = scenes.length;
		for (const [i, scene] of scenes.entries()) {
			const slot = i === scenes.length - 1 ? (durations[i] ?? 0) : (durations[i] ?? 0) - FADE;
			const idx = audioIndex++;
			if (scene.audio) {
				audioInputs.push("-i", join(dir, `audio-${i}`));
			} else {
				audioInputs.push("-f", "lavfi", "-t", slot.toFixed(3), "-i", "anullsrc=r=44100:cl=stereo");
			}
			audioChain += `[${idx}:a]aresample=44100,aformat=channel_layouts=stereo,apad,atrim=0:${slot.toFixed(3)}[a${i}];`;
			slots.push(`[a${i}]`);
		}
		audioChain += `${slots.join("")}concat=n=${scenes.length}:v=0:a=1[aout]`;

		const output = join(dir, "out.mp4");
		await runFfmpeg([
			...inputs,
			...audioInputs,
			"-filter_complex",
			`${chain}${scenes.length > 1 ? `[${last}]` : "[0:v]"}null[vout];${audioChain}`,
			"-map",
			"[vout]",
			"-map",
			"[aout]",
			"-c:v",
			"libx264",
			"-preset",
			"medium",
			"-crf",
			"21",
			"-pix_fmt",
			"yuv420p",
			"-r",
			String(FPS),
			"-c:a",
			"aac",
			"-b:a",
			"160k",
			"-t",
			total.toFixed(3),
			// moov atom first: platforms and browsers can start playback before the download ends.
			"-movflags",
			"+faststart",
			output,
		]);

		return {
			bytes: new Uint8Array(await Bun.file(output).arrayBuffer()),
			mimeType: "video/mp4",
			width,
			height,
			durationMs: Math.round(total * 1000),
		};
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}
