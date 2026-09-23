"use client";

import { Button } from "@socialfly/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@socialfly/ui/components/card";
import { Switch } from "@socialfly/ui/components/controls";
import { Alert, Skeleton, Spinner } from "@socialfly/ui/components/feedback";
import { Field, fieldAria, Label } from "@socialfly/ui/components/field";
import { Input, Textarea } from "@socialfly/ui/components/input";
import { NativeSelect } from "@socialfly/ui/components/select";
import { cn } from "@socialfly/ui/utils";
import { useMutation } from "@tanstack/react-query";
import {
	AlertTriangle,
	ArrowDown,
	ArrowLeft,
	ArrowUp,
	Clapperboard,
	ImageIcon,
	PenSquare,
	Plus,
	RotateCcw,
	Sparkles,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { RadioGroup } from "radix-ui";
import { type FormEvent, type ReactNode, useId, useRef, useState } from "react";
import { useAfterAiCall, useBrandProfile, useGenerationRun } from "@/hooks/use-ai";
import { api, call } from "@/lib/api-client";
import type {
	AiCapabilities,
	MediaAsset,
	VideoInput,
	VideoScene,
	VideoVoice,
} from "@/lib/api-types";
import { ApiError, isApiError } from "@/lib/errors";
import { formatDuration, formatUsd, pluralize } from "@/lib/format";
import type { ProviderId } from "@/lib/providers";
import { AiError, AiNotConfigured, AiUsage } from "../ai/ai-shared";
import { MediaPickerDialog } from "../composer/media-picker-dialog";
import { composeHref, GenerationProgress } from "./generation-status";
import { type ThemeId, ThemeSwatches } from "./theme-swatches";

// Limits mirror the API's video schemas; the server re-validates everything.
const MIN_SCENES = 1;
const MAX_SCENES = 12;
const CAPTION_MAX = 90;
const NARRATION_MAX = 400;
const VISUAL_MAX = 500;
const SCENE_MIN_SECONDS = 2;
const SCENE_MAX_SECONDS = 15;
const MAX_TOTAL_SECONDS = 120;
const DEFAULT_SCENE_SECONDS = 5;
const LENGTHS = [15, 30, 45, 60] as const;

const PLATFORMS: { id: ProviderId; label: string }[] = [
	{ id: "instagram", label: "Instagram Reels" },
	{ id: "youtube", label: "YouTube Shorts" },
	{ id: "facebook", label: "Facebook" },
	{ id: "linkedin", label: "LinkedIn" },
	{ id: "x", label: "X" },
	{ id: "threads", label: "Threads" },
];

const VOICES: { id: VideoVoice; label: string }[] = [
	{ id: "alloy", label: "Alloy — neutral" },
	{ id: "ash", label: "Ash — clear, confident" },
	{ id: "coral", label: "Coral — warm, friendly" },
	{ id: "echo", label: "Echo — calm, steady" },
	{ id: "sage", label: "Sage — soft, thoughtful" },
	{ id: "shimmer", label: "Shimmer — bright, upbeat" },
	{ id: "verse", label: "Verse — expressive" },
];
const STYLE_SUGGESTIONS = ["upbeat", "calm", "energetic", "friendly", "authoritative", "playful"];

/**
 * Rough per-unit prices for the cost note: an AI image costs a few cents to a
 * couple of dimes depending on the model (see packages/ai/src/pricing.ts), and
 * speech is billed per character. The budget ledger records the real cost.
 */
const IMAGE_USD_LOW = 0.04;
const IMAGE_USD_HIGH = 0.2;
const SPEECH_USD_PER_CHAR = 0.00002;

type Background = NonNullable<VideoInput["background"]>;
type Scene = {
	key: string;
	caption: string;
	narration: string;
	visual: string;
	durationSeconds: number;
	/** A library image for this scene's background; overrides the global mode. */
	media: MediaAsset | null;
};
type Stage = "script" | "scenes" | "render";

const STEPS: { id: Stage; label: string }[] = [
	{ id: "script", label: "Script" },
	{ id: "scenes", label: "Scenes" },
	{ id: "render", label: "Render" },
];

const withHashtags = (text: string, hashtags: string[]) =>
	hashtags.length ? `${text.trim()}\n\n${hashtags.join(" ")}` : text.trim();

const clampSeconds = (n: number) =>
	Math.min(SCENE_MAX_SECONDS, Math.max(SCENE_MIN_SECONDS, Math.round(n)));

export function VideoStudio({ caps }: { caps: AiCapabilities }) {
	const idBase = useId();
	const counter = useRef(0);
	const newScene = (s: Partial<VideoScene> = {}): Scene => {
		counter.current += 1;
		return {
			key: `${idBase}-${counter.current}`,
			caption: s.caption ?? "",
			narration: s.narration ?? "",
			visual: s.visual ?? "",
			durationSeconds: clampSeconds(s.durationSeconds ?? DEFAULT_SCENE_SECONDS),
			media: null,
		};
	};
	const blankScenes = () => [newScene(), newScene(), newScene()];

	// Without a text model there's no script step: start straight at the scenes.
	const [stage, setStage] = useState<Stage>(caps.text ? "script" : "scenes");
	const [topic, setTopic] = useState("");
	const [length, setLength] = useState<number>(30);
	const [platform, setPlatform] = useState<ProviderId>("instagram");
	const [topicTouched, setTopicTouched] = useState(false);
	const [scenes, setScenes] = useState<Scene[]>(() => (caps.text ? [] : blankScenes()));
	const [scenesTouched, setScenesTouched] = useState(false);
	const [voiceover, setVoiceover] = useState(caps.voiceover);
	const [voice, setVoice] = useState<VideoVoice>("coral");
	const [voiceStyle, setVoiceStyle] = useState("");
	const [background, setBackground] = useState<Background>(caps.images ? "ai" : "theme");
	const [theme, setTheme] = useState<ThemeId>("midnight");
	// null = untouched → show the brand name, which may load after this mounts.
	const [footer, setFooter] = useState<string | null>(null);
	const [postText, setPostText] = useState("");
	const [pickingFor, setPickingFor] = useState<string | null>(null);
	const brand = useBrandProfile();
	const afterAiCall = useAfterAiCall();

	const script = useMutation({
		mutationFn: () =>
			call(
				api.ai.videos.script.$post({
					json: { topic: topic.trim(), durationSeconds: length, platform, voiceover },
				}),
			),
		onSuccess: (res) => {
			setScenes(res.scenes.map((s) => newScene(s)));
			setPostText(withHashtags(res.caption, res.hashtags));
			setScenesTouched(false);
			setStage("scenes");
		},
		onSettled: afterAiCall,
	});
	// Rendering takes minutes, so poll a little less eagerly than images do.
	const render = useGenerationRun(
		(input: VideoInput) =>
			call(api.ai.videos.$post({ json: input })).catch((e: unknown) => {
				// The only 404 here is a library background that was deleted meanwhile.
				if (isApiError(e) && e.code === "not_found") {
					throw new ApiError(
						e.status,
						e.code,
						"A scene's library image no longer exists. Go back and pick another one.",
						e.details,
					);
				}
				throw e;
			}),
		{ pollMs: 3_000 },
	);

	const footerValue = footer ?? brand.data?.brandName ?? "";
	const topicError =
		topicTouched && topic.trim().length < 3 ? "Tell us what the video is about." : null;
	const totalSeconds = scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
	const tooLong = totalSeconds > MAX_TOTAL_SECONDS;
	const aiImageScenes = background === "ai" ? scenes.filter((s) => !s.media).length : 0;
	const speechChars = voiceover ? scenes.reduce((sum, s) => sum + s.narration.trim().length, 0) : 0;
	const pickingIndex = scenes.findIndex((s) => s.key === pickingFor);

	const sceneErrors = (s: Scene) => ({
		caption: scenesTouched && !s.caption.trim() ? "Every scene needs on-screen text." : null,
		visual:
			scenesTouched && background === "ai" && !s.media && !s.visual.trim()
				? "Describe the background image for this scene."
				: null,
	});

	function onScript(e: FormEvent) {
		e.preventDefault();
		setTopicTouched(true);
		if (topic.trim().length < 3) return;
		script.mutate();
	}

	function onRender(e: FormEvent) {
		e.preventDefault();
		setScenesTouched(true);
		const invalid = scenes.some(
			(s) => !s.caption.trim() || (background === "ai" && !s.media && !s.visual.trim()),
		);
		if (invalid || tooLong || scenes.length < MIN_SCENES) return;
		const mediaIds = scenes.map((s) => s.media?.id ?? null);
		render.start({
			scenes: scenes.map((s) => ({
				caption: s.caption.trim(),
				// Narration is only spoken with a voiceover; don't let stale lines stretch scenes.
				narration: voiceover ? s.narration.trim() : "",
				visual: s.visual.trim(),
				durationSeconds: s.durationSeconds,
			})),
			background,
			sceneMediaIds: mediaIds.some(Boolean) ? mediaIds : undefined,
			voiceover: { enabled: voiceover, voice, style: voiceStyle.trim() || undefined },
			theme,
			footer: footerValue.trim() || undefined,
		});
		setStage("render");
	}

	const updateScene = (key: string, patch: Partial<Scene>) =>
		setScenes((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
	const moveScene = (index: number, delta: number) =>
		setScenes((prev) => {
			const next = [...prev];
			const [item] = next.splice(index, 1);
			if (item) next.splice(index + delta, 0, item);
			return next;
		});

	const startOver = () => {
		setStage(caps.text ? "script" : "scenes");
		setScenes(caps.text ? [] : blankScenes());
		setPostText("");
		setScenesTouched(false);
		script.reset();
		render.reset();
	};

	// "Make changes": back to the scenes as they were; the rendered video stays in Recent.
	const backToScenes = () => {
		render.reset();
		setStage("scenes");
	};

	const steps = (
		<ol className="flex flex-wrap items-center gap-2 text-xs" aria-label="Steps">
			{STEPS.map((step, i) => {
				const current = step.id === stage;
				const skipped = step.id === "script" && !caps.text;
				return (
					<li
						key={step.id}
						aria-current={current ? "step" : undefined}
						className={cn(
							"flex items-center gap-1.5 rounded-full border px-2.5 py-1",
							current
								? "border-primary bg-primary-soft font-medium text-primary-text"
								: "border-border text-muted-foreground",
							skipped && "line-through opacity-60",
						)}
					>
						<span className="tabular-nums">{i + 1}.</span>
						{step.label}
					</li>
				);
			})}
		</ol>
	);

	if (stage === "script") {
		return (
			<div className="grid gap-4">
				{steps}
				<Card className="max-w-2xl">
					<form onSubmit={onScript} noValidate>
						<CardHeader>
							<CardTitle>1. Script</CardTitle>
							<CardDescription>
								AI writes the scenes — on-screen text, narration and a background idea for each —
								plus a caption and hashtags. You can edit everything next.
							</CardDescription>
						</CardHeader>
						<CardContent className="grid gap-4">
							<Field
								label="Topic"
								htmlFor="video-topic"
								error={topicError}
								hint="The more specific, the better — e.g. “3 quick ways to make cold brew at home”."
							>
								<Textarea
									id="video-topic"
									value={topic}
									maxLength={2000}
									onChange={(e) => setTopic(e.target.value)}
									disabled={script.isPending}
									{...fieldAria("video-topic", topicError, true)}
								/>
							</Field>
							<div className="grid gap-4 sm:grid-cols-2">
								<Field label="Length" htmlFor="video-length">
									<NativeSelect
										id="video-length"
										value={length}
										onChange={(e) => setLength(Number(e.target.value))}
										disabled={script.isPending}
									>
										{LENGTHS.map((n) => (
											<option key={n} value={n}>
												{n} seconds
											</option>
										))}
									</NativeSelect>
								</Field>
								<Field label="Platform" htmlFor="video-platform">
									<NativeSelect
										id="video-platform"
										value={platform}
										onChange={(e) => setPlatform(e.target.value as ProviderId)}
										disabled={script.isPending}
									>
										{PLATFORMS.map((p) => (
											<option key={p.id} value={p.id}>
												{p.label}
											</option>
										))}
									</NativeSelect>
								</Field>
							</div>
							<VoiceoverSwitch
								id="video-script-voiceover"
								checked={voiceover}
								onCheckedChange={setVoiceover}
								available={caps.voiceover}
								disabled={script.isPending}
							/>
							<AiError error={script.error} />
							<div className="flex flex-wrap items-center gap-2">
								<Button type="submit" loading={script.isPending}>
									<Sparkles />
									{script.isPending ? "Writing…" : "Write script"}
								</Button>
								<Button
									variant="ghost"
									disabled={script.isPending}
									onClick={() => {
										setScenes(blankScenes());
										setStage("scenes");
									}}
								>
									Skip and write it myself
								</Button>
							</div>
						</CardContent>
					</form>
				</Card>
			</div>
		);
	}

	if (stage === "render") {
		const asset = render.generation?.media[0];
		const poster = scenes.find((s) => s.media)?.media?.url;
		return (
			<div className="grid gap-4">
				{steps}
				<Card className="max-w-2xl">
					<CardHeader className="flex-row items-start justify-between gap-3">
						<div className="grid gap-1">
							<CardTitle>3. Your video</CardTitle>
							<CardDescription>
								{scenes.length} {pluralize(scenes.length, "scene")} ·{" "}
								{formatDuration(totalSeconds * 1000)} · 9:16
							</CardDescription>
						</div>
						<Button variant="ghost" size="sm" onClick={backToScenes}>
							<ArrowLeft />
							{render.busy ? "Back to scenes" : "Make changes"}
						</Button>
					</CardHeader>
					<CardContent>
						{/* Between the click and the 202 there's no generation to show yet. */}
						{!render.generation && !render.startError ? (
							<div className="grid gap-3">
								<p
									className="flex items-center gap-2 text-muted-foreground text-sm"
									aria-live="polite"
								>
									<Spinner />
									Sending your scenes…
								</p>
								<Skeleton className="aspect-[9/16] w-full max-w-72" />
							</div>
						) : null}
						<GenerationProgress
							startError={render.startError}
							pollError={render.pollError}
							generation={render.generation}
							waitingLabel="Rendering your video. This takes 1–3 minutes; you can leave this page and find it under Recent."
							placeholder={<Skeleton className="aspect-[9/16] w-full max-w-72" />}
						>
							{(g) =>
								asset ? (
									<div className="grid gap-4">
										<video
											// A `#t` fragment makes browsers paint the first frame when there's no poster.
											src={poster ? asset.url : `${asset.url}#t=0.1`}
											poster={poster}
											controls
											playsInline
											preload="metadata"
											title="Generated video preview"
											aria-label="Generated video preview"
											className="aspect-[9/16] w-full max-w-72 rounded-lg bg-black ring-1 ring-border"
										>
											<track kind="captions" />
										</video>
										<p className="text-muted-foreground text-xs">
											{asset.durationMs ? formatDuration(asset.durationMs) : null}
											{asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : null} ·
											Saved to your media library.
										</p>
										<div className="flex flex-wrap gap-2">
											<Button asChild>
												<Link href={composeHref(g.id, postText)}>
													<PenSquare />
													Use in a post
												</Link>
											</Button>
											<Button variant="outline" onClick={backToScenes}>
												<ArrowLeft />
												Make changes
											</Button>
										</div>
									</div>
								) : (
									<Alert tone="danger" icon={AlertTriangle} title="No video came back">
										The render finished without a file. Please try again.
									</Alert>
								)
							}
						</GenerationProgress>
						{render.startError ? (
							<div className="mt-4">
								<Button variant="outline" onClick={backToScenes}>
									<ArrowLeft />
									Back to scenes
								</Button>
							</div>
						) : null}
					</CardContent>
				</Card>
			</div>
		);
	}

	const lowCost = aiImageScenes * IMAGE_USD_LOW + speechChars * SPEECH_USD_PER_CHAR;
	const highCost = aiImageScenes * IMAGE_USD_HIGH + speechChars * SPEECH_USD_PER_CHAR;

	return (
		<div className="grid gap-4">
			{steps}
			{caps.text ? null : (
				<AiNotConfigured>
					AI writing needs <code>ANTHROPIC_API_KEY</code> on the server, so write the scenes
					yourself. Rendering them into a video works without it.
				</AiNotConfigured>
			)}
			<form
				onSubmit={onRender}
				noValidate
				className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"
			>
				<Card>
					<CardHeader className="flex-row items-start justify-between gap-3">
						<div className="grid gap-1">
							<CardTitle>2. Scenes</CardTitle>
							<CardDescription>
								Each scene is one full-screen shot with its text on top. {MIN_SCENES}–{MAX_SCENES}{" "}
								scenes, up to {MAX_TOTAL_SECONDS} seconds in total.
							</CardDescription>
						</div>
						<Button variant="ghost" size="sm" onClick={startOver}>
							<RotateCcw />
							Start over
						</Button>
					</CardHeader>
					<CardContent className="grid gap-3">
						<ol className="grid gap-3" aria-label="Scenes">
							{scenes.map((scene, index) => {
								const n = index + 1;
								const ids = {
									caption: `${scene.key}-caption`,
									narration: `${scene.key}-narration`,
									visual: `${scene.key}-visual`,
									duration: `${scene.key}-duration`,
								};
								const errors = sceneErrors(scene);
								const autoLabel = background === "ai" ? "AI image" : "Theme colour";
								return (
									<li
										key={scene.key}
										className="grid gap-3 rounded-lg border border-border bg-surface p-3"
									>
										<div className="flex items-center justify-between gap-2">
											<p className="font-medium text-sm">Scene {n}</p>
											<div className="flex gap-1">
												<Button
													variant="ghost"
													size="icon-xs"
													aria-label={`Move scene ${n} up`}
													disabled={index === 0}
													onClick={() => moveScene(index, -1)}
												>
													<ArrowUp />
												</Button>
												<Button
													variant="ghost"
													size="icon-xs"
													aria-label={`Move scene ${n} down`}
													disabled={index === scenes.length - 1}
													onClick={() => moveScene(index, 1)}
												>
													<ArrowDown />
												</Button>
												<Button
													variant="ghost"
													size="icon-xs"
													aria-label={`Remove scene ${n}`}
													disabled={scenes.length <= MIN_SCENES}
													onClick={() =>
														setScenes((prev) => prev.filter((s) => s.key !== scene.key))
													}
												>
													<Trash2 />
												</Button>
											</div>
										</div>
										<Field
											label="On-screen text"
											htmlFor={ids.caption}
											error={errors.caption}
											hint={
												<span className="tabular-nums">
													{scene.caption.length}/{CAPTION_MAX}
												</span>
											}
										>
											<Input
												id={ids.caption}
												value={scene.caption}
												maxLength={CAPTION_MAX}
												onChange={(e) => updateScene(scene.key, { caption: e.target.value })}
												{...fieldAria(ids.caption, errors.caption, true)}
											/>
										</Field>
										{voiceover ? (
											<Field
												label="Narration"
												htmlFor={ids.narration}
												hint={`Spoken over this scene. ${scene.narration.length}/${NARRATION_MAX}`}
											>
												<Textarea
													id={ids.narration}
													value={scene.narration}
													maxLength={NARRATION_MAX}
													className="min-h-16"
													onChange={(e) => updateScene(scene.key, { narration: e.target.value })}
													{...fieldAria(ids.narration, null, true)}
												/>
											</Field>
										) : null}
										<div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
											<div className="grid content-start gap-1.5">
												<p className="font-medium text-sm leading-none" id={`${scene.key}-bg`}>
													Background
												</p>
												<RadioGroup.Root
													aria-labelledby={`${scene.key}-bg`}
													value={scene.media ? "library" : "auto"}
													onValueChange={(v) =>
														v === "library"
															? setPickingFor(scene.key)
															: updateScene(scene.key, { media: null })
													}
													className="flex flex-wrap gap-1.5"
												>
													<SegmentItem value="auto">{autoLabel}</SegmentItem>
													<SegmentItem value="library">From media library</SegmentItem>
												</RadioGroup.Root>
												{scene.media ? (
													<div className="mt-1 flex items-center gap-2">
														{/* biome-ignore lint/performance/noImgElement: user media from a runtime-configured storage host */}
														<img
															src={scene.media.url}
															alt=""
															className="h-12 w-7 rounded object-cover ring-1 ring-border"
														/>
														<span className="min-w-0 truncate text-muted-foreground text-xs">
															{scene.media.fileName}
														</span>
														<Button
															variant="ghost"
															size="xs"
															onClick={() => setPickingFor(scene.key)}
															aria-label={`Change the background image for scene ${n}`}
														>
															Change
														</Button>
													</div>
												) : null}
											</div>
											<Field label="Duration" htmlFor={ids.duration}>
												<NativeSelect
													id={ids.duration}
													value={scene.durationSeconds}
													onChange={(e) =>
														updateScene(scene.key, { durationSeconds: Number(e.target.value) })
													}
												>
													{Array.from(
														{ length: SCENE_MAX_SECONDS - SCENE_MIN_SECONDS + 1 },
														(_, i) => i + SCENE_MIN_SECONDS,
													).map((s) => (
														<option key={s} value={s}>
															{s} s
														</option>
													))}
												</NativeSelect>
											</Field>
										</div>
										{scene.media ? null : (
											<Field
												label={background === "ai" ? "Background image prompt" : "Visual idea"}
												htmlFor={ids.visual}
												error={errors.visual}
												hint={
													background === "ai"
														? "What the AI should draw behind the text. No words — the text is added on top."
														: "Not used with theme colours, but kept if you switch to AI images."
												}
											>
												<Textarea
													id={ids.visual}
													value={scene.visual}
													maxLength={VISUAL_MAX}
													className="min-h-14"
													onChange={(e) => updateScene(scene.key, { visual: e.target.value })}
													{...fieldAria(ids.visual, errors.visual, true)}
												/>
											</Field>
										)}
									</li>
								);
							})}
						</ol>
						<div className="flex flex-wrap items-center justify-between gap-2">
							{scenes.length < MAX_SCENES ? (
								<Button
									variant="outline"
									size="sm"
									onClick={() => setScenes((prev) => [...prev, newScene()])}
								>
									<Plus />
									Add scene
								</Button>
							) : (
								<span className="text-muted-foreground text-xs">
									{MAX_SCENES} scenes is the maximum.
								</span>
							)}
							<p
								className={cn("text-sm tabular-nums", tooLong && "font-medium text-danger")}
								aria-live="polite"
							>
								Total: {formatDuration(totalSeconds * 1000)}
							</p>
						</div>
						{tooLong ? (
							<Alert tone="warning" icon={AlertTriangle}>
								Videos can be at most {MAX_TOTAL_SECONDS} seconds. Shorten or remove a scene (
								{totalSeconds - MAX_TOTAL_SECONDS} s over).
							</Alert>
						) : null}
					</CardContent>
				</Card>

				<Card className="lg:sticky lg:top-6">
					<CardHeader>
						<CardTitle>Style & sound</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-4">
						<div className="grid gap-1.5">
							<p className="font-medium text-sm leading-none" id="video-bg-mode">
								Scene backgrounds
							</p>
							<RadioGroup.Root
								aria-labelledby="video-bg-mode"
								aria-describedby="video-bg-mode-hint"
								value={background}
								onValueChange={(v) => setBackground(v as Background)}
								className="flex flex-wrap gap-1.5"
							>
								<SegmentItem value="ai" disabled={!caps.images}>
									<Sparkles aria-hidden="true" className="size-3.5" />
									AI images
								</SegmentItem>
								<SegmentItem value="theme">Theme colour</SegmentItem>
							</RadioGroup.Root>
							<p id="video-bg-mode-hint" className="text-muted-foreground text-xs">
								{caps.images ? (
									"Used for every scene without a library image."
								) : (
									<>
										AI backgrounds need <code>OPENAI_API_KEY</code> or <code>GEMINI_API_KEY</code>{" "}
										on the server. Theme colours and library images work without it.
									</>
								)}
							</p>
						</div>
						<ThemeSwatches value={theme} onChange={setTheme} aspect="video" />
						<div className="grid gap-3 rounded-lg border border-border p-3">
							<VoiceoverSwitch
								id="video-voiceover"
								checked={voiceover}
								onCheckedChange={setVoiceover}
								available={caps.voiceover}
							/>
							{voiceover ? (
								<>
									<Field label="Voice" htmlFor="video-voice">
										<NativeSelect
											id="video-voice"
											value={voice}
											onChange={(e) => setVoice(e.target.value as VideoVoice)}
										>
											{VOICES.map((v) => (
												<option key={v.id} value={v.id}>
													{v.label}
												</option>
											))}
										</NativeSelect>
									</Field>
									<Field
										label="Delivery (optional)"
										htmlFor="video-voice-style"
										hint="How it should sound, e.g. upbeat, calm, like a sports commentator."
									>
										<Input
											id="video-voice-style"
											value={voiceStyle}
											maxLength={200}
											list="video-voice-styles"
											onChange={(e) => setVoiceStyle(e.target.value)}
											{...fieldAria("video-voice-style", null, true)}
										/>
									</Field>
									<datalist id="video-voice-styles">
										{STYLE_SUGGESTIONS.map((s) => (
											<option key={s} value={s} />
										))}
									</datalist>
								</>
							) : null}
						</div>
						<Field
							label="Footer"
							htmlFor="video-footer"
							hint="Small text on every scene, e.g. your brand or @handle."
						>
							<Input
								id="video-footer"
								value={footerValue}
								maxLength={60}
								onChange={(e) => setFooter(e.target.value)}
								{...fieldAria("video-footer", null, true)}
							/>
						</Field>
						<Field
							label="Post text"
							htmlFor="video-post-text"
							hint="Goes into the composer with the video."
						>
							<Textarea
								id="video-post-text"
								value={postText}
								maxLength={10_000}
								className="min-h-24"
								onChange={(e) => setPostText(e.target.value)}
								{...fieldAria("video-post-text", null, true)}
							/>
						</Field>
						{aiImageScenes > 0 || speechChars > 0 ? (
							<p className="text-muted-foreground text-xs">
								Estimated AI cost:{" "}
								<span className="font-medium text-foreground tabular-nums">
									{formatUsd(lowCost)}
									{highCost > lowCost ? `–${formatUsd(highCost)}` : ""}
								</span>{" "}
								(
								{[
									aiImageScenes ? `${aiImageScenes} AI ${pluralize(aiImageScenes, "image")}` : null,
									speechChars ? `${speechChars} characters of voiceover` : null,
								]
									.filter(Boolean)
									.join(", ")}
								). Rendering itself is free.
							</p>
						) : null}
						<AiUsage />
						<Button type="submit" disabled={tooLong || scenes.length < MIN_SCENES}>
							<Clapperboard />
							Render video
						</Button>
					</CardContent>
				</Card>
			</form>

			<MediaPickerDialog
				open={pickingFor !== null}
				onOpenChange={(open) => {
					if (!open) setPickingFor(null);
				}}
				kind="image"
				multiple={false}
				title="Choose a background"
				description={
					pickingIndex >= 0
						? `Pick an image from your library for scene ${pickingIndex + 1}. It's cropped to fill a 9:16 frame.`
						: "Pick an image from your library."
				}
				confirmLabel="Use image"
				onConfirm={([asset]) => {
					if (pickingFor && asset) updateScene(pickingFor, { media: asset });
				}}
			/>
		</div>
	);
}

/** A pill-shaped radio, for short either/or choices inside a scene. */
function SegmentItem({
	value,
	disabled,
	children,
}: {
	value: string;
	disabled?: boolean;
	children: ReactNode;
}) {
	return (
		<RadioGroup.Item
			value={value}
			disabled={disabled}
			className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border bg-surface-raised px-2.5 py-1 text-xs transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary-soft data-[state=checked]:font-medium data-[state=checked]:text-primary-text"
		>
			{value === "library" ? <ImageIcon aria-hidden="true" className="size-3.5" /> : null}
			{children}
		</RadioGroup.Item>
	);
}

/** The voiceover on/off switch; explains itself when the server has no speech model. */
function VoiceoverSwitch({
	id,
	checked,
	onCheckedChange,
	available,
	disabled,
}: {
	id: string;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	available: boolean;
	disabled?: boolean;
}) {
	return (
		<div className="grid gap-1">
			<div className="flex items-center gap-2">
				<Switch
					id={id}
					checked={available && checked}
					onCheckedChange={onCheckedChange}
					disabled={disabled || !available}
					aria-describedby={`${id}-hint`}
				/>
				<Label htmlFor={id} className="font-normal">
					AI voiceover
				</Label>
			</div>
			<p id={`${id}-hint`} className="text-muted-foreground text-xs">
				{available ? (
					"A narrator reads each scene's script. Turn it off for a silent video with on-screen text only."
				) : (
					<>
						Voiceover needs <code>OPENAI_API_KEY</code> on the server. Videos render silently
						without it.
					</>
				)}
			</p>
		</div>
	);
}
