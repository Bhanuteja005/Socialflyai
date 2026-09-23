"use client";

import { Button } from "@socialfly/ui/components/button";
import { Field, fieldAria } from "@socialfly/ui/components/field";
import { Input, Textarea } from "@socialfly/ui/components/input";
import { NativeSelect } from "@socialfly/ui/components/select";
import { cn } from "@socialfly/ui/utils";
import { Film, ImagePlus, Plus, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { CALLS_TO_ACTION, SEARCH_LIMITS } from "@/lib/ads";
import type { AdCallToAction, AdsProvider } from "@/lib/api-types";
import { textLength } from "@/lib/format";
import { MediaPickerDialog } from "../../composer/media-picker-dialog";
import { AdCopyDialog } from "./ad-copy-dialog";
import { mediaRule, type StepErrors, type WizardState } from "./wizard-state";

/** "42 / 125", red once over. Announced politely so screen readers hear it without being interrupted. */
function Counter({ value, max, id }: { value: string; max?: number; id: string }) {
	if (!max) return null;
	const n = textLength(value);
	return (
		<span
			id={id}
			className={cn("text-xs tabular-nums", n > max ? "text-danger" : "text-subtle-foreground")}
		>
			{n} / {max}
			{n > max ? <span className="sr-only"> — too long</span> : null}
		</span>
	);
}

export function StepCreative({
	state,
	update,
	provider,
	errors,
}: {
	state: WizardState;
	update: (patch: Partial<WizardState>, opts?: { edit?: boolean }) => void;
	provider?: AdsProvider;
	errors: StepErrors;
}) {
	const [pickerOpen, setPickerOpen] = useState(false);
	const [aiOpen, setAiOpen] = useState(false);
	const limits = provider?.textLimits;
	const search = state.format === "search";
	const rule = mediaRule(state.format);
	// Copy edits flip the provenance to "human" (see WizardState.source).
	const edit = (patch: Partial<WizardState>) => update(patch, { edit: true });

	return (
		<div className="grid gap-6">
			<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border border-dashed px-4 py-3">
				<p className="text-muted-foreground text-sm">
					Stuck on words? Get ad copy written for {provider?.displayName ?? "this platform"}, within
					its limits.
				</p>
				<Button variant="outline" size="sm" onClick={() => setAiOpen(true)}>
					<Sparkles />
					Write with AI
				</Button>
			</div>

			{search ? null : (
				<div className="grid gap-2">
					<div className="flex flex-wrap items-baseline justify-between gap-2">
						<p className="font-medium text-sm" id="creative-media-label">
							Media
						</p>
						<p className="text-muted-foreground text-xs">This format needs {rule.label}.</p>
					</div>
					<ul aria-labelledby="creative-media-label" className="flex flex-wrap gap-2">
						{state.media.map((m, i) => (
							<li key={m.id} className="relative size-24 overflow-hidden rounded-md bg-muted">
								{m.url ? (
									m.kind === "video" ? (
										<video
											src={`${m.url}#t=0.1`}
											preload="metadata"
											muted
											playsInline
											className="size-full object-cover"
											aria-label={m.fileName}
										/>
									) : (
										// biome-ignore lint/performance/noImgElement: user media from a runtime-configured storage host
										<img
											src={m.url}
											alt={m.altText ?? m.fileName}
											className="size-full object-cover"
										/>
									)
								) : (
									<span className="flex size-full items-center justify-center p-2 text-center text-muted-foreground text-xs">
										{m.fileName}
									</span>
								)}
								{m.kind === "video" ? (
									<Film
										className="absolute bottom-1.5 left-1.5 size-3.5 text-white drop-shadow"
										aria-hidden="true"
									/>
								) : null}
								<button
									type="button"
									onClick={() => update({ media: state.media.filter((x) => x.id !== m.id) })}
									className="absolute top-1 right-1 flex size-6 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-ring"
									aria-label={`Remove file ${i + 1}, ${m.fileName}`}
								>
									<X className="size-3.5" aria-hidden="true" />
								</button>
							</li>
						))}
						{state.media.length < rule.max ? (
							<li>
								<button
									type="button"
									onClick={() => setPickerOpen(true)}
									className="flex size-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-border-strong border-dashed text-muted-foreground text-xs hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
								>
									<ImagePlus className="size-5" aria-hidden="true" />
									Add from library
								</button>
							</li>
						) : null}
					</ul>
					{errors.media ? (
						<p className="text-danger text-xs" role="alert">
							{errors.media}
						</p>
					) : null}
					<MediaPickerDialog
						open={pickerOpen}
						onOpenChange={setPickerOpen}
						kind={rule.kind}
						multiple={rule.max > 1}
						alreadyAttached={state.media.map((m) => m.id)}
						title="Choose ad media"
						description="Upload new files on the Media page; they show up here."
						confirmLabel="Use"
						onConfirm={(assets) =>
							update({
								media: [
									...state.media,
									...assets.map((a) => ({
										id: a.id,
										kind: a.kind,
										url: a.url,
										fileName: a.fileName,
										altText: a.altText,
										durationMs: a.durationMs,
									})),
								].slice(0, rule.max),
							})
						}
					/>
				</div>
			)}

			{search ? (
				<>
					<ListEditor
						id="search-headlines"
						label="Headlines"
						hint={`${SEARCH_LIMITS.headlines.min}–${SEARCH_LIMITS.headlines.max}, up to ${SEARCH_LIMITS.headlines.length} characters each. Google mixes them.`}
						items={state.searchHeadlines}
						min={SEARCH_LIMITS.headlines.min}
						max={SEARCH_LIMITS.headlines.max}
						maxLength={SEARCH_LIMITS.headlines.length}
						error={errors.searchHeadlines}
						onChange={(searchHeadlines) => edit({ searchHeadlines })}
					/>
					<ListEditor
						id="search-descriptions"
						label="Descriptions"
						hint={`${SEARCH_LIMITS.descriptions.min}–${SEARCH_LIMITS.descriptions.max}, up to ${SEARCH_LIMITS.descriptions.length} characters each.`}
						items={state.searchDescriptions}
						min={SEARCH_LIMITS.descriptions.min}
						max={SEARCH_LIMITS.descriptions.max}
						maxLength={SEARCH_LIMITS.descriptions.length}
						error={errors.searchDescriptions}
						multiline
						onChange={(searchDescriptions) => edit({ searchDescriptions })}
					/>
				</>
			) : (
				<>
					<Field
						label="Primary text"
						htmlFor="ad-primary"
						error={errors.primaryText}
						action={
							<Counter id="ad-primary-count" value={state.primaryText} max={limits?.primaryText} />
						}
					>
						<Textarea
							id="ad-primary"
							rows={5}
							value={state.primaryText}
							onChange={(e) => edit({ primaryText: e.target.value })}
							{...fieldAria("ad-primary", errors.primaryText)}
						/>
					</Field>
					<div className="grid gap-4 sm:grid-cols-2">
						<Field
							label="Headline"
							htmlFor="ad-headline"
							error={errors.headline}
							action={
								<Counter id="ad-headline-count" value={state.headline} max={limits?.headline} />
							}
						>
							<Input
								id="ad-headline"
								value={state.headline}
								onChange={(e) => edit({ headline: e.target.value })}
								{...fieldAria("ad-headline", errors.headline)}
							/>
						</Field>
						<Field
							label="Description (optional)"
							htmlFor="ad-description"
							error={errors.description}
							action={
								<Counter
									id="ad-description-count"
									value={state.description}
									max={limits?.description}
								/>
							}
						>
							<Input
								id="ad-description"
								value={state.description}
								onChange={(e) => edit({ description: e.target.value })}
								{...fieldAria("ad-description", errors.description)}
							/>
						</Field>
					</div>
				</>
			)}

			<div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem]">
				<Field
					label="Destination URL"
					htmlFor="ad-url"
					error={errors.destinationUrl}
					hint="Where people land after clicking."
				>
					<Input
						id="ad-url"
						type="url"
						inputMode="url"
						placeholder="https://"
						value={state.destinationUrl}
						onChange={(e) => update({ destinationUrl: e.target.value })}
						{...fieldAria("ad-url", errors.destinationUrl, true)}
					/>
				</Field>
				{search ? null : (
					<Field label="Button" htmlFor="ad-cta">
						<NativeSelect
							id="ad-cta"
							value={state.callToAction}
							onChange={(e) => edit({ callToAction: e.target.value as AdCallToAction | "" })}
						>
							<option value="">No button</option>
							{CALLS_TO_ACTION.map((c) => (
								<option key={c.value} value={c.value}>
									{c.label}
								</option>
							))}
						</NativeSelect>
					</Field>
				)}
			</div>

			<AdCopyDialog open={aiOpen} onOpenChange={setAiOpen} state={state} update={update} />
		</div>
	);
}

