"use client";

import { Button } from "@socialfly/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@socialfly/ui/components/card";
import { Skeleton } from "@socialfly/ui/components/feedback";
import { Field, fieldAria } from "@socialfly/ui/components/field";
import { Input, Textarea } from "@socialfly/ui/components/input";
import { ImageIcon, PenSquare, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { RadioGroup } from "radix-ui";
import { type FormEvent, useState } from "react";
import { useGenerationRun } from "@/hooks/use-ai";
import { api, call } from "@/lib/api-client";
import type { AiCapabilities, AspectRatio, ImageInput } from "@/lib/api-types";
import { AiNotConfigured } from "../ai/ai-shared";
import { composeHref, GenerationProgress } from "./generation-status";

type Ratio = { value: AspectRatio; label: string; w: number; h: number };
const SQUARE: Ratio = { value: "1:1", label: "Square", w: 1, h: 1 };
const RATIOS: Ratio[] = [
	SQUARE,
	{ value: "4:5", label: "Portrait", w: 4, h: 5 },
	{ value: "9:16", label: "Story", w: 9, h: 16 },
	{ value: "16:9", label: "Landscape", w: 16, h: 9 },
];

const ratioOf = (value: string | undefined) => RATIOS.find((r) => r.value === value) ?? SQUARE;

export function ImageStudio({ caps }: { caps: AiCapabilities }) {
	const [prompt, setPrompt] = useState("");
	const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
	const [style, setStyle] = useState("");
	const [touched, setTouched] = useState(false);
	const run = useGenerationRun((input: ImageInput) => call(api.ai.images.$post({ json: input })));

	if (!caps.images) {
		return (
			<AiNotConfigured>
				Image generation needs an image model. Add <code>OPENAI_API_KEY</code> or{" "}
				<code>GEMINI_API_KEY</code> to the server's environment to turn it on. Carousels work
				without it.
			</AiNotConfigured>
		);
	}

	const promptError =
		touched && prompt.trim().length < 3 ? "Describe the image in a few words." : null;

	const generate = () => {
		setTouched(true);
		if (prompt.trim().length < 3) return;
		run.start({ prompt: prompt.trim(), aspectRatio, style: style.trim() || undefined });
	};

	function onSubmit(e: FormEvent) {
		e.preventDefault();
		generate();
	}

	// The ratio the shown image was asked for, not what's selected now.
	const shownInput = run.generation?.input as { aspectRatio?: string; prompt?: string } | undefined;
	const shown = ratioOf(shownInput?.aspectRatio ?? aspectRatio);

	return (
		<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
			<Card>
				<form onSubmit={onSubmit} noValidate>
					<CardHeader>
						<CardTitle>Describe your image</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-4">
						<Field
							label="Prompt"
							htmlFor="image-prompt"
							error={promptError}
							hint="Say what's in it, the setting and the mood. Text inside images rarely comes out right."
						>
							<Textarea
								id="image-prompt"
								value={prompt}
								maxLength={2000}
								placeholder="A cosy home office at sunrise, laptop open, plants on the desk"
								onChange={(e) => setPrompt(e.target.value)}
								disabled={run.busy}
								{...fieldAria("image-prompt", promptError, true)}
							/>
						</Field>
						<fieldset className="grid gap-1.5" disabled={run.busy}>
							<legend className="mb-1.5 font-medium text-sm leading-none">Aspect ratio</legend>
							<RadioGroup.Root
								value={aspectRatio}
								onValueChange={(v) => setAspectRatio(v as AspectRatio)}
								className="grid grid-cols-2 gap-2 sm:grid-cols-4"
								aria-label="Aspect ratio"
							>
								{RATIOS.map((r) => (
									<RadioGroup.Item
										key={r.value}
										value={r.value}
										className="group grid cursor-pointer justify-items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-2 py-3 text-center transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 data-[state=checked]:border-primary data-[state=checked]:bg-primary-soft"
									>
										<span className="flex h-8 items-center" aria-hidden="true">
											<span
												className="block rounded-[3px] border-2 border-subtle-foreground group-data-[state=checked]:border-primary-text"
												style={{
													width: r.w >= r.h ? 32 : (32 * r.w) / r.h,
													height: r.h >= r.w ? 32 : (32 * r.h) / r.w,
												}}
											/>
										</span>
										<span className="font-medium text-xs">{r.label}</span>
										<span className="text-[11px] text-muted-foreground">{r.value}</span>
									</RadioGroup.Item>
								))}
							</RadioGroup.Root>
						</fieldset>
						<Field label="Style (optional)" htmlFor="image-style">
							<Input
								id="image-style"
								value={style}
								maxLength={100}
								placeholder="e.g. flat illustration, film photo, 3D render"
								onChange={(e) => setStyle(e.target.value)}
								disabled={run.busy}
							/>
						</Field>
						<div>
							<Button type="submit" loading={run.busy}>
								<Sparkles />
								{run.busy ? "Generating…" : "Generate image"}
							</Button>
						</div>
					</CardContent>
				</form>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Result</CardTitle>
				</CardHeader>
				<CardContent>
					{!run.generation && !run.startError ? (
						<div
							className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border border-dashed bg-surface text-center text-muted-foreground text-sm"
							style={{ aspectRatio: `${shown.w} / ${shown.h}`, maxHeight: 480 }}
						>
							<ImageIcon className="size-6 text-subtle-foreground" aria-hidden="true" />
							Your image appears here.
						</div>
					) : (
						<GenerationProgress
							startError={run.startError}
							pollError={run.pollError}
							generation={run.generation}
							waitingLabel="Generating your image. This usually takes 10–40 seconds."
							placeholder={
								<Skeleton
									className="mx-auto w-full"
									style={{ aspectRatio: `${shown.w} / ${shown.h}`, maxHeight: 480 }}
								/>
							}
						>
							{(g) => (
								<div className="grid gap-4">
									{g.media.map((asset) => (
										// biome-ignore lint/performance/noImgElement: generated media lives on a runtime-configured storage host
										<img
											key={asset.id}
											src={asset.url}
											alt={asset.altText ?? shownInput?.prompt ?? "Generated image"}
											width={asset.width ?? undefined}
											height={asset.height ?? undefined}
											className="mx-auto max-h-[480px] w-auto rounded-lg ring-1 ring-border"
										/>
									))}
									<div className="flex flex-wrap gap-2">
										<Button asChild>
											<Link href={composeHref(g.id)}>
												<PenSquare />
												Use in a post
											</Link>
										</Button>
										<Button variant="outline" onClick={generate}>
											<RefreshCw />
											Generate another
										</Button>
									</div>
								</div>
							)}
						</GenerationProgress>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
