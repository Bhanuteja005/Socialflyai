"use client";

import { Button } from "@socialfly/ui/components/button";
import { Card } from "@socialfly/ui/components/card";
import { ArrowLeft, CalendarClock, FileText, Send } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Channel, PostDetail, ProviderInfo } from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { missingSettings, providerName } from "@/lib/providers";
import { useOrg } from "../org-provider";
import { PageHeader } from "../page-header";
import { AiAssist } from "./ai-assist";
import { ChannelPicker } from "./channel-picker";
import { ContentEditor } from "./content-editor";
import { MediaAttach } from "./media-attach";
import { PostPreview } from "./post-preview";
import { ProviderSettings } from "./provider-settings";
import { SchedulePanel } from "./schedule-panel";
import { type ComposerPrefill, initialState, useComposer } from "./use-composer";
import { useLiveValidation, useSubmitPost } from "./use-post-actions";
import { type ChannelProblems, ReadinessStatus, ValidationPanel } from "./validation-panel";

type ComposerProps = {
	channels: Channel[];
	providers: ProviderInfo[];
	post?: PostDetail;
	presetDate?: string | null;
	prefill?: ComposerPrefill;
	/** Opens the AI assist with this brief already written. */
	brief?: string;
};

export function Composer({ channels, providers, post, presetDate, prefill, brief }: ComposerProps) {
	const { org } = useOrg();
	const [initial] = useState(() => initialState(org.timezone, post, presetDate, prefill));
	const composer = useComposer(initial, channels, org.timezone);
	const [tab, setTab] = useState("main");
	const [previewChannel, setPreviewChannel] = useState<string | null>(null);
	const validation = useLiveValidation(composer, true);
	const submit = useSubmitPost(composer, post);
	const { state, selected } = composer;

	// Leaving with unsaved changes loses them; ask the browser to confirm.
	useEffect(() => {
		if (!composer.dirty || submit.isSuccess) return;
		const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
		window.addEventListener("beforeunload", onBeforeUnload);
		return () => window.removeEventListener("beforeunload", onBeforeUnload);
	}, [composer.dirty, submit.isSuccess]);

	// A 422 from submit is only authoritative until the post changes.
	const { clearInvalid } = submit;
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset when any input changes
	useEffect(() => clearInvalid(), [state.content, composer.targets, state.media]);

	useEffect(() => {
		if (tab !== "main" && !state.channelIds.includes(tab)) setTab("main");
	}, [tab, state.channelIds]);

	const problems: ChannelProblems = useMemo(() => {
		const map: ChannelProblems = new Map();
		const source = submit.invalidTargets ?? validation.data?.targets ?? [];
		for (const t of source) map.set(t.channelId, [...t.errors]);
		for (const c of selected) {
			const missing = missingSettings(c.provider, state.settings[c.id] ?? {});
			const list = map.get(c.id) ?? [];
			for (const label of missing) {
				const msg = `${providerName(c.provider)}: ${label} is required`;
				if (!list.some((e) => e.toLowerCase().includes(label.toLowerCase()))) list.push(msg);
			}
			if (list.length) map.set(c.id, list);
		}
		return map;
	}, [submit.invalidTargets, validation.data, selected, state.settings]);

	const hasProblems = [...problems.values()].some((l) => l.length > 0);
	const inPast =
		state.mode === "later" &&
		(!composer.scheduledAt || composer.scheduledAt.getTime() < Date.now());
	const nothingSelected = selected.length === 0;
	const busy = submit.isPending;
	const errorIds = new Set([...problems.entries()].filter(([, l]) => l.length).map(([id]) => id));

	const previewId = state.channelIds.includes(tab) ? tab : previewChannel;
	const activeCount = channels.filter((c) => c.status === "active").length;

	return (
		<div className="pb-32 lg:pb-0">
			<PageHeader
				eyebrow={
					<Link
						href={post ? `/posts/${post.id}` : "/posts"}
						className="inline-flex items-center gap-1 hover:text-foreground"
					>
						<ArrowLeft className="size-3.5" aria-hidden="true" />
						{post ? "Back to post" : "Posts"}
					</Link>
				}
				title={post ? "Edit post" : "Create post"}
			/>
			<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
				<div className="grid min-w-0 gap-6">
					<Card className="overflow-hidden">
						<div className="grid gap-3 border-border border-b px-5 py-4">
							<div className="flex items-center justify-between gap-3">
								<h2 className="font-medium text-[15px]">Publish to</h2>
								{channels.length > 0 ? (
									<span className="font-mono text-muted-foreground text-xs tabular-nums">
										{selected.length}/{activeCount}
									</span>
								) : null}
							</div>
							<ChannelPicker
								channels={channels}
								selectedIds={state.channelIds}
								onToggle={composer.toggleChannel}
								errorIds={errorIds}
							/>
						</div>
						<div className="grid gap-4 px-5 py-4">
							<ContentEditor
								composer={composer}
								providers={providers}
								activeTab={tab}
								onTabChange={setTab}
								disabled={busy}
								toolbar={
									<AiAssist
										composer={composer}
										activeTab={tab}
										disabled={busy}
										initialBrief={brief}
									/>
								}
							/>
							<MediaAttach media={state.media} onChange={composer.updateMedia} disabled={busy} />
						</div>
						<ValidationPanel channels={selected} problems={problems} onSelect={setTab} />
					</Card>
					{selected.length > 0 ? (
						<ProviderSettings
							channels={selected}
							settings={state.settings}
							onChange={composer.setSetting}
							disabled={busy}
						/>
					) : null}
				</div>

				<aside className="grid min-w-0 gap-6">
					<Card>
						<div className="border-border border-b px-5 py-3.5">
							<h2 className="font-medium text-[15px]">When to publish</h2>
						</div>
						<div className="px-5 py-4">
							<SchedulePanel
								mode={state.mode}
								onModeChange={(mode) => composer.update({ mode })}
								value={state.scheduledLocal}
								onValueChange={(scheduledLocal) => composer.update({ scheduledLocal })}
								scheduledAt={composer.scheduledAt}
								timeZone={org.timezone}
								disabled={busy}
							/>
						</div>
					</Card>
					<PostPreview
						channels={selected}
						content={state.content}
						overrides={state.overrides}
						settings={state.settings}
						media={state.media}
						scheduledAt={composer.scheduledAt}
						timeZone={org.timezone}
						active={previewId}
						onActiveChange={(id) => {
							setPreviewChannel(id);
							// Keep the editor and the preview on the same channel once one is picked.
							if (tab !== "main") setTab(id);
						}}
					/>
				</aside>
			</div>

			{/* Action bar: fixed on small screens, floating at the bottom of the page on large ones. */}
			<div className="fixed inset-x-0 bottom-0 z-20 border-border border-t bg-surface-raised/95 px-4 py-3 backdrop-blur lg:sticky lg:bottom-4 lg:mt-6 lg:rounded-full lg:border lg:py-2.5 lg:pr-3 lg:pl-5 lg:shadow-lg">
				<div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
					<div className="min-w-0 flex-1">
						<ReadinessStatus
							channels={selected}
							problems={problems}
							checking={validation.settling}
							error={validation.isError ? errorMessage(validation.error) : null}
						/>
					</div>
					<div className="grid grid-cols-2 gap-2 sm:flex">
						<SubmitButtons
							mode={state.mode}
							busy={busy}
							pendingAction={submit.variables}
							canPublish={!nothingSelected && !hasProblems && !inPast}
							canSaveDraft={!nothingSelected}
							onSubmit={(a) => submit.mutate(a)}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}

function SubmitButtons({
	mode,
	busy,
	pendingAction,
	canPublish,
	canSaveDraft,
	onSubmit,
}: {
	mode: "now" | "later";
	busy: boolean;
	pendingAction: "draft" | "schedule" | "now" | undefined;
	canPublish: boolean;
	canSaveDraft: boolean;
	onSubmit: (action: "draft" | "schedule" | "now") => void;
}) {
	const primary = mode === "now" ? "now" : "schedule";
	return (
		<>
			<Button
				variant="outline"
				disabled={busy || !canSaveDraft}
				loading={busy && pendingAction === "draft"}
				onClick={() => onSubmit("draft")}
			>
				<FileText />
				Save draft
			</Button>
			<Button
				disabled={busy || !canPublish}
				loading={busy && pendingAction === primary}
				onClick={() => onSubmit(primary)}
			>
				{mode === "now" ? <Send /> : <CalendarClock />}
				{mode === "now" ? "Publish now" : "Schedule post"}
			</Button>
		</>
	);
}
