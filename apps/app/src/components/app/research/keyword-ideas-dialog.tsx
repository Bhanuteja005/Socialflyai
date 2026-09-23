"use client";

import { Button } from "@socialfly/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@socialfly/ui/components/dialog";
import { Alert, EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import { Field } from "@socialfly/ui/components/field";
import { TagInput } from "@socialfly/ui/components/tag-input";
import { AlertTriangle, Check, Lightbulb, Plus, Search } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useKeywordIdeas, useKeywordMutations } from "@/hooks/use-research";
import { errorMessage } from "@/lib/errors";
import { formatCompact, formatNumber, formatUsd, UNKNOWN } from "@/lib/format";

const MAX_SEEDS = 5;

/** Seed words in, related searches with their metrics out; each can be added to the list. */
export function KeywordIdeasDialog({
	existing,
	onClose,
}: {
	/** Lower-cased keywords already on the list. */
	existing: Set<string>;
	onClose: () => void;
}) {
	const ideas = useKeywordIdeas();
	const { add } = useKeywordMutations();
	const [seeds, setSeeds] = useState<string[]>([]);
	const [added, setAdded] = useState<Set<string>>(() => new Set());
	const [pending, setPending] = useState<string | null>(null);

	function onSubmit(e: FormEvent) {
		e.preventDefault();
		if (!seeds.length) return;
		ideas.mutate(seeds);
	}

	function addOne(keyword: string) {
		setPending(keyword);
		add.mutate([keyword], {
			onSuccess: () => setAdded((prev) => new Set(prev).add(keyword.toLowerCase())),
			onSettled: () => setPending(null),
		});
	}

	const items = ideas.data?.items ?? [];

	return (
		<Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>Keyword ideas</DialogTitle>
					<DialogDescription>
						Enter up to {MAX_SEEDS} words that describe what you do; we'll suggest related searches
						with their monthly volume. Each lookup is a paid search-data request.
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
					<Field label="Seed keywords" htmlFor="keyword-seeds" hint="Press Enter after each one.">
						<TagInput
							id="keyword-seeds"
							value={seeds}
							onChange={setSeeds}
							max={MAX_SEEDS}
							maxLength={100}
							placeholder="e.g. social media scheduling"
							aria-describedby="keyword-seeds-hint"
						/>
					</Field>
					<Button
						type="submit"
						loading={ideas.isPending}
						disabled={!seeds.length}
						className="sm:mb-5"
					>
						{ideas.isPending ? null : <Search />}
						Find ideas
					</Button>
				</form>

				{ideas.isPending ? (
					<div className="grid gap-2" aria-busy="true">
						<Skeleton className="h-8" />
						<Skeleton className="h-8" />
						<Skeleton className="h-8" />
					</div>
				) : ideas.isError ? (
					<Alert tone="danger" icon={AlertTriangle}>
						{errorMessage(ideas.error)}
					</Alert>
				) : ideas.isSuccess && items.length === 0 ? (
					<EmptyState
						compact
						icon={Lightbulb}
						title="No ideas for these words"
						description="Try broader or different seed keywords."
					/>
				) : items.length ? (
					<div className="scrollbar-thin max-h-[50vh] overflow-auto rounded-md border border-border">
						<table className="w-full text-sm">
							<caption className="sr-only">Keyword ideas</caption>
							<thead className="sticky top-0 bg-surface">
								<tr className="text-muted-foreground text-xs">
									<th scope="col" className="px-3 py-2 text-left font-medium">
										Keyword
									</th>
									<th scope="col" className="px-3 py-2 text-right font-medium">
										Volume
									</th>
									<th scope="col" className="px-3 py-2 text-right font-medium">
										Difficulty
									</th>
									<th scope="col" className="px-3 py-2 text-right font-medium">
										CPC
									</th>
									<th scope="col" className="px-3 py-2">
										<span className="sr-only">Add</span>
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{items.map((idea) => {
									const onList =
										existing.has(idea.keyword.toLowerCase()) ||
										added.has(idea.keyword.toLowerCase());
									return (
										<tr key={idea.keyword}>
											<th scope="row" className="px-3 py-2 text-left font-normal">
												{idea.keyword}
											</th>
											<td
												className="px-3 py-2 text-right tabular-nums"
												title={formatNumber(idea.searchVolume)}
											>
												{formatCompact(idea.searchVolume)}
											</td>
											<td className="px-3 py-2 text-right tabular-nums">
												{idea.difficulty === null ? UNKNOWN : Math.round(idea.difficulty)}
											</td>
											<td className="px-3 py-2 text-right tabular-nums">
												{idea.cpcUsd === null ? UNKNOWN : formatUsd(Number(idea.cpcUsd))}
											</td>
											<td className="px-3 py-1.5 text-right">
												{onList ? (
													<span className="inline-flex items-center gap-1 text-success text-xs">
														<Check className="size-3.5" aria-hidden="true" />
														Added
													</span>
												) : (
													<Button
														variant="outline"
														size="xs"
														loading={pending === idea.keyword}
														disabled={pending !== null}
														onClick={() => addOne(idea.keyword)}
														aria-label={`Add ${idea.keyword}`}
													>
														{pending === idea.keyword ? null : <Plus />}
														Add
													</Button>
												)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				) : null}
			</DialogContent>
		</Dialog>
	);
}
