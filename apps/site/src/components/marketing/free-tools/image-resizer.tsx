"use client";

import { cn } from "@socialfly/ui/utils";
import {
	Building,
	Download,
	FileImage,
	Grid2x2,
	Image as ImageIcon,
	LayoutPanelTop,
	type LucideIcon,
	Maximize2,
	Pin,
	Square,
	Upload,
	User,
} from "lucide-react";
import { type DragEvent, useEffect, useId, useState } from "react";
import { toolButtonPrimary, toolLabel, toolPanel } from "./tool-ui";

type Preset = { name: string; width: number; height: number; icon: LucideIcon };
export type ResizerPlatform = "twitter" | "linkedin" | "pinterest";

const PRESETS: Record<ResizerPlatform, { label: string; presets: Preset[] }> = {
	twitter: {
		label: "Twitter",
		presets: [
			{ name: "Profile Picture", width: 400, height: 400, icon: User },
			{ name: "Header Image", width: 1500, height: 500, icon: FileImage },
			{ name: "Tweet Image", width: 1200, height: 628, icon: ImageIcon },
			{ name: "Twitter Card", width: 800, height: 418, icon: LayoutPanelTop },
		],
	},
	linkedin: {
		label: "LinkedIn",
		presets: [
			{ name: "Profile Picture", width: 400, height: 400, icon: User },
			{ name: "Banner Image", width: 1584, height: 396, icon: LayoutPanelTop },
			{ name: "Post Image", width: 1200, height: 628, icon: ImageIcon },
			{ name: "Company Logo", width: 300, height: 300, icon: Building },
		],
	},
	pinterest: {
		label: "Pinterest",
		presets: [
			{ name: "Standard Pin", width: 1000, height: 1500, icon: Pin },
			{ name: "Long Pin", width: 1000, height: 2100, icon: Maximize2 },
			{ name: "Square Pin", width: 1000, height: 1000, icon: Square },
			{ name: "Profile Picture", width: 165, height: 165, icon: User },
			{ name: "Board Cover", width: 600, height: 400, icon: Grid2x2 },
		],
	},
};

type FitMode = "cover" | "contain";
const MAX_BYTES = 10 * 1024 * 1024;

/** Draws the image into a canvas of the target size and resolves a JPEG blob. */
function renderResized(image: HTMLImageElement, preset: Preset, fit: FitMode): Promise<Blob> {
	const canvas = document.createElement("canvas");
	canvas.width = preset.width;
	canvas.height = preset.height;
	const ctx = canvas.getContext("2d");
	if (!ctx) return Promise.reject(new Error("Canvas is not supported in this browser."));
	ctx.fillStyle = "#ffffff";
	ctx.fillRect(0, 0, preset.width, preset.height);
	ctx.imageSmoothingQuality = "high";
	const scale =
		fit === "cover"
			? Math.max(preset.width / image.naturalWidth, preset.height / image.naturalHeight)
			: Math.min(preset.width / image.naturalWidth, preset.height / image.naturalHeight);
	const drawWidth = image.naturalWidth * scale;
	const drawHeight = image.naturalHeight * scale;
	ctx.drawImage(
		image,
		(preset.width - drawWidth) / 2,
		(preset.height - drawHeight) / 2,
		drawWidth,
		drawHeight,
	);
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error("Could not export the image."))),
			"image/jpeg",
			0.92,
		);
	});
}