/** Search-ad headlines/descriptions: a growing list of short inputs with per-line counts. */
function ListEditor({
	id,
	label,
	hint,
	items,
	min,
	max,
	maxLength,
	error,
	multiline,
	onChange,
}: {
	id: string;
	label: string;
	hint: string;
	items: string[];
	min: number;
	max: number;
	maxLength: number;
	error?: string;
	multiline?: boolean;
	onChange: (items: string[]) => void;
}) {
	const set = (i: number, v: string) => onChange(items.map((x, j) => (j === i ? v : x)));
	const filled = items.filter((x) => x.trim()).length;
	return (
		<fieldset className="grid gap-2" aria-describedby={`${id}-hint`}>
			<legend className="flex w-full flex-wrap items-baseline justify-between gap-2 font-medium text-sm">
				{label}
				<span className="font-normal text-muted-foreground text-xs tabular-nums">
					{filled} of {min}–{max}
				</span>
			</legend>
			<p id={`${id}-hint`} className="text-muted-foreground text-xs">
				{hint}
			</p>
			<ol className="grid gap-2">
				{items.map((value, i) => {
					const inputId = `${id}-${i}`;
					const over = textLength(value) > maxLength;
					return (
						// biome-ignore lint/suspicious/noArrayIndexKey: position is the identity of a line
						<li key={i} className="flex items-start gap-2">
							<label htmlFor={inputId} className="sr-only">
								{label} {i + 1}
							</label>
							{multiline ? (
								<Textarea
									id={inputId}
									rows={2}
									value={value}
									aria-invalid={over || undefined}
									onChange={(e) => set(i, e.target.value)}
									className="flex-1"
								/>
							) : (
								<Input
									id={inputId}
									value={value}
									aria-invalid={over || undefined}
									onChange={(e) => set(i, e.target.value)}
									className="flex-1"
								/>
							)}
							<span
								className={cn(
									"w-14 pt-2 text-right text-xs tabular-nums",
									over ? "text-danger" : "text-subtle-foreground",
								)}
							>
								{textLength(value)}/{maxLength}
							</span>
							<Button
								variant="ghost"
								size="icon-sm"
								disabled={items.length <= min}
								aria-label={`Remove ${label.toLowerCase()} ${i + 1}`}
								onClick={() => onChange(items.filter((_, j) => j !== i))}
							>
								<X />
							</Button>
						</li>
					);
				})}
			</ol>
			{items.length < max ? (
				<Button
					variant="outline"
					size="xs"
					className="justify-self-start"
					onClick={() => onChange([...items, ""])}
				>
					<Plus />
					Add {label.toLowerCase().replace(/s$/, "")}
				</Button>
			) : null}
			{error ? (
				<p className="text-danger text-xs" role="alert">
					{error}
				</p>
			) : null}
		</fieldset>
	);
}
