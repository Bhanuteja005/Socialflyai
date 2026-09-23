"use client";

import { Button } from "@socialfly/ui/components/button";
import { Checkbox } from "@socialfly/ui/components/controls";
import { Input } from "@socialfly/ui/components/input";
import { cn } from "@socialfly/ui/utils";
import { Search } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import type { Channel, InboxKind, InboxSentiment } from "@/lib/api-types";
import { ProviderIcon } from "../provider-icon";
import { KIND_LABEL, type ListView, relevanceBand, SENTIMENT, SENTIMENTS } from "./inbox-shared";

export type InboxFilterState = {
	channelIds: string[];
	kinds: InboxKind[];
	sentiment: InboxSentiment | null;
	minRelevance: number;
	q: string;
	sort: "newest" | "relevance";
};

const FILTER_KINDS: InboxKind[] = ["comment", "reply", "mention"];

const segment =
	"inline-flex h-7 flex-1 cursor-pointer items-center justify-center whitespace-nowrap rounded-md px-2 font-medium text-muted-foreground text-xs transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-surface-raised aria-pressed:text-foreground aria-pressed:shadow-xs";

function Group({ title, children }: { title: string; children: ReactNode }) {
	return (
		<fieldset className="grid gap-1.5">
			<legend className="mb-1.5 font-medium text-[11px] text-subtle-foreground uppercase tracking-wider">
				{title}
			</legend>
			{children}
		</fieldset>
	);
}

function CheckRow({
	id,
	checked,
	onChange,
	children,
}: {
	id: string;
	checked: boolean;
	onChange: (on: boolean) => void;
	children: ReactNode;
}) {
	return (
		<div className="flex min-w-0 items-center gap-2">
			<Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
			<label htmlFor={id} className="flex min-w-0 cursor-pointer items-center gap-1.5 text-sm">
				{children}
			</label>
		</div>
	);
}

export function InboxFilters({
	view,
	channels,
	value,
	onChange,
	activeCount,
}: {
	view: ListView;
	channels: Channel[];
	value: InboxFilterState;
	onChange: (next: Partial<InboxFilterState>) => void;
	activeCount: number;
}) {
	const id = useId();
	// Typing updates the URL (and the query) after a pause, not on every keystroke.
	const [q, setQ] = useState(value.q);
	const [min, setMin] = useState(value.minRelevance);
	useEffect(() => setQ(value.q), [value.q]);
	useEffect(() => setMin(value.minRelevance), [value.minRelevance]);
	// The parent re-creates onChange every render; the debounce must not restart because of it.
	const onChangeRef = useRef(onChange);
	useEffect(() => {
		onChangeRef.current = onChange;
	});
	useEffect(() => {
		if (q === value.q) return;
		const t = setTimeout(() => onChangeRef.current({ q }), 350);
		return () => clearTimeout(t);
	}, [q, value.q]);

	const toggle = <T extends string>(list: T[], item: T, on: boolean) =>
		on ? [...new Set([...list, item])] : list.filter((x) => x !== item);

	return (
		<div className="grid gap-5">
			<div className="relative">
				<Search
					className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle-foreground"
					aria-hidden="true"
				/>
				<label htmlFor={`${id}-q`} className="sr-only">
					Search the inbox
				</label>
				<Input
					id={`${id}-q`}
					type="search"
					value={q}
					maxLength={200}
					placeholder="Search"
					className="h-8 pl-8"
					onChange={(e) => setQ(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") onChange({ q });
					}}
				/>
			</div>

			<Group title="Sort">
				<div className="flex gap-0.5 rounded-lg bg-muted p-0.5">
					<button
						type="button"
						className={segment}
						aria-pressed={value.sort === "newest"}
						onClick={() => onChange({ sort: "newest" })}
					>
						Newest
					</button>
					<button
						type="button"
						className={segment}
						aria-pressed={value.sort === "relevance"}
						onClick={() => onChange({ sort: "relevance" })}
					>
						Most relevant
					</button>
				</div>
			</Group>

			<Group title="Minimum relevance">
				<div className="grid gap-1">
					<input
						id={`${id}-min`}
						type="range"
						min={0}
						max={100}
						step={10}
						value={min}
						aria-valuetext={min ? `${min} or higher` : "Any"}
						className="w-full accent-primary"
						onChange={(e) => setMin(Number(e.target.value))}
						onPointerUp={() => min !== value.minRelevance && onChange({ minRelevance: min })}
						onKeyUp={() => min !== value.minRelevance && onChange({ minRelevance: min })}
						onBlur={() => min !== value.minRelevance && onChange({ minRelevance: min })}
					/>
					<label htmlFor={`${id}-min`} className="text-muted-foreground text-xs tabular-nums">
						{min ? `${min}+ (${relevanceBand(min).label.toLowerCase()} and up)` : "Any relevance"}
					</label>
				</div>
			</Group>

			{view !== "discussions" ? (
				<Group title="Type">
					{FILTER_KINDS.map((k) => (
						<CheckRow
							key={k}
							id={`${id}-kind-${k}`}
							checked={value.kinds.includes(k)}
							onChange={(on) => onChange({ kinds: toggle(value.kinds, k, on) })}
						>
							{KIND_LABEL[k]}s
						</CheckRow>
					))}
				</Group>
			) : null}

			<Group title="Sentiment">
				<div className="flex flex-wrap gap-1">
					{[null, ...SENTIMENTS].map((s) => (
						<button
							key={s ?? "any"}
							type="button"
							aria-pressed={value.sentiment === s}
							onClick={() => onChange({ sentiment: s })}
							className={cn(
								"inline-flex h-6 cursor-pointer items-center rounded-full border px-2 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring",
								value.sentiment === s
									? "border-primary/40 bg-primary-soft text-primary-text"
									: "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
							)}
						>
							{s ? SENTIMENT[s].label : "Any"}
						</button>
					))}
				</div>
			</Group>

			{channels.length > 1 ? (
				<Group title="Channels">
					{channels.map((c) => (
						<CheckRow
							key={c.id}
							id={`${id}-ch-${c.id}`}
							checked={value.channelIds.includes(c.id)}
							onChange={(on) => onChange({ channelIds: toggle(value.channelIds, c.id, on) })}
						>
							<ProviderIcon provider={c.provider} size="xs" />
							<span className="truncate">{c.name}</span>
						</CheckRow>
					))}
				</Group>
			) : null}

			{activeCount ? (
				<div>
					<Button
						variant="ghost"
						size="xs"
						onClick={() =>
							onChange({ channelIds: [], kinds: [], sentiment: null, minRelevance: 0, q: "" })
						}
					>
						Clear filters
					</Button>
				</div>
			) : null}
		</div>
	);
}