/** In-browser photo resizer. Images never leave the visitor's device. */
export function ImageResizer({ platform }: { platform: ResizerPlatform }) {
	const id = useId();
	const { label, presets } = PRESETS[platform];
	const [presetIndex, setPresetIndex] = useState(0);
	const [fit, setFit] = useState<FitMode>("cover");
	const [sourceUrl, setSourceUrl] = useState<string | null>(null);
	const [image, setImage] = useState<HTMLImageElement | null>(null);
	const [resultUrl, setResultUrl] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [dragging, setDragging] = useState(false);
	const preset = presets[presetIndex] ?? presets[0];

	// Revoke object URLs when they are replaced or on unmount.
	useEffect(() => () => void (sourceUrl && URL.revokeObjectURL(sourceUrl)), [sourceUrl]);
	useEffect(() => () => void (resultUrl && URL.revokeObjectURL(resultUrl)), [resultUrl]);

	useEffect(() => {
		if (!image || !preset) return;
		let cancelled = false;
		renderResized(image, preset, fit)
			.then((blob) => {
				if (!cancelled) setResultUrl(URL.createObjectURL(blob));
			})
			.catch((err: unknown) => {
				if (!cancelled) setError(err instanceof Error ? err.message : "Failed to resize image.");
			});
		return () => {
			cancelled = true;
		};
	}, [image, preset, fit]);

	const loadFile = (file: File | undefined) => {
		if (!file) return;
		setError(null);
		if (!file.type.startsWith("image/")) {
			setError("Please choose an image file (PNG, JPG or WebP).");
			return;
		}
		if (file.size > MAX_BYTES) {
			setError("That image is larger than 10MB. Please choose a smaller file.");
			return;
		}
		const url = URL.createObjectURL(file);
		const img = new window.Image();
		img.onload = () => {
			setSourceUrl(url);
			setImage(img);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			setError("We couldn't read that image. Try a different file.");
		};
		img.src = url;
	};

	const onDrop = (event: DragEvent<HTMLLabelElement>) => {
		event.preventDefault();
		setDragging(false);
		loadFile(event.dataTransfer.files[0]);
	};

	if (!preset) return null;
	const fileName = `${platform}-${preset.name.toLowerCase().replace(/\s+/g, "-")}-${preset.width}x${preset.height}.jpg`;

	return (
		<div className={toolPanel}>
			<fieldset>
				<legend className={toolLabel}>Select {label} image type</legend>
				<div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
					{presets.map((item, index) => {
						const Icon = item.icon;
						const active = index === presetIndex;
						return (
							<button
								key={item.name}
								type="button"
								aria-pressed={active}
								onClick={() => setPresetIndex(index)}
								className={cn(
									"flex flex-col items-center gap-2 rounded-3xl border p-4 text-center transition-colors focus-visible:outline-2 focus-visible:outline-primary",
									active
										? "border-primary bg-primary/10 text-white"
										: "border-white/10 bg-black/40 text-white/50 hover:border-white/30",
								)}
							>
								<Icon className={cn("size-6", active && "text-primary")} aria-hidden="true" />
								<span className="font-bold text-sm">{item.name}</span>
								<span className="text-white/40 text-xs">
									{item.width} × {item.height}
								</span>
							</button>
						);
					})}
				</div>
			</fieldset>

			<fieldset className="mt-6">
				<legend className={toolLabel}>Fit</legend>
				<div className="flex flex-wrap gap-4 text-sm text-white/80">
					{(
						[
							["cover", "Crop to fill"],
							["contain", "Fit inside (white padding)"],
						] as const
					).map(([value, text]) => (
						<label key={value} className="flex cursor-pointer items-center gap-2">
							<input
								type="radio"
								name={`${id}-fit`}
								value={value}
								checked={fit === value}
								onChange={() => setFit(value)}
								className="size-4 accent-[#0BE27D]"
							/>
							{text}
						</label>
					))}
				</div>
			</fieldset>

			<p className={cn(toolLabel, "mt-8")}>Upload your image</p>
			<label
				htmlFor={`${id}-file`}
				onDragOver={(event) => {
					event.preventDefault();
					setDragging(true);
				}}
				onDragLeave={() => setDragging(false)}
				onDrop={onDrop}
				className={cn(
					"flex cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed px-6 py-12 text-center transition-colors has-[:focus-visible]:border-primary",
					dragging
						? "border-primary bg-primary/10"
						: "border-white/15 bg-black/30 hover:border-white/30",
				)}
			>
				<Upload className="size-10 text-primary" aria-hidden="true" />
				<span className="font-semibold text-white">
					Click to <span className="text-primary">upload</span> or drag and drop
				</span>
				<span className="text-sm text-white/40">
					PNG, JPG or WebP (max. 10MB) · processed on your device
				</span>
				<input
					id={`${id}-file`}
					type="file"
					accept="image/*"
					className="sr-only"
					onChange={(event) => {
						loadFile(event.target.files?.[0]);
						event.target.value = "";
					}}
				/>
			</label>

			<div aria-live="polite">
				{error ? <p className="mt-4 text-red-400 text-sm">{error}</p> : null}
				{sourceUrl && resultUrl ? (
					<div className="mt-8 grid gap-6 md:grid-cols-2">
						<figure>
							<figcaption className={toolLabel}>Original</figcaption>
							{/* biome-ignore lint/performance/noImgElement: local object URL preview, not optimisable */}
							<img
								src={sourceUrl}
								alt="Original upload"
								className="max-h-80 w-full rounded-2xl border border-white/10 bg-black/40 object-contain"
							/>
						</figure>
						<figure>
							<figcaption className={toolLabel}>
								Resized · {preset.width} × {preset.height}
							</figcaption>
							{/* biome-ignore lint/performance/noImgElement: local object URL preview, not optimisable */}
							<img
								src={resultUrl}
								alt={`Resized to ${preset.width} by ${preset.height} pixels`}
								className="max-h-80 w-full rounded-2xl border border-primary/30 bg-black/40 object-contain"
							/>
						</figure>
						<a
							href={resultUrl}
							download={fileName}
							className={cn(toolButtonPrimary, "md:col-span-2")}
						>
							<Download className="size-4" aria-hidden="true" />
							Download resized image
						</a>
					</div>
				) : null}
			</div>
		</div>
	);
}
