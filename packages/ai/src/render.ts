import { createRequire } from "node:module";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import satori from "satori";
import type { CarouselSlide } from "./tasks";

/**
 * Server-side image rendering without a browser: Satori lays out a small element
 * tree (flexbox subset) into SVG with text converted to paths, and resvg (as
 * WebAssembly — no native binary to break on Alpine) rasterises it to PNG.
 */

const require = createRequire(import.meta.url);

let wasmReady: Promise<void> | null = null;
function ensureWasm() {
	wasmReady ??= Bun.file(require.resolve("@resvg/resvg-wasm/index_bg.wasm"))
		.arrayBuffer()
		.then((bytes) => initWasm(bytes));
	return wasmReady;
}

let fontsReady: Promise<
	{ name: string; data: ArrayBuffer; weight: 400 | 700 | 800; style: "normal" }[]
> | null = null;
/**
 * Fontsource ships Inter split by script. Satori only falls back between DIFFERENT
 * families (the CSS font-family list), not between files sharing a name, so each
 * subset is registered as its own family. Without this, Polish, Turkish, Russian
 * or Greek slides render "no glyph" boxes.
 */
const FONT_SUBSETS = ["latin", "latin-ext", "cyrillic", "greek"] as const;
const familyOf = (subset: (typeof FONT_SUBSETS)[number]) => `Inter-${subset}`;
const FONT_FAMILY = FONT_SUBSETS.map(familyOf).join(", ");

function loadFonts() {
	fontsReady ??= Promise.all(
		FONT_SUBSETS.flatMap((subset) =>
			([400, 700, 800] as const).map(async (weight) => ({
				name: familyOf(subset),
				weight,
				style: "normal" as const,
				data: await Bun.file(
					require.resolve(`@fontsource/inter/files/inter-${subset}-${weight}-normal.woff`),
				).arrayBuffer(),
			})),
		),
	);
	return fontsReady;
}

async function svgToPng(svg: string, width: number) {
	await ensureWasm();
	const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width } });
	try {
		return resvg.render().asPng();
	} finally {
		resvg.free();
	}
}

/**
 * Resizes and centre-crops any image to exactly width×height (object-fit: cover),
 * returning PNG. Used to turn provider output into the exact ratio a platform wants.
 */
export async function cropToAspect(
	bytes: Uint8Array,
	mimeType: string,
	width: number,
	height: number,
) {
	const href = `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image href="${href}" xlink:href="${href}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/></svg>`;
	return svgToPng(svg, width);
}

// ── Carousels ───────────────────────────────────────────────────────────────

export type CarouselTheme = {
	background: string;
	foreground: string;
	accent: string;
	/** Shown small on every slide, e.g. the brand or @handle. */
	footer?: string;
};

export const CAROUSEL_THEMES: Record<string, CarouselTheme> = {
	midnight: { background: "#0B1220", foreground: "#F8FAFC", accent: "#0BE27D" },
	paper: { background: "#FAF7F2", foreground: "#1F2937", accent: "#E4572E" },
	ocean: { background: "#0E3B5C", foreground: "#F1F5F9", accent: "#5EEAD4" },
	sunrise: { background: "#FFF4E6", foreground: "#3B1F0E", accent: "#F97316" },
};

/** 4:5 portrait: the largest a feed shows on Instagram, and it renders well on LinkedIn. */
export const CAROUSEL_SIZE = { width: 1080, height: 1350 } as const;

type Node = { type: string; props: { style?: Record<string, unknown>; children?: unknown } };
const el = (type: string, style: Record<string, unknown>, children?: unknown): Node => ({
	type,
	props: { style, children },
});

function slideTree(slide: CarouselSlide, index: number, total: number, theme: CarouselTheme): Node {
	const isCover = index === 0;
	const isLast = index === total - 1 && total > 1;
	const headingSize = isCover
		? slide.heading.length > 40
			? 84
			: 100
		: slide.heading.length > 45
			? 60
			: 72;

	return el(
		"div",
		{
			width: "100%",
			height: "100%",
			display: "flex",
			flexDirection: "column",
			justifyContent: "space-between",
			padding: "96px 88px",
			backgroundColor: theme.background,
			color: theme.foreground,
			fontFamily: FONT_FAMILY,
		},
		[
			el("div", {
				display: "flex",
				width: 120,
				height: 14,
				borderRadius: 7,
				backgroundColor: theme.accent,
			}),
			el("div", { display: "flex", flexDirection: "column", gap: 40 }, [
				el(
					"div",
					{
						display: "flex",
						fontSize: headingSize,
						fontWeight: 800,
						lineHeight: 1.1,
						letterSpacing: -1.5,
					},
					slide.heading,
				),
				slide.body
					? el(
							"div",
							{
								display: "flex",
								fontSize: isCover ? 40 : 38,
								fontWeight: 400,
								lineHeight: 1.4,
								opacity: 0.85,
							},
							slide.body,
						)
					: null,
			]),
			el(
				"div",
				{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 28 },
				[
					el("div", { display: "flex", fontWeight: 700, opacity: 0.8 }, theme.footer ?? ""),
					el(
						"div",
						{ display: "flex", fontWeight: 700, color: theme.accent },
						isLast ? "" : isCover ? "Swipe ›" : `${index + 1} / ${total}`,
					),
				],
			),
		],
	);
}

/** Renders each slide to a PNG, in order. */
export async function renderCarousel(
	slides: CarouselSlide[],
	theme: CarouselTheme,
): Promise<Uint8Array[]> {
	const fonts = await loadFonts();
	const out: Uint8Array[] = [];
	for (const [i, slide] of slides.entries()) {
		// Satori's types expect a React element; this plain tree is the same shape.
		const svg = await satori(
			slideTree(slide, i, slides.length, theme) as unknown as Parameters<typeof satori>[0],
			{
				...CAROUSEL_SIZE,
				fonts,
			},
		);
		out.push(await svgToPng(svg, CAROUSEL_SIZE.width));
	}
	return out;
}

/**
 * Renders any element tree to a PNG of exactly width×height. Areas the tree leaves
 * unpainted stay transparent, which the video renderer relies on for overlays.
 */
export async function renderElement(tree: RenderNode, width: number, height: number) {
	const fonts = await loadFonts();
	const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
		width,
		height,
		fonts,
	});
	return svgToPng(svg, width);
}

export type RenderNode = Node;
export { el, FONT_FAMILY };
