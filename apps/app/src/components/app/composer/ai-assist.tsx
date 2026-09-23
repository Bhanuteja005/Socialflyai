"use client";

import { Button } from "@socialfly/ui/components/button";
import { Switch } from "@socialfly/ui/components/controls";
import { EmptyState, Spinner } from "@socialfly/ui/components/feedback";
import { Field, fieldAria, Label } from "@socialfly/ui/components/field";
import { Input, Textarea } from "@socialfly/ui/components/input";
import { NativeSelect } from "@socialfly/ui/components/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@socialfly/ui/components/tabs";
import { toast } from "@socialfly/ui/components/toast";
import { cn } from "@socialfly/ui/utils";
import { useMutation } from "@tanstack/react-query";
import { Check, Hash, Plus, Sparkles, Wand2, X } from "lucide-react";
import Link from "next/link";
import { Dialog as DialogPrimitive } from "radix-ui";
import { type FormEvent, useMemo, useState } from "react";
import { useAfterAiCall, useAiCapabilities } from "@/hooks/use-ai";
import { api, call } from "@/lib/api-client";
import type { GeneratePostsInput, PostDraft, PostVariant, RewriteAction } from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { providerName } from "@/lib/providers";
import { AiError, AiNotConfigured, AiUsage } from "../ai/ai-shared";
import { ProviderIcon } from "../provider-icon";
import type { Composer } from "./use-composer";

type Platform = GeneratePostsInput["platforms"][number];

/** How a draft lands in the editor: text, a blank line, then the hashtags. */
const draftText = (d: PostDraft) =>
	d.hashtags.length ? `${d.text.trim()}\n\n${d.hashtags.join(" ")}` : d.text.trim();

const REWRITES: { action: Exclude<RewriteAction, "custom">; label: string }[] = [
	{ action: "shorter", label: "Shorter" },
	{ action: "longer", label: "Longer" },
	{ action: "professional", label: "Professional" },
	{ action: "casual", label: "Casual" },
	{ action: "punchier", label: "Punchier" },
	{ action: "fix_grammar", label: "Fix grammar" },
];

