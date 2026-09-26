"use client";

import { Button } from "@socialfly/ui/components/button";
import { Input } from "@socialfly/ui/components/input";
import { cn } from "@socialfly/ui/utils";
import { Check, Search } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import type { Channel, InboxKind, InboxSentiment } from "@/lib/api-types";
import { ProviderIcon } from "../provider-icon";
import { type ListView, relevanceBand, SENTIMENT, SENTIMENTS } from "./inbox-shared";

export type InboxFilterState = {
	channelIds: string[];
	kinds: InboxKind[];
	sentiment: InboxSentiment | null;
	minRelevance: number;
	q: string;
	sort: "newest" | "relevance";
};

const FILTER_KINDS: { kind: InboxKind; label: string }[] = [
	{ kind: "comment", label: "Comments" },
	{ kind: "reply", label: "Replies" },
	{ kind: "mention", label: "Mentions" },
];

const segment =
	"inline-flex h-7 flex-1 cursor-pointer items-center justify-center whitespace-nowrap rounded-full px-2 font-medium text-muted-foreground text-xs transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-ink aria-pressed:text-ink-foreground";

const pill =
	"inline-flex h-7 cursor-pointer items-center gap-1 rounded-full border px-2.5 font-medium text-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring aria-pressed:border-transparent aria-pressed:bg-ink aria-pressed:text-ink-foreground";
const pillIdle =
	"border-border bg-surface-raised text-muted-foreground hover:border-border-strong hover:text-foreground";

function Group({ title, children }: { title: string; children: ReactNode }) {
	return (
		<fieldset className="grid min-w-0 content-start gap-2">
			<legend className="mb-2 text-muted-foreground text-xs">{title}</legend>
			{children}
		</fieldset>
	);
}

/** The search box above the list. Typing updates the URL (and the query) after a pause. */
export function InboxSearch({ value, onChange }: { value: string; onChange: (q: string) => void }) {
	const id = useId();
	const [q, setQ] = useState(value);
	useEffect(() => setQ(value), [value]);
	// The parent re-creates onChange every render; the debounce must not restart because of it.
	const onChangeRef = useRef(onChange);
	useEffect(() => {
		onChangeRef.current = onChange;
	});
	useEffect(() => {
		if (q === value) return;
		const t = setTimeout(() => onChangeRef.current(q), 350);
		return () => clearTimeout(t);
	}, [q, value]);

	return (
		<div className="relative min-w-0 flex-1">
			<Search
				className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle-foreground"
				aria-hidden="true"
			/>
			<label htmlFor={id} className="sr-only">
				Search the inbox
			</label>
			<Input
				id={id}
				type="search"
				value={q}
				maxLength={200}
				placeholder="Search conversations"
				className="h-8 rounded-full bg-surface pl-8"
				onChange={(e) => setQ(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") onChange(q);
				}}
			/>
		</div>
	);
}

/** Sort, relevance, type, sentiment and channel filters: a rail on wide screens, a panel below. */
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
	const [min, setMin] = useState(value.minRelevance);
	useEffect(() => setMin(value.minRelevance), [value.minRelevance]);

	const toggle = <T extends string>(list: T[], item: T, on: boolean) =>
		on ? [...new Set([...list, item])] : list.filter((x) => x !== item);

	return (
		<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-1">
			<div className="flex h-7 items-center justify-between gap-2 sm:col-span-full">
				<h2 className="font-medium text-[13px]">Filters</h2>
				{activeCount ? (
					<Button
						variant="ghost"
						size="xs"
						className="-mr-2 text-muted-foreground"
						onClick={() =>
							onChange({ channelIds: [], kinds: [], sentiment: null, minRelevance: 0, q: "" })
						}
					>
						Clear ({activeCount})
					</Button>
				) : null}
			</div>

			<Group title="Sort by">
				<div className="flex gap-0.5 rounded-full bg-muted p-0.5">
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

			<Group title="Sentiment">
				<div className="flex flex-wrap gap-1.5">
					{[null, ...SENTIMENTS].map((s) => (
						<button
							key={s ?? "any"}
							type="button"
							aria-pressed={value.sentiment === s}
							onClick={() => onChange({ sentiment: s })}
							className={cn(pill, value.sentiment !== s && pillIdle)}
						>
							{s ? SENTIMENT[s].label : "Any"}
						</button>
					))}
				</div>
			</Group>

			{view !== "discussions" ? (
				<Group title="Type">
					<div className="flex flex-wrap gap-1.5">
						{FILTER_KINDS.map(({ kind, label }) => {
							const on = value.kinds.includes(kind);
							return (
								<button
									key={kind}
									type="button"
									aria-pressed={on}
									onClick={() => onChange({ kinds: toggle(value.kinds, kind, !on) })}
									className={cn(pill, !on && pillIdle)}
								>
									{on ? <Check className="size-3" aria-hidden="true" /> : null}
									{label}
								</button>
							);
						})}
					</div>
				</Group>
			) : null}

			<Group title="Minimum relevance">
				<div className="grid gap-1.5">
					<input
						id={`${id}-min`}
						type="range"
						min={0}
						max={100}
						step={10}
						value={min}
						aria-valuetext={min ? `${min} or higher` : "Any"}
						className="w-full cursor-pointer accent-primary"
						onChange={(e) => setMin(Number(e.target.value))}
						onPointerUp={() => min !== value.minRelevance && onChange({ minRelevance: min })}
						onKeyUp={() => min !== value.minRelevance && onChange({ minRelevance: min })}
						onBlur={() => min !== value.minRelevance && onChange({ minRelevance: min })}
					/>
					<label
						htmlFor={`${id}-min`}
						className="flex justify-between font-mono text-muted-foreground text-xs tabular-nums"
					>
						<span>
							{min ? `${min}+ (${relevanceBand(min).label.toLowerCase()} and up)` : "Any relevance"}
						</span>
						<span className="text-subtle-foreground">0–100</span>
					</label>
				</div>
			</Group>

			{channels.length > 1 ? (
				<Group title="Channels">
					<ul className="-mx-2 grid gap-0.5">
						{channels.map((c) => {
							const on = value.channelIds.includes(c.id);
							return (
								<li key={c.id}>
									<button
										type="button"
										aria-pressed={on}
										onClick={() => onChange({ channelIds: toggle(value.channelIds, c.id, !on) })}
										className={cn(
											"flex h-8 w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-ring",
											on
												? "bg-muted font-medium text-foreground"
												: "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
										)}
									>
										<ProviderIcon provider={c.provider} size="xs" />
										<span className="min-w-0 flex-1 truncate">{c.name}</span>
										{on ? (
											<Check className="size-3.5 shrink-0 text-foreground" aria-hidden="true" />
										) : null}
									</button>
								</li>
							);
						})}
					</ul>
				</Group>
			) : null}
		</div>
	);
}
