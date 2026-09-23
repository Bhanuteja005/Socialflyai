"use client";

import { Button } from "@socialfly/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@socialfly/ui/components/card";
import { ArrowLeft, FileText, Send } from "lucide-react";
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
import { ProviderSettings } from "./provider-settings";
import { SchedulePanel } from "./schedule-panel";
import { type ComposerPrefill, initialState, useComposer } from "./use-composer";
import { useLiveValidation, useSubmitPost } from "./use-post-actions";
import { type ChannelProblems, ValidationPanel } from "./validation-panel";

type ComposerProps = {
	channels: Channel[];
	providers: ProviderInfo[];
	post?: PostDetail;
	presetDate?: string | null;
	prefill?: ComposerPrefill;
};

export function Composer({ channels, providers, post, presetDate, prefill }: ComposerProps) {
	const { org } = useOrg();
	const [initial] = useState(() => initialState(org.timezone, post, presetDate, prefill));
	const composer = useComposer(initial, channels, org.timezone);
	const [tab, setTab] = useState("main");
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

	return (
		<div className="pb-24 lg:pb-0">
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
			<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
				<div className="grid gap-6">
					<Card>
						<CardHeader>
							<CardTitle>Channels</CardTitle>
						</CardHeader>
						<CardContent>
							<ChannelPicker
								channels={channels}
								selectedIds={state.channelIds}
								onToggle={composer.toggleChannel}
								errorIds={errorIds}
							/>
						</CardContent>
					</Card>
					<Card>
						<CardHeader className="flex-row items-center justify-between gap-2">
							<CardTitle>Content</CardTitle>
							<AiAssist composer={composer} activeTab={tab} disabled={busy} />
						</CardHeader>
						<CardContent className="grid gap-4">
							<ContentEditor
								composer={composer}
								providers={providers}
								activeTab={tab}
								onTabChange={setTab}
								disabled={busy}
							/>
							<MediaAttach media={state.media} onChange={composer.updateMedia} disabled={busy} />
						</CardContent>
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

				<aside className="grid gap-4 lg:sticky lg:top-6">
					<Card>
						<CardHeader>
							<CardTitle>Publishing</CardTitle>
						</CardHeader>
						<CardContent className="grid gap-4">
							<SchedulePanel
								mode={state.mode}
								onModeChange={(mode) => composer.update({ mode })}
								value={state.scheduledLocal}
								onValueChange={(scheduledLocal) => composer.update({ scheduledLocal })}
								scheduledAt={composer.scheduledAt}
								timeZone={org.timezone}
								disabled={busy}
							/>
							<div className="hidden gap-2 lg:grid">
								<SubmitButtons
									mode={state.mode}
									busy={busy}
									pendingAction={submit.variables}
									canPublish={!nothingSelected && !hasProblems && !inPast}
									canSaveDraft={!nothingSelected}
									onSubmit={(a) => submit.mutate(a)}
								/>
							</div>
						</CardContent>
					</Card>
					<Card>
						<CardContent>
							<ValidationPanel
								channels={selected}
								problems={problems}
								checking={validation.settling}
								onSelect={setTab}
							/>
							{validation.isError ? (
								<p className="mt-2 text-danger text-xs">{errorMessage(validation.error)}</p>
							) : null}
						</CardContent>
					</Card>
				</aside>
			</div>

			{/* Mobile action bar */}
			<div className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-2 gap-2 border-border border-t bg-background/95 p-3 backdrop-blur lg:hidden">
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
				className="order-2 lg:order-1"
				disabled={busy || !canPublish}
				loading={busy && pendingAction === primary}
				onClick={() => onSubmit(primary)}
			>
				<Send />
				{mode === "now" ? "Publish now" : "Schedule"}
			</Button>
			<Button
				variant="outline"
				className="order-1 lg:order-2"
				disabled={busy || !canSaveDraft}
				loading={busy && pendingAction === "draft"}
				onClick={() => onSubmit("draft")}
			>
				<FileText />
				Save draft
			</Button>
		</>
	);
}