/** The AI side panel of the composer: draft a post from a brief, or improve the current text. */
export function AiAssist({
	composer,
	activeTab,
	disabled,
}: {
	composer: Composer;
	/** The editor tab in view ("main" or a channel id) — quick actions work on its text. */
	activeTab: string;
	disabled?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [tab, setTab] = useState("write");
	const caps = useAiCapabilities();
	// Lives out here, not in the panel, so closing the sheet keeps the brief and drafts.
	const write = useWriteForm();

	return (
		<DialogPrimitive.Root open={open} onOpenChange={setOpen}>
			<DialogPrimitive.Trigger asChild>
				<Button variant="outline" size="xs" disabled={disabled}>
					<Sparkles />
					AI assist
				</Button>
			</DialogPrimitive.Trigger>
			<DialogPrimitive.Portal>
				<DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-overlay data-[state=open]:animate-fade-in" />
				<DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-border border-l bg-background shadow-lg data-[state=open]:animate-fade-in sm:max-w-md">
					<div className="flex items-start justify-between gap-3 border-border border-b px-5 py-4">
						<div className="grid gap-0.5">
							<DialogPrimitive.Title className="flex items-center gap-2 font-semibold text-base tracking-tight">
								<Sparkles className="size-4 text-primary-text" aria-hidden="true" />
								AI assist
							</DialogPrimitive.Title>
							<DialogPrimitive.Description className="text-muted-foreground text-xs">
								Uses your{" "}
								<Link
									href="/settings/brand"
									className="underline underline-offset-2 hover:text-foreground"
								>
									brand voice
								</Link>
								. Nothing changes in your post until you choose to use it.
							</DialogPrimitive.Description>
						</div>
						<DialogPrimitive.Close asChild>
							<Button variant="ghost" size="icon-sm" aria-label="Close AI assist">
								<X />
							</Button>
						</DialogPrimitive.Close>
					</div>

					<div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4">
						{caps.isPending ? (
							<div className="flex justify-center py-10">
								<Spinner label="Loading AI features" />
							</div>
						) : caps.isError ? (
							<EmptyState
								compact
								title="Couldn't load AI features"
								description={errorMessage(caps.error)}
								action={
									<Button variant="outline" size="sm" onClick={() => caps.refetch()}>
										Retry
									</Button>
								}
							/>
						) : !caps.data.text ? (
							<AiNotConfigured>
								Add <code>ANTHROPIC_API_KEY</code> to the API's environment to turn on AI writing.
							</AiNotConfigured>
						) : (
							<Tabs value={tab} onValueChange={setTab} className="grid gap-4">
								<TabsList aria-label="AI assist mode" className="justify-self-start">
									<TabsTrigger value="write">
										<Sparkles />
										Write with AI
									</TabsTrigger>
									<TabsTrigger value="improve">
										<Wand2 />
										Improve text
									</TabsTrigger>
								</TabsList>
								{/* Kept mounted so results survive switching between the two tabs. */}
								<TabsContent value="write" forceMount className="data-[state=inactive]:hidden">
									<WritePanel composer={composer} form={write} onUsed={() => setOpen(false)} />
								</TabsContent>
								<TabsContent value="improve" forceMount className="data-[state=inactive]:hidden">
									<ImprovePanel composer={composer} activeTab={activeTab} />
								</TabsContent>
							</Tabs>
						)}
					</div>

					<div className="border-border border-t bg-surface px-5 py-3">
						<AiUsage />
					</div>
				</DialogPrimitive.Content>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}

// ── Write with AI ────────────────────────────────────────────────────────────

function useWriteForm() {
	const afterAiCall = useAfterAiCall();
	const [brief, setBrief] = useState("");
	const [tone, setTone] = useState("");
	const [variants, setVariants] = useState(2);
	const [link, setLink] = useState("");
	const [includeHashtags, setIncludeHashtags] = useState(true);
	const [includeEmojis, setIncludeEmojis] = useState(false);
	const [touched, setTouched] = useState(false);
	const generate = useMutation({
		mutationFn: (input: GeneratePostsInput) => call(api.ai.posts.$post({ json: input })),
		onSettled: afterAiCall,
	});
	return {
		brief,
		setBrief,
		tone,
		setTone,
		variants,
		setVariants,
		link,
		setLink,
		includeHashtags,
		setIncludeHashtags,
		includeEmojis,
		setIncludeEmojis,
		touched,
		setTouched,
		generate,
	};
}

function WritePanel({
	composer,
	form,
	onUsed,
}: {
	composer: Composer;
	form: ReturnType<typeof useWriteForm>;
	onUsed: () => void;
}) {
	const { selected, state } = composer;
	const {
		brief,
		setBrief,
		tone,
		setTone,
		variants,
		setVariants,
		link,
		setLink,
		includeHashtags,
		setIncludeHashtags,
		includeEmojis,
		setIncludeEmojis,
		touched,
		setTouched,
		generate,
	} = form;

	// Channels of the same platform share one draft.
	const platforms = useMemo(
		() => [...new Set(selected.map((c) => c.provider as Platform))],
		[selected],
	);

	const briefError = touched && brief.trim().length < 3 ? "Tell the AI what to write about." : null;
	const linkError =
		touched && link.trim() && !/^https?:\/\/\S+\.\S+/.test(link.trim())
			? "Enter a full URL, starting with https://"
			: null;

	function onSubmit(e: FormEvent) {
		e.preventDefault();
		setTouched(true);
		if (brief.trim().length < 3 || !platforms.length) return;
		if (link.trim() && !/^https?:\/\/\S+\.\S+/.test(link.trim())) return;
		generate.mutate({
			brief: brief.trim(),
			platforms,
			variants,
			tone: tone.trim() || undefined,
			link: link.trim() || undefined,
			includeHashtags,
			includeEmojis,
		});
	}

	function use(variant: PostVariant) {
		const [first] = variant.drafts;
		if (!first) return;
		const content = draftText(first);
		const overrides = { ...state.overrides };
		// Per-channel text only where the platform's draft differs from the main text;
		// the composer's existing override mechanism does the rest.
		for (const c of selected) {
			const draft = variant.drafts.find((d) => d.platform === c.provider);
			const text = draft ? draftText(draft) : undefined;
			overrides[c.id] = text !== undefined && text !== content ? text : undefined;
		}
		const previous = { content: state.content, overrides: state.overrides };
		composer.update({ content, overrides });
		toast.success("Draft added to your post", {
			action: { label: "Undo", onClick: () => composer.update(previous) },
		});
		onUsed();
	}

	const busy = generate.isPending;

	return (
		<div className="grid gap-5">
			<form onSubmit={onSubmit} noValidate className="grid gap-4">
				<Field
					label="What's the post about?"
					htmlFor="ai-brief"
					error={briefError}
					hint="A sentence or a few bullet points is plenty."
				>
					<Textarea
						id="ai-brief"
						value={brief}
						maxLength={4000}
						placeholder="We just launched dark mode. Thank the beta testers and invite everyone to try it."
						onChange={(e) => setBrief(e.target.value)}
						disabled={busy}
						{...fieldAria("ai-brief", briefError, true)}
					/>
				</Field>

				<div className="grid gap-1.5">
					<p className="font-medium text-sm leading-none">Writing for</p>
					{platforms.length ? (
						<ul className="flex flex-wrap gap-1.5">
							{platforms.map((p) => (
								<li
									key={p}
									className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs"
								>
									<ProviderIcon provider={p} size="xs" />
									{providerName(p)}
								</li>
							))}
						</ul>
					) : (
						<p className="text-danger text-xs" role={touched ? "alert" : undefined}>
							Select at least one channel first — drafts are tailored to each platform.
						</p>
					)}
				</div>

				<div className="grid gap-4 sm:grid-cols-2">
					<Field label="Tone (optional)" htmlFor="ai-tone">
						<Input
							id="ai-tone"
							value={tone}
							maxLength={100}
							placeholder="e.g. upbeat, expert"
							onChange={(e) => setTone(e.target.value)}
							disabled={busy}
						/>
					</Field>
					<Field label="Options to compare" htmlFor="ai-variants">
						<NativeSelect
							id="ai-variants"
							value={variants}
							onChange={(e) => setVariants(Number(e.target.value))}
							disabled={busy}
						>
							<option value={1}>1 option</option>
							<option value={2}>2 options</option>
							<option value={3}>3 options</option>
						</NativeSelect>
					</Field>
				</div>

				<Field label="Link (optional)" htmlFor="ai-link" error={linkError}>
					<Input
						id="ai-link"
						type="url"
						inputMode="url"
						value={link}
						maxLength={2000}
						placeholder="https://"
						onChange={(e) => setLink(e.target.value)}
						disabled={busy}
						{...fieldAria("ai-link", linkError)}
					/>
				</Field>

				<div className="flex flex-wrap gap-x-6 gap-y-3">
					<div className="flex items-center gap-2">
						<Switch
							id="ai-hashtags"
							checked={includeHashtags}
							onCheckedChange={setIncludeHashtags}
							disabled={busy}
						/>
						<Label htmlFor="ai-hashtags" className="font-normal">
							Hashtags
						</Label>
					</div>
					<div className="flex items-center gap-2">
						<Switch
							id="ai-emojis"
							checked={includeEmojis}
							onCheckedChange={setIncludeEmojis}
							disabled={busy}
						/>
						<Label htmlFor="ai-emojis" className="font-normal">
							Emojis
						</Label>
					</div>
				</div>

				<div>
					<Button type="submit" loading={busy} disabled={!platforms.length}>
						<Sparkles />
						{busy ? "Writing…" : generate.data ? "Write new options" : "Write drafts"}
					</Button>
				</div>
				<AiError error={generate.error} />
			</form>

			{generate.data ? (
				<section className="grid gap-3" aria-label="Generated options" aria-live="polite">
					{generate.data.variants.map((variant, index) => (
						<article
							// biome-ignore lint/suspicious/noArrayIndexKey: generated options have no id; the list is replaced wholesale
							key={index}
							className="grid gap-3 rounded-lg border border-border bg-surface-raised p-3 shadow-xs"
						>
							<header className="flex items-start justify-between gap-3">
								<div className="grid gap-0.5">
									<p className="font-medium text-[11px] text-subtle-foreground uppercase tracking-wider">
										Option {index + 1}
									</p>
									<h3 className="font-medium text-sm">{variant.angle}</h3>
								</div>
								<Button size="xs" onClick={() => use(variant)} disabled={!variant.drafts.length}>
									<Check />
									Use this
									<span className="sr-only"> (option {index + 1})</span>
								</Button>
							</header>
							{variant.drafts.map((draft) => (
								<div key={draft.platform} className="grid gap-1.5 border-border border-t pt-3">
									<p className="flex items-center gap-1.5 font-medium text-xs">
										<ProviderIcon provider={draft.platform} size="xs" />
										{providerName(draft.platform)}
									</p>
									<p className="whitespace-pre-wrap text-sm leading-relaxed">{draft.text}</p>
									{draft.hashtags.length ? (
										<p className="text-primary-text text-xs">{draft.hashtags.join(" ")}</p>
									) : null}
								</div>
							))}
						</article>
					))}
				</section>
			) : null}
		</div>
	);
}

// ── Improve the current text ─────────────────────────────────────────────────

const hasTag = (text: string, tag: string) =>
	text.split(/\s+/).some((w) => w.toLowerCase() === tag.toLowerCase());

/** Appends to a trailing hashtag line if there is one, otherwise after a blank line. */
function appendHashtag(text: string, tag: string) {
	const trimmed = text.replace(/\s+$/, "");
	if (!trimmed) return tag;
	const lastLine = trimmed.split("\n").at(-1)?.trim() ?? "";
	const onTagLine = /^(#[\p{L}\p{N}_]+\s*)+$/u.test(lastLine);
	return `${trimmed}${onTagLine ? " " : "\n\n"}${tag}`;
}

function ImprovePanel({ composer, activeTab }: { composer: Composer; activeTab: string }) {
	const { state, selected } = composer;
	const afterAiCall = useAfterAiCall();
	const [instruction, setInstruction] = useState("");

	// Work on the text the person is looking at: a channel's custom text, or the main text.
	const channel = activeTab === "main" ? undefined : selected.find((c) => c.id === activeTab);
	const override = channel ? state.overrides[channel.id] : undefined;
	const customized = channel !== undefined && override !== undefined;
	const text = customized ? override : state.content;
	const write = (next: string) => {
		if (channel && customized) composer.setOverride(channel.id, next);
		else composer.update({ content: next });
	};
	const providers = [...new Set(selected.map((c) => c.provider))];
	const platform = (channel?.provider ?? (providers.length === 1 ? providers[0] : undefined)) as
		| Platform
		| undefined;

	const rewrite = useMutation({
		mutationFn: (input: { action: RewriteAction; instruction?: string }) =>
			call(api.ai.rewrite.$post({ json: { text, platform, ...input } })),
		onSettled: afterAiCall,
	});
	const hashtags = useMutation({
		mutationFn: () => call(api.ai.hashtags.$post({ json: { text, platform, count: 10 } })),
		onSettled: afterAiCall,
	});

	const busy = rewrite.isPending || hashtags.isPending;
	const empty = text.trim().length === 0;

	const replace = (next: string) => {
		const previous = text;
		write(next);
		rewrite.reset();
		toast.success("Text replaced", { action: { label: "Undo", onClick: () => write(previous) } });
	};

	function onCustom(e: FormEvent) {
		e.preventDefault();
		if (!instruction.trim() || empty) return;
		rewrite.mutate({ action: "custom", instruction: instruction.trim() });
	}

	const suggested = (hashtags.data?.hashtags ?? []).map((t) => (t.startsWith("#") ? t : `#${t}`));
	const missing = suggested.filter((t) => !hasTag(text, t));

	return (
		<div className="grid gap-5">
			<p className="rounded-md bg-muted px-3 py-2 text-muted-foreground text-xs">
				Working on:{" "}
				<span className="font-medium text-foreground">
					{customized && channel ? `the custom text for ${channel.name}` : "the main post text"}
				</span>
			</p>

			{empty ? (
				<EmptyState
					compact
					icon={Wand2}
					title="Nothing to improve yet"
					description="Write something in the editor, or use “Write with AI” to start a draft."
				/>
			) : (
				<>
					<section className="grid gap-3" aria-labelledby="ai-rewrite-title">
						<h3 id="ai-rewrite-title" className="font-medium text-sm">
							Rewrite
						</h3>
						<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
							{REWRITES.map((r) => (
								<Button
									key={r.action}
									variant="outline"
									size="sm"
									disabled={busy}
									loading={rewrite.isPending && rewrite.variables?.action === r.action}
									onClick={() => rewrite.mutate({ action: r.action })}
								>
									{r.label}
								</Button>
							))}
						</div>
						<form onSubmit={onCustom} className="flex gap-2">
							<label htmlFor="ai-instruction" className="sr-only">
								Custom instruction
							</label>
							<Input
								id="ai-instruction"
								value={instruction}
								maxLength={500}
								placeholder="Or say how, e.g. “mention our free trial”"
								onChange={(e) => setInstruction(e.target.value)}
								disabled={busy}
							/>
							<Button
								type="submit"
								variant="outline"
								disabled={busy || !instruction.trim()}
								loading={rewrite.isPending && rewrite.variables?.action === "custom"}
							>
								Apply
							</Button>
						</form>
						<AiError error={rewrite.error} />
						{rewrite.data ? (
							<div
								className="grid gap-3 rounded-lg border border-primary/30 bg-primary-soft/40 p-3"
								aria-live="polite"
							>
								<p className="font-medium text-[11px] text-primary-text uppercase tracking-wider">
									Suggestion
								</p>
								<p className="whitespace-pre-wrap text-sm leading-relaxed">{rewrite.data.text}</p>
								<div className="flex gap-2">
									<Button size="sm" onClick={() => replace(rewrite.data.text)}>
										<Check />
										Replace
									</Button>
									<Button variant="ghost" size="sm" onClick={() => rewrite.reset()}>
										Discard
									</Button>
								</div>
							</div>
						) : null}
					</section>

					<section className="grid gap-3" aria-labelledby="ai-hashtags-title">
						<div className="flex items-center justify-between gap-2">
							<h3 id="ai-hashtags-title" className="font-medium text-sm">
								Hashtags
							</h3>
							<Button
								variant="outline"
								size="xs"
								disabled={busy}
								loading={hashtags.isPending}
								onClick={() => hashtags.mutate()}
							>
								<Hash />
								{hashtags.data ? "Suggest again" : "Suggest hashtags"}
							</Button>
						</div>
						<AiError error={hashtags.error} />
						{suggested.length ? (
							<>
								<ul className="flex flex-wrap gap-1.5" aria-label="Suggested hashtags">
									{suggested.map((tag) => {
										const added = hasTag(text, tag);
										return (
											<li key={tag}>
												<button
													type="button"
													aria-pressed={added}
													disabled={added}
													onClick={() => write(appendHashtag(text, tag))}
													className={cn(
														"inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default",
														added
															? "border-primary/30 bg-primary-soft text-primary-text"
															: "border-border hover:border-border-strong hover:bg-muted",
													)}
												>
													{added ? (
														<Check className="size-3" aria-hidden="true" />
													) : (
														<Plus className="size-3" aria-hidden="true" />
													)}
													{tag}
													<span className="sr-only">{added ? " (added)" : " (add to post)"}</span>
												</button>
											</li>
										);
									})}
								</ul>
								{missing.length > 1 ? (
									<div>
										<Button
											variant="ghost"
											size="xs"
											onClick={() => write(missing.reduce((acc, t) => appendHashtag(acc, t), text))}
										>
											Add all {missing.length}
										</Button>
									</div>
								) : null}
							</>
						) : null}
					</section>
				</>
			)}
		</div>
	);
}
