"use client";

import { useMutation } from "@tanstack/react-query";
import {
	ArrowDown,
	ArrowUp,
	GalleryHorizontal,
	PenSquare,
	Plus,
	RotateCcw,
	Sparkles,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { RadioGroup } from "radix-ui";
import { type FormEvent, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/feedback";
import { Field, fieldAria } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { useAfterAiCall, useBrandProfile, useGenerationRun } from "@/hooks/use-ai";
import { api, call } from "@/lib/api-client";
import type { AiCapabilities, CarouselInput } from "@/lib/api-types";
import { PROVIDERS, type ProviderId } from "@/lib/providers";
import { AiError, AiNotConfigured } from "../ai/ai-shared";
import { composeHref, GenerationProgress } from "./generation-status";

const MIN_SLIDES = 2;
const MAX_SLIDES = 10;
const HEADING_MAX = 80;
const BODY_MAX = 280;

/**
 * Mirrors CAROUSEL_THEMES in packages/ai/src/render.ts (the renderer is the
 * source of truth; the web app doesn't depend on @socialfly/ai). Only used to
 * draw the swatches, so a drift is cosmetic.
 */
const THEMES = [
	{ id: "midnight", label: "Midnight", bg: "#0B1220", fg: "#F8FAFC", accent: "#0BE27D" },
	{ id: "paper", label: "Paper", bg: "#FAF7F2", fg: "#1F2937", accent: "#E4572E" },
	{ id: "ocean", label: "Ocean", bg: "#0E3B5C", fg: "#F1F5F9", accent: "#5EEAD4" },
	{ id: "sunrise", label: "Sunrise", bg: "#FFF4E6", fg: "#3B1F0E", accent: "#F97316" },
] as const;
type ThemeId = (typeof THEMES)[number]["id"];

type Slide = { key: string; heading: string; body: string };

const PLATFORM_OPTIONS: ProviderId[] = ["linkedin", "instagram", "facebook", "threads", "x"];

const withHashtags = (text: string, hashtags: string[]) =>
	hashtags.length ? `${text.trim()}\n\n${hashtags.join(" ")}` : text.trim();

export function CarouselStudio({ caps }: { caps: AiCapabilities }) {
	const idBase = useId();
	const counter = useRef(0);
	const newSlide = (heading = "", body = ""): Slide => {
		counter.current += 1;
		return { key: `${idBase}-${counter.current}`, heading, body };
	};
	const blankSlides = () => [newSlide(), newSlide(), newSlide()];

	// Without a text model there's no outline step: start straight at the slides.
	const [stage, setStage] = useState<"topic" | "slides">(caps.text ? "topic" : "slides");
	const [topic, setTopic] = useState("");
	const [slideCount, setSlideCount] = useState(6);
	const [platform, setPlatform] = useState<ProviderId>("linkedin");
	const [topicTouched, setTopicTouched] = useState(false);
	const [slides, setSlides] = useState<Slide[]>(() => (caps.text ? [] : blankSlides()));
	const [theme, setTheme] = useState<ThemeId>("midnight");
	// null = untouched → show the brand name, which may load after this mounts.
	const [footer, setFooter] = useState<string | null>(null);
	const [caption, setCaption] = useState("");
	const [slidesTouched, setSlidesTouched] = useState(false);
	const brand = useBrandProfile();
	const afterAiCall = useAfterAiCall();

	const outline = useMutation({
		mutationFn: () =>
			call(api.ai.carousels.outline.$post({ json: { topic: topic.trim(), slideCount, platform } })),
		onSuccess: (res) => {
			setSlides(res.slides.map((s) => newSlide(s.heading, s.body)));
			setCaption(withHashtags(res.caption, res.hashtags));
			setStage("slides");
		},
		onSettled: afterAiCall,
	});
	const render = useGenerationRun((input: CarouselInput) =>
		call(api.ai.carousels.$post({ json: input })),
	);

	const topicError =
		topicTouched && topic.trim().length < 3 ? "Tell us what the carousel is about." : null;
	const footerValue = footer ?? brand.data?.brandName ?? "";

	function onOutline(e: FormEvent) {
		e.preventDefault();
		setTopicTouched(true);
		if (topic.trim().length < 3) return;
		outline.mutate();
	}

	function onRender(e: FormEvent) {
		e.preventDefault();
		setSlidesTouched(true);
		if (slides.some((s) => !s.heading.trim())) return;
		render.start({
			slides: slides.map((s) => ({ heading: s.heading.trim(), body: s.body.trim() })),
			theme,
			footer: footerValue.trim() || undefined,
		});
	}

	const updateSlide = (key: string, patch: Partial<Slide>) =>
		setSlides((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
	const moveSlide = (index: number, delta: number) =>
		setSlides((prev) => {
			const next = [...prev];
			const [item] = next.splice(index, 1);
			if (item) next.splice(index + delta, 0, item);
			return next;
		});

	const startOver = () => {
		setStage(caps.text ? "topic" : "slides");
		setSlides(caps.text ? [] : blankSlides());
		setCaption("");
		setSlidesTouched(false);
		outline.reset();
		render.reset();
	};

	if (stage === "topic") {
		return (
			<Card className="max-w-2xl">
				<form onSubmit={onOutline} noValidate>
					<CardHeader>
						<CardTitle>1. What's it about?</CardTitle>
						<CardDescription>
							AI drafts the slides, a caption and hashtags. You can edit everything next.
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4">
						<Field
							label="Topic"
							htmlFor="carousel-topic"
							error={topicError}
							hint="The more specific, the better — e.g. “5 mistakes first-time founders make when hiring”."
						>
							<Textarea
								id="carousel-topic"
								value={topic}
								maxLength={2000}
								onChange={(e) => setTopic(e.target.value)}
								disabled={outline.isPending}
								{...fieldAria("carousel-topic", topicError, true)}
							/>
						</Field>
						<div className="grid gap-4 sm:grid-cols-2">
							<Field label="Slides" htmlFor="carousel-count">
								<NativeSelect
									id="carousel-count"
									value={slideCount}
									onChange={(e) => setSlideCount(Number(e.target.value))}
									disabled={outline.isPending}
								>
									{Array.from({ length: 8 }, (_, i) => i + 3).map((n) => (
										<option key={n} value={n}>
											{n} slides
										</option>
									))}
								</NativeSelect>
							</Field>
							<Field label="Platform" htmlFor="carousel-platform">
								<NativeSelect
									id="carousel-platform"
									value={platform}
									onChange={(e) => setPlatform(e.target.value as ProviderId)}
									disabled={outline.isPending}
								>
									{PLATFORM_OPTIONS.map((p) => (
										<option key={p} value={p}>
											{PROVIDERS[p].name}
										</option>
									))}
								</NativeSelect>
							</Field>
						</div>
						<AiError error={outline.error} />
						<div className="flex flex-wrap items-center gap-2">
							<Button type="submit" loading={outline.isPending}>
								<Sparkles />
								{outline.isPending ? "Drafting…" : "Draft slides"}
							</Button>
							<Button
								variant="ghost"
								disabled={outline.isPending}
								onClick={() => {
									setSlides(blankSlides());
									setStage("slides");
								}}
							>
								Skip and write them myself
							</Button>
						</div>
					</CardContent>
				</form>
			</Card>
		);
	}

	return (
		<div className="grid gap-6">
			{caps.text ? null : (
				<AiNotConfigured>
					AI writing needs <code>ANTHROPIC_API_KEY</code> on the server, so write the slides
					yourself. Rendering them into images works without it.
				</AiNotConfigured>
			)}
			<form
				onSubmit={onRender}
				noValidate
				className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]"
			>
				<Card>
					<CardHeader className="flex-row items-start justify-between gap-3">
						<div className="grid gap-1">
							<CardTitle>2. Slides</CardTitle>
							<CardDescription>
								Slide 1 is the cover. Keep one idea per slide; {MIN_SLIDES}–{MAX_SLIDES} slides.
							</CardDescription>
						</div>
						<Button variant="ghost" size="sm" onClick={startOver} disabled={render.busy}>
							<RotateCcw />
							Start over
						</Button>
					</CardHeader>
					<CardContent className="grid gap-3">
						<ol className="grid gap-3" aria-label="Slides">
							{slides.map((slide, index) => {
								const headingId = `${slide.key}-heading`;
								const bodyId = `${slide.key}-body`;
								const headingError =
									slidesTouched && !slide.heading.trim() ? "Every slide needs a heading." : null;
								return (
									<li
										key={slide.key}
										className="grid gap-3 rounded-lg border border-border bg-surface p-3"
									>
										<div className="flex items-center justify-between gap-2">
											<p className="font-medium text-sm">
												Slide {index + 1}
												{index === 0 ? (
													<span className="ml-1.5 text-muted-foreground text-xs">(cover)</span>
												) : null}
											</p>
											<div className="flex gap-1">
												<Button
													variant="ghost"
													size="icon-xs"
													aria-label={`Move slide ${index + 1} up`}
													disabled={index === 0 || render.busy}
													onClick={() => moveSlide(index, -1)}
												>
													<ArrowUp />
												</Button>
												<Button
													variant="ghost"
													size="icon-xs"
													aria-label={`Move slide ${index + 1} down`}
													disabled={index === slides.length - 1 || render.busy}
													onClick={() => moveSlide(index, 1)}
												>
													<ArrowDown />
												</Button>
												<Button
													variant="ghost"
													size="icon-xs"
													aria-label={`Remove slide ${index + 1}`}
													disabled={slides.length <= MIN_SLIDES || render.busy}
													onClick={() =>
														setSlides((prev) => prev.filter((s) => s.key !== slide.key))
													}
												>
													<Trash2 />
												</Button>
											</div>
										</div>
										<Field label="Heading" htmlFor={headingId} error={headingError}>
											<Input
												id={headingId}
												value={slide.heading}
												maxLength={HEADING_MAX}
												disabled={render.busy}
												onChange={(e) => updateSlide(slide.key, { heading: e.target.value })}
												{...fieldAria(headingId, headingError)}
											/>
										</Field>
										<Field label="Body" htmlFor={bodyId} hint={`${slide.body.length}/${BODY_MAX}`}>
											<Textarea
												id={bodyId}
												value={slide.body}
												maxLength={BODY_MAX}
												disabled={render.busy}
												className="min-h-16"
												onChange={(e) => updateSlide(slide.key, { body: e.target.value })}
												{...fieldAria(bodyId, null, true)}
											/>
										</Field>
									</li>
								);
							})}
						</ol>
						{slides.length < MAX_SLIDES ? (
							<div>
								<Button
									variant="outline"
									size="sm"
									disabled={render.busy}
									onClick={() => setSlides((prev) => [...prev, newSlide()])}
								>
									<Plus />
									Add slide
								</Button>
							</div>
						) : null}
					</CardContent>
				</Card>

				<Card className="lg:sticky lg:top-6">
					<CardHeader>
						<CardTitle>3. Design</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-4">
						<fieldset className="grid gap-1.5" disabled={render.busy}>
							<legend className="mb-1.5 font-medium text-sm leading-none">Theme</legend>
							<RadioGroup.Root
								value={theme}
								onValueChange={(v) => setTheme(v as ThemeId)}
								className="grid grid-cols-4 gap-2"
								aria-label="Theme"
							>
								{THEMES.map((t) => (
									<RadioGroup.Item
										key={t.id}
										value={t.id}
										className="group grid cursor-pointer justify-items-center gap-1 rounded-lg p-1 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
									>
										<span
											aria-hidden="true"
											className="grid aspect-[4/5] w-full content-end gap-1 rounded-md p-1.5 ring-1 ring-border transition group-data-[state=checked]:ring-2 group-data-[state=checked]:ring-primary group-data-[state=checked]:ring-offset-2 group-data-[state=checked]:ring-offset-surface-raised"
											style={{ background: t.bg }}
										>
											<span className="h-1 w-3 rounded-full" style={{ background: t.accent }} />
											<span className="h-1.5 w-full rounded-full" style={{ background: t.fg }} />
											<span
												className="h-1 w-2/3 rounded-full opacity-60"
												style={{ background: t.fg }}
											/>
										</span>
										<span className="text-[11px] group-data-[state=checked]:font-medium">
											{t.label}
										</span>
									</RadioGroup.Item>
								))}
							</RadioGroup.Root>
						</fieldset>
						<Field
							label="Footer"
							htmlFor="carousel-footer"
							hint="Small text on every slide, e.g. your brand or @handle."
						>
							<Input
								id="carousel-footer"
								value={footerValue}
								maxLength={60}
								disabled={render.busy}
								onChange={(e) => setFooter(e.target.value)}
								{...fieldAria("carousel-footer", null, true)}
							/>
						</Field>
						<Field
							label="Post text"
							htmlFor="carousel-caption"
							hint="Goes into the composer with the slides."
						>
							<Textarea
								id="carousel-caption"
								value={caption}
								maxLength={10_000}
								disabled={render.busy}
								className="min-h-28"
								onChange={(e) => setCaption(e.target.value)}
								{...fieldAria("carousel-caption", null, true)}
							/>
						</Field>
						<Button type="submit" loading={render.busy}>
							<GalleryHorizontal />
							{render.busy ? "Rendering…" : render.generation ? "Render again" : "Render carousel"}
						</Button>
					</CardContent>
				</Card>
			</form>

			{render.generation || render.startError ? (
				<Card>
					<CardHeader>
						<CardTitle>Your carousel</CardTitle>
					</CardHeader>
					<CardContent>
						<GenerationProgress
							startError={render.startError}
							pollError={render.pollError}
							generation={render.generation}
							waitingLabel="Rendering your slides…"
							placeholder={
								<div className="flex gap-3 overflow-hidden">
									{slides.map((s) => (
										<Skeleton key={s.key} className="aspect-[4/5] w-40 shrink-0 sm:w-48" />
									))}
								</div>
							}
						>
							{(g) => (
								<div className="grid gap-4">
									<ul
										className="scrollbar-thin flex snap-x gap-3 overflow-x-auto pb-2"
										aria-label="Rendered slides"
									>
										{g.media.map((asset, i) => (
											<li key={asset.id} className="w-40 shrink-0 snap-start sm:w-48">
												{/* biome-ignore lint/performance/noImgElement: generated media lives on a runtime-configured storage host */}
												<img
													src={asset.url}
													alt={asset.altText ?? `Slide ${i + 1}`}
													loading="lazy"
													className="aspect-[4/5] w-full rounded-md object-cover ring-1 ring-border"
												/>
											</li>
										))}
									</ul>
									<div className="flex flex-wrap gap-2">
										<Button asChild>
											<Link href={composeHref(g.id, caption)}>
												<PenSquare />
												Use in a post
											</Link>
										</Button>
									</div>
								</div>
							)}
						</GenerationProgress>
					</CardContent>
				</Card>
			) : null}
		</div>
	);
}
