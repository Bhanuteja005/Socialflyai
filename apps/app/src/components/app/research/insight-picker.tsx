"use client";

import { Button } from "@socialfly/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@socialfly/ui/components/card";
import { Checkbox } from "@socialfly/ui/components/controls";
import { cn } from "@socialfly/ui/utils";
import { Plus } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { useApplyInsights } from "@/hooks/use-research";

type Item = {
	key: string;
	label: ReactNode;
	/** For competitors: what gets sent to the API. */
	competitor?: { name: string; domain?: string };
};

/**
 * A list of AI suggestions with checkboxes and one "add these" action, sent through
 * `POST /research/insights/apply`. Everything starts selected: the common case is
 * "take them all, minus one or two".
 */
export function InsightPicker({
	runId,
	kind,
	title,
	description,
	actionLabel,
	items,
	editable,
	layout = "list",
	onDone,
	doneLabel,
}: {
	runId: string;
	kind: "buyerQuestions" | "competitors" | "keywords";
	title: string;
	description: string;
	actionLabel: string;
	items: Item[];
	editable: boolean;
	layout?: "list" | "chips";
	onDone: () => void;
	doneLabel: string;
}) {
	const baseId = useId();
	const apply = useApplyInsights();
	const [selected, setSelected] = useState<Set<string>>(() => new Set(items.map((i) => i.key)));
	const [applied, setApplied] = useState(false);

	if (!items.length) return null;

	const toggle = (key: string, on: boolean) =>
		setSelected((prev) => {
			const next = new Set(prev);
			if (on) next.add(key);
			else next.delete(key);
			return next;
		});

	const allOn = selected.size === items.length;

	function submit() {
		const picked = items.filter((i) => selected.has(i.key));
		if (!picked.length) return;
		const keys = picked.map((i) => i.key);
		const input =
			kind === "competitors"
				? { runId, competitors: picked.map((i) => i.competitor ?? { name: i.key }) }
				: kind === "keywords"
					? { runId, keywords: keys }
					: { runId, buyerQuestions: keys };
		apply.mutate(input, { onSuccess: () => setApplied(true) });
	}

	return (
		<Card className="overflow-hidden">
			<CardHeader className="flex-row items-start justify-between gap-3 border-border border-b pb-4">
				<div className="grid gap-1">
					<CardTitle>{title}</CardTitle>
					<CardDescription>{description}</CardDescription>
				</div>
				{editable ? (
					<Button
						variant="ghost"
						size="xs"
						onClick={() => setSelected(allOn ? new Set() : new Set(items.map((i) => i.key)))}
					>
						{allOn ? "Clear all" : "Select all"}
					</Button>
				) : null}
			</CardHeader>
			<CardContent>
				<ul
					className={cn(layout === "chips" ? "flex flex-wrap gap-2" : "grid gap-2.5", "list-none")}
					aria-label={title}
				>
					{items.map((item, i) => {
						const id = `${baseId}-${i}`;
						const on = selected.has(item.key);
						if (!editable) {
							return (
								<li
									key={item.key}
									className={cn(
										"text-sm",
										layout === "chips" && "rounded-full bg-muted px-2.5 py-1 text-xs",
									)}
								>
									{item.label}
								</li>
							);
						}
						return (
							<li key={item.key}>
								<label
									htmlFor={id}
									className={cn(
										"flex cursor-pointer items-start gap-2.5 text-sm",
										layout !== "chips" && "rounded-xl border px-3 py-2.5 transition-colors",
										layout !== "chips" &&
											(on ? "border-border-strong bg-surface" : "border-border hover:bg-surface"),
										layout === "chips" &&
											"items-center rounded-full border py-1 pr-3 pl-2 text-xs transition-colors",
										layout === "chips" &&
											(on ? "border-border-strong bg-muted" : "border-border hover:bg-muted"),
									)}
								>
									<Checkbox
										id={id}
										checked={on}
										onCheckedChange={(v) => toggle(item.key, v === true)}
										className={layout === "chips" ? undefined : "mt-0.5"}
									/>
									<span className="min-w-0">{item.label}</span>
								</label>
							</li>
						);
					})}
				</ul>
			</CardContent>
			{editable ? (
				<CardFooter className="justify-between">
					<span className="font-mono text-muted-foreground text-xs tabular-nums" aria-live="polite">
						{selected.size} of {items.length} selected
					</span>
					<div className="flex flex-wrap gap-2">
						{applied ? (
							<Button variant="ghost" size="sm" onClick={onDone}>
								{doneLabel}
							</Button>
						) : null}
						<Button
							size="sm"
							variant={applied ? "outline" : "primary"}
							disabled={selected.size === 0}
							loading={apply.isPending}
							onClick={submit}
						>
							{apply.isPending ? null : <Plus />}
							{actionLabel}
						</Button>
					</div>
				</CardFooter>
			) : null}
		</Card>
	);
}
