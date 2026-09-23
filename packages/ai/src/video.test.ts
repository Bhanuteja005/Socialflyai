import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mediaDurationSeconds, runFfmpeg } from "./ffmpeg";
import { CAROUSEL_THEMES, renderCarousel } from "./render";
import { videoScript } from "./tasks";
import { FakeSpeechModel, FakeTextModel } from "./testing";
import { renderVideo, VIDEO_SIZE } from "./video";

const theme = {
	...(CAROUSEL_THEMES.ocean ?? { background: "#000", foreground: "#fff", accent: "#0f0" }),
	footer: "Acme",
};

/** Writes bytes to a temp file and returns ffmpeg's view of the streams + duration. */
async function probe(bytes: Uint8Array) {
	const dir = await mkdtemp(join(tmpdir(), "sf-probe-"));
	try {
		const file = join(dir, "v.mp4");
		await Bun.write(file, bytes);
		const duration = await mediaDurationSeconds(file);
		// A decode pass to null proves the file is playable end to end, not just well-headed.
		const log = await runFfmpeg(["-v", "info", "-i", file, "-f", "null", "-"]);
		return { duration, log };
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

describe("renderVideo", () => {
	test("renders a playable 1080×1920 H.264/AAC MP4 whose timing follows the narration", async () => {
		const speech = new FakeSpeechModel();
		// ~45 chars at 15 chars/s → a 3 s narration for scene 1 (planned 2 s, must stretch).
		const voice = await speech.generate({ text: "x".repeat(45), voice: "alloy" });
		const [slide] = await renderCarousel([{ heading: "Photo stand-in", body: "" }], theme);
		if (!slide) throw new Error("no slide");

		const video = await renderVideo(
			[
				{
					caption: "Hook",
					durationSeconds: 2,
					audio: voice.bytes,
					background: { bytes: slide, mimeType: "image/png" },
				},
				{ caption: "Middle", durationSeconds: 2 },
				{ caption: "Follow for more", durationSeconds: 2 },
			],
			theme,
		);

		expect(video).toMatchObject({ mimeType: "video/mp4", ...VIDEO_SIZE });
		const { duration, log } = await probe(video.bytes);
		expect(log).toContain("h264");
		expect(log).toContain("1080x1920");
		expect(log).toContain("aac");
		// Scene 1 stretched to ≥3 s of narration; 3 scenes minus two 0.4 s crossfades.
		expect(duration).toBeGreaterThan(6);
		expect(duration).toBeLessThan(8);
		expect(Math.abs(video.durationMs / 1000 - duration)).toBeLessThan(0.2);
	}, 120_000);

	test("a single scene without audio still gets a (silent) audio track", async () => {
		const video = await renderVideo([{ caption: "Solo", durationSeconds: 2 }], theme);
		const { log } = await probe(video.bytes);
		expect(log).toContain("aac");
	}, 60_000);
});

describe("videoScript", () => {
	test("normalises scenes and drops narration when voiceover is off", async () => {
		const fake = new FakeTextModel().reply({
			title: "Brew better",
			scenes: [
				{
					caption: "  Stop scorching your coffee  ",
					narration: "Hot water ruins it.",
					visual: "kettle steam",
					durationSeconds: 1,
				},
				{
					caption: "Aim for 92–96°C",
					narration: "Let it rest.",
					visual: "thermometer",
					durationSeconds: 99,
				},
			],
			caption: "Better coffee in 30 seconds",
			hashtags: ["coffee", "brew tips"],
		});
		const { output } = await videoScript(fake, null, {
			topic: "brewing temperature",
			voiceover: false,
		});
		expect(output.scenes[0]).toEqual({
			caption: "Stop scorching your coffee",
			narration: "",
			visual: "kettle steam",
			durationSeconds: 2,
		});
		expect(output.scenes[1]?.durationSeconds).toBe(15);
		expect(output.hashtags).toEqual(["#coffee", "#brewtips"]);
		expect(fake.requests[0]?.prompt).toContain("narration — an empty string");
	});
});
