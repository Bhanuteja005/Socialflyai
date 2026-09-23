import { describe, expect, test } from "bun:test";
import { AiError } from "./errors";
import { ImageModelChain } from "./images";
import { CAROUSEL_SIZE, CAROUSEL_THEMES, cropToAspect, renderCarousel } from "./render";
import { FakeImageModel } from "./testing";

/** Test-only: the value must exist; fail loudly instead of asserting with `!`. */
function must<T>(value: T | undefined): T {
	if (value === undefined) throw new Error("expected a value");
	return value;
}

const midnight = must(CAROUSEL_THEMES.midnight);

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Width and height from a PNG's IHDR chunk. */
function pngSize(bytes: Uint8Array) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return { width: view.getUint32(16), height: view.getUint32(20) };
}

describe("renderCarousel", () => {
	test("renders one 1080×1350 PNG per slide", async () => {
		const slides = [
			{ heading: "5 brewing mistakes", body: "and how to fix them" },
			{ heading: "Water too hot", body: "Aim for 92–96°C. Boiling water scorches light roasts." },
			{ heading: "Follow for more", body: "" },
		];
		const pngs = await renderCarousel(slides, {
			...midnight,
			footer: "@acmecoffee",
		});
		expect(pngs).toHaveLength(3);
		for (const png of pngs) {
			expect([...png.slice(0, 8)]).toEqual(PNG_SIGNATURE);
			expect(pngSize(png)).toEqual(CAROUSEL_SIZE);
		}
		// Different content → different pixels.
		expect(Buffer.from(must(pngs[0])).equals(Buffer.from(must(pngs[1])))).toBe(false);
	}, 30_000);
});

describe("cropToAspect", () => {
	test("produces exactly the requested dimensions", async () => {
		const square = await renderCarousel([{ heading: "x", body: "" }], must(CAROUSEL_THEMES.paper));
		const cropped = await cropToAspect(must(square[0]), "image/png", 1080, 1920);
		expect(pngSize(cropped)).toEqual({ width: 1080, height: 1920 });
	}, 30_000);
});

describe("ImageModelChain", () => {
	test("falls through to the next provider on a transient failure", async () => {
		const first = new FakeImageModel().failNext(new AiError("transient", "down"));
		const second = new FakeImageModel();
		const image = await new ImageModelChain([first, second]).generate({
			prompt: "p",
			aspectRatio: "4:5",
		});
		expect(pngSize(image.bytes)).toEqual({ width: 1080, height: 1350 });
		expect(second.requests).toHaveLength(1);
	});

	test("does not shop a refused prompt around to other providers", async () => {
		const first = new FakeImageModel().failNext(new AiError("refused", "no"));
		const second = new FakeImageModel();
		const error = await new ImageModelChain([first, second])
			.generate({ prompt: "p", aspectRatio: "1:1" })
			.catch((e) => e);
		expect((error as AiError).kind).toBe("refused");
		expect(second.requests).toHaveLength(0);
	});

	test("throws the last error when every provider fails", async () => {
		const chain = new ImageModelChain([
			new FakeImageModel().failNext(new AiError("rate_limited", "busy")),
			new FakeImageModel().failNext(new AiError("transient", "down")),
		]);
		expect(chain.generate({ prompt: "p", aspectRatio: "1:1" })).rejects.toMatchObject({
			kind: "transient",
		});
	});
});
