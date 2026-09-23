"use client";

import { Button } from "@socialfly/ui/components/button";
import { Input } from "@socialfly/ui/components/input";
import { cn } from "@socialfly/ui/utils";
import { Check, ChevronDown, Radio } from "lucide-react";
import { DropdownMenu as Menu } from "radix-ui";
import { useState } from "react";
import type { Channel } from "@/lib/api-types";
import { formatDay } from "@/lib/format";
import { ProviderIcon } from "../provider-icon";
import { PRESETS, type Preset, type RangeSelection } from "./analytics-utils";

const segment =
	"inline-flex h-7 cursor-pointer items-center justify-center whitespace-nowrap rounded-md px-2.5 font-medium text-muted-foreground text-xs transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-surface-raised aria-pressed:text-foreground aria-pressed:shadow-xs";

export function RangePicker({
	range,
	onPreset,
	onCustom,
}: {
	range: RangeSelection;
	onPreset: (days: Preset) => void;
	onCustom: (from: string, to: string) => void;
}) {
	const [editing, setEditing] = useState(range.kind === "custom");
	const [from, setFrom] = useState(range.from);
	const [to, setTo] = useState(range.to);
	const valid = Boolean(from && to && from <= to);
	const customActive = editing || range.kind === "custom";

	return (
		<div className="flex flex-wrap items-center gap-2">
			<fieldset className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
				<legend className="sr-only">Date range</legend>
				{PRESETS.map((days) => (
					<button
						key={days}
						type="button"
						className={segment}
						aria-pressed={!customActive && range.kind === "preset" && range.days === days}
						onClick={() => {
							setEditing(false);
							onPreset(days);
						}}
					>
						{days} days
					</button>
				))}
				<button
					type="button"
					className={segment}
					aria-pressed={customActive}
					onClick={() => {
						setFrom(range.from);
						setTo(range.to);
						setEditing(true);
					}}
				>
					Custom
				</button>
			</fieldset>
			{customActive ? (
				<form
					className="flex flex-wrap items-center gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						if (valid) onCustom(from, to);
					}}
				>
					<Input
						type="date"
						aria-label="From"
						className="h-8 w-38"
						value={from}
						max={to || undefined}
						onChange={(e) => setFrom(e.target.value)}
					/>
					<span className="text-muted-foreground text-xs">to</span>
					<Input
						type="date"
						aria-label="To"
						className="h-8 w-38"
						value={to}
						min={from || undefined}
						onChange={(e) => setTo(e.target.value)}
					/>
					<Button
						type="submit"
						size="sm"
						variant="outline"
						disabled={!valid || (from === range.from && to === range.to)}
					>
						Apply
					</Button>
				</form>
			) : (
				<span className="text-muted-foreground text-xs">
					{formatDay(range.from)} – {formatDay(range.to, true)}
				</span>
			)}
		</div>
	);
}

const itemClass =
	"relative flex cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-none data-[highlighted]:bg-muted";

export function ChannelFilter({
	channels,
	selected,
	onChange,
}: {
	channels: Channel[];
	selected: string[];
	onChange: (ids: string[]) => void;
}) {
	const set = new Set(selected);
	const label =
		selected.length === 0
			? "All channels"
			: selected.length === 1
				? (channels.find((c) => c.id === selected[0])?.name ?? "1 channel")
				: `${selected.length} channels`;

	const toggle = (id: string, on: boolean) => {
		const next = new Set(set);
		if (on) next.add(id);
		else next.delete(id);
		// Selecting every channel is the same as no filter; keep the URL short.
		onChange(next.size === channels.length ? [] : [...next].sort());
	};

	return (
		<Menu.Root>
			<Menu.Trigger asChild>
				<Button variant="outline" size="sm" className="max-w-60">
					<Radio />
					<span className="truncate">{label}</span>
					<ChevronDown className="text-muted-foreground" />
				</Button>
			</Menu.Trigger>
			<Menu.Portal>
				<Menu.Content
					align="end"
					sideOffset={6}
					className="scrollbar-thin z-50 max-h-80 min-w-56 overflow-y-auto rounded-lg border border-border bg-surface-raised p-1 text-foreground shadow-lg data-[state=open]:animate-scale-in"
				>
					<Menu.Label className="px-2 py-1.5 font-medium text-muted-foreground text-xs">
						Show channels
					</Menu.Label>
					<Menu.CheckboxItem
						className={itemClass}
						checked={selected.length === 0}
						onSelect={(e) => e.preventDefault()}
						onCheckedChange={() => onChange([])}
					>
						<Menu.ItemIndicator className="absolute left-2 inline-flex">
							<Check className="size-4 text-primary-text" aria-hidden="true" />
						</Menu.ItemIndicator>
						All channels
					</Menu.CheckboxItem>
					<Menu.Separator className="-mx-1 my-1 h-px bg-border" />
					{channels.map((c) => (
						<Menu.CheckboxItem
							key={c.id}
							className={itemClass}
							checked={set.has(c.id)}
							// Keep the menu open so several channels can be picked in one go.
							onSelect={(e) => e.preventDefault()}
							onCheckedChange={(on) => toggle(c.id, on === true)}
						>
							<Menu.ItemIndicator className="absolute left-2 inline-flex">
								<Check className="size-4 text-primary-text" aria-hidden="true" />
							</Menu.ItemIndicator>
							<ProviderIcon provider={c.provider} size="xs" />
							<span className={cn("truncate", c.status !== "active" && "text-muted-foreground")}>
								{c.name}
							</span>
						</Menu.CheckboxItem>
					))}
				</Menu.Content>
			</Menu.Portal>
		</Menu.Root>
	);
}
