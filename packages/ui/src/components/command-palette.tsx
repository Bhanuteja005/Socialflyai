"use client";

import { CornerDownLeft, type LucideIcon, Search } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "../lib/utils";

export type CommandItem = {
	id: string;
	label: string;
	group: string;
	icon?: LucideIcon;
	/** Extra words that should match (synonyms, the section it lives in). */
	keywords?: string;
	/** Right-aligned hint, e.g. "Settings". */
	hint?: string;
	onSelect: () => void;
};

/** Opens on ⌘K / Ctrl+K anywhere in the page (and via `open`/`onOpenChange` from a button). */
export function useCommandShortcut(setOpen: (fn: (open: boolean) => boolean) => void) {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setOpen((o) => !o);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [setOpen]);
}

function matches(item: CommandItem, q: string) {
	if (!q) return true;
	const hay = `${item.label} ${item.group} ${item.keywords ?? ""}`.toLowerCase();
	return q
		.toLowerCase()
		.split(/\s+/)
		.every((word) => hay.includes(word));
}

export function CommandPalette({
	open,
	onOpenChange,
	items,
	placeholder = "Search pages and actions…",
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	items: CommandItem[];
	placeholder?: string;
}) {
	const [query, setQuery] = useState("");
	const [active, setActive] = useState(0);
	const listId = useId();
	const listRef = useRef<HTMLDivElement>(null);

	const filtered = useMemo(() => items.filter((i) => matches(i, query.trim())), [items, query]);
	const groups = useMemo(() => {
		const map = new Map<string, CommandItem[]>();
		for (const item of filtered) map.set(item.group, [...(map.get(item.group) ?? []), item]);
		return [...map.entries()];
	}, [filtered]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset the cursor when the result set changes
	useEffect(() => setActive(0), [query]);
	useEffect(() => {
		if (!open) setQuery("");
	}, [open]);
	useEffect(() => {
		listRef.current
			?.querySelector(`[data-index="${active}"]`)
			?.scrollIntoView({ block: "nearest" });
	}, [active]);

	const run = (item: CommandItem | undefined) => {
		if (!item) return;
		onOpenChange(false);
		item.onSelect();
	};

	let index = -1;
	return (
		<DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
			<DialogPrimitive.Portal>
				<DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
				<DialogPrimitive.Content
					className="fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-3xl border border-border bg-surface-raised shadow-lg data-[state=open]:animate-scale-in"
					aria-describedby={undefined}
				>
					<DialogPrimitive.Title className="sr-only">Command menu</DialogPrimitive.Title>
					<div className="flex items-center gap-2.5 border-border border-b px-4">
						<Search className="size-4 shrink-0 text-subtle-foreground" aria-hidden="true" />
						<input
							// biome-ignore lint/a11y/noAutofocus: the palette exists to type into
							autoFocus
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "ArrowDown") {
									e.preventDefault();
									setActive((a) => Math.min(a + 1, filtered.length - 1));
								} else if (e.key === "ArrowUp") {
									e.preventDefault();
									setActive((a) => Math.max(a - 1, 0));
								} else if (e.key === "Enter") {
									e.preventDefault();
									run(filtered[active]);
								}
							}}
							placeholder={placeholder}
							className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle-foreground"
							role="combobox"
							aria-expanded="true"
							aria-controls={listId}
							aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
							aria-label="Search"
						/>
						<kbd className="rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
							Esc
						</kbd>
					</div>
					<div
						ref={listRef}
						id={listId}
						role="listbox"
						className="scrollbar-thin max-h-[min(60vh,420px)] overflow-y-auto p-1.5"
					>
						{groups.length === 0 ? (
							<p className="px-3 py-10 text-center text-muted-foreground text-sm">
								Nothing matches “{query}”.
							</p>
						) : (
							groups.map(([group, groupItems]) => (
								<div key={group} role="presentation" className="pb-1">
									<p className="px-2.5 pt-2 pb-1 font-medium text-[11px] text-subtle-foreground">
										{group}
									</p>
									{groupItems.map((item) => {
										index += 1;
										const i = index;
										const Icon = item.icon;
										const selected = i === active;
										return (
											<div
												key={item.id}
												id={`${listId}-${i}`}
												data-index={i}
												role="option"
												aria-selected={selected}
												tabIndex={-1}
												onMouseMove={() => setActive(i)}
												onClick={() => run(item)}
												onKeyDown={undefined}
												className={cn(
													"flex h-10 cursor-pointer items-center gap-3 rounded-xl px-2.5 text-sm",
													selected ? "bg-muted text-foreground" : "text-muted-foreground",
												)}
											>
												{Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
												<span className="flex-1 truncate text-foreground">{item.label}</span>
												{item.hint ? (
													<span className="text-subtle-foreground text-xs">{item.hint}</span>
												) : null}
												{selected ? (
													<CornerDownLeft
														className="size-3.5 text-subtle-foreground"
														aria-hidden="true"
													/>
												) : null}
											</div>
										);
									})}
								</div>
							))
						)}
					</div>
				</DialogPrimitive.Content>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}
