"use client";

import { Button } from "@socialfly/ui/components/button";
import { Textarea } from "@socialfly/ui/components/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@socialfly/ui/components/tabs";
import { cn } from "@socialfly/ui/utils";
import { Undo2 } from "lucide-react";
import type { ReactNode } from "react";
import type { Channel, ProviderInfo } from "@/lib/api-types";
import { textLength } from "@/lib/format";
import { ProviderIcon } from "../provider-icon";
import type { Composer } from "./use-composer";

function Counter({
	count,
	max,
	label,
	provider,
}: {
	count: number;
	max: number;
	label: string;
	provider: string;
}) {
	const over = count > max;
	const near = !over && count > max * 0.9;
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 font-mono text-[11.5px] tabular-nums",
				over ? "text-danger" : near ? "text-warning" : "text-muted-foreground",
			)}
			title={`${label}: ${count} of ${max} characters`}
		>
			<ProviderIcon provider={provider} size="xs" />
			{over ? `-${count - max}` : max - count}
			<span className="sr-only">
				{over ? " characters over the limit" : " characters left"} for {label}
			</span>
		</span>
	);
}

// Borderless: the surrounding card is the editor's frame.
const editorClass =
	"min-h-52 resize-y rounded-none border-0 bg-transparent px-0 py-1 text-[15px] leading-relaxed shadow-none focus-visible:ring-0";

export function ContentEditor({
	composer,
	providers,
	activeTab,
	onTabChange,
	disabled,
	toolbar,
}: {
	composer: Composer;
	providers: ProviderInfo[];
	activeTab: string;
	onTabChange: (tab: string) => void;
	disabled?: boolean;
	/** Tools shown under the text (AI assist...), left of the character counters. */
	toolbar?: ReactNode;
}) {
	const { state, selected, update, setOverride } = composer;
	const limitOf = (provider: string) =>
		providers.find((p) => p.id === provider)?.capabilities.maxTextLength ??
		Number.POSITIVE_INFINITY;
	const mainLength = textLength(state.content);
	const usingMain = selected.filter((c) => state.overrides[c.id] === undefined);
	const activeChannel = selected.find((c) => c.id === activeTab);

	// One counter per platform (channels of the same provider share limits).
	const counters = (channels: Channel[], length: (c: Channel) => number) => {
		const seen = new Set<string>();
		return channels
			.filter((c) => {
				if (seen.has(c.provider)) return false;
				seen.add(c.provider);
				return true;
			})
			.filter((c) => Number.isFinite(limitOf(c.provider)))
			.map((c) => (
				<Counter
					key={c.provider}
					provider={c.provider}
					label={c.name}
					count={length(c)}
					max={limitOf(c.provider)}
				/>
			));
	};

	return (
		<Tabs value={activeTab} onValueChange={onTabChange} className="grid gap-3">
			{selected.length > 0 ? (
				<TabsList aria-label="Edit content for" className="justify-self-start">
					<TabsTrigger value="main">All channels</TabsTrigger>
					{selected.map((c) => (
						<TabsTrigger key={c.id} value={c.id}>
							<ProviderIcon provider={c.provider} size="xs" />
							<span className="max-w-28 truncate">{c.name}</span>
							{state.overrides[c.id] !== undefined ? (
								<>
									<span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
									<span className="sr-only">(customized)</span>
								</>
							) : null}
						</TabsTrigger>
					))}
				</TabsList>
			) : null}

			<TabsContent value="main" className="grid gap-2">
				<label htmlFor="post-content" className="sr-only">
					Post content
				</label>
				<Textarea
					id="post-content"
					value={state.content}
					onChange={(e) => update({ content: e.target.value })}
					placeholder="What would you like to share?"
					disabled={disabled}
					className={editorClass}
				/>
			</TabsContent>

			{selected.map((c) => {
				const override = state.overrides[c.id];
				const customized = override !== undefined;
				const text = override ?? state.content;
				return (
					<TabsContent key={c.id} value={c.id} className="grid gap-2">
						<div className="flex flex-wrap items-center justify-between gap-2 text-sm">
							<p className="text-muted-foreground text-xs">
								{customized ? `Custom text for ${c.name}` : "Uses the main text"}
							</p>
							{customized ? (
								<Button
									variant="ghost"
									size="xs"
									onClick={() => setOverride(c.id, undefined)}
									disabled={disabled}
								>
									<Undo2 />
									Use main text
								</Button>
							) : (
								<Button
									variant="outline"
									size="xs"
									onClick={() => setOverride(c.id, state.content)}
									disabled={disabled}
								>
									Customize
								</Button>
							)}
						</div>
						<label htmlFor={`content-${c.id}`} className="sr-only">
							Content for {c.name}
						</label>
						<Textarea
							id={`content-${c.id}`}
							value={text}
							readOnly={!customized}
							disabled={disabled}
							onChange={(e) => setOverride(c.id, e.target.value)}
							className={cn(editorClass, !customized && "text-muted-foreground")}
						/>
					</TabsContent>
				);
			})}

			{/* Outside the tab panels so the toolbar (and the AI assist's state) survives tab switches. */}
			<div className="flex flex-wrap items-center gap-1 border-border border-t pt-3">
				{toolbar}
				<div className="ml-auto flex flex-wrap items-center gap-3">
					{activeChannel
						? counters([activeChannel], () =>
								textLength(state.overrides[activeChannel.id] ?? state.content),
							)
						: counters(usingMain, () => mainLength)}
					{activeChannel ? null : (
						<span className="font-mono text-[11.5px] text-subtle-foreground tabular-nums">
							{mainLength} chars
						</span>
					)}
				</div>
			</div>
		</Tabs>
	);
}
