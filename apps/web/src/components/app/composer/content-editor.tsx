"use client";

import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Channel, ProviderInfo } from "@/lib/api-types";
import { textLength } from "@/lib/format";
import { cn } from "@/lib/utils";
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
				"inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] tabular-nums",
				over
					? "border-danger/40 bg-danger-soft text-danger"
					: near
						? "border-warning/40 text-warning"
						: "border-border text-muted-foreground",
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

export function ContentEditor({
	composer,
	providers,
	activeTab,
	onTabChange,
	disabled,
}: {
	composer: Composer;
	providers: ProviderInfo[];
	activeTab: string;
	onTabChange: (tab: string) => void;
	disabled?: boolean;
}) {
	const { state, selected, update, setOverride } = composer;
	const limitOf = (provider: string) =>
		providers.find((p) => p.id === provider)?.capabilities.maxTextLength ??
		Number.POSITIVE_INFINITY;
	const mainLength = textLength(state.content);
	const usingMain = selected.filter((c) => state.overrides[c.id] === undefined);

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
				<TabsList aria-label="Edit content for">
					<TabsTrigger value="main">All channels</TabsTrigger>
					{selected.map((c) => (
						<TabsTrigger key={c.id} value={c.id}>
							<ProviderIcon provider={c.provider} size="xs" />
							<span className="max-w-28 truncate">{c.name}</span>
							{state.overrides[c.id] !== undefined ? (
								<>
									<span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
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
					className="min-h-48 resize-y text-[15px] leading-relaxed"
				/>
				<div className="flex flex-wrap items-center gap-1.5">
					{counters(usingMain, () => mainLength)}
					<span className="ml-auto text-muted-foreground text-xs tabular-nums">
						{mainLength} characters
					</span>
				</div>
			</TabsContent>

			{selected.map((c) => {
				const override = state.overrides[c.id];
				const customized = override !== undefined;
				const text = override ?? state.content;
				return (
					<TabsContent key={c.id} value={c.id} className="grid gap-2">
						<div className="flex flex-wrap items-center justify-between gap-2 text-sm">
							<p className="text-muted-foreground">
								{customized
									? `Custom text for ${c.name}.`
									: `${c.name} uses the text from “All channels”.`}
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
							className={cn(
								"min-h-48 resize-y text-[15px] leading-relaxed",
								!customized && "text-muted-foreground",
							)}
						/>
						<div className="flex items-center gap-1.5">{counters([c], () => textLength(text))}</div>
					</TabsContent>
				);
			})}
		</Tabs>
	);
}
