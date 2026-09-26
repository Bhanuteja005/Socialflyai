"use client";

import { Badge, type BadgeTone } from "@socialfly/ui/components/badge";
import { Button } from "@socialfly/ui/components/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@socialfly/ui/components/card";
import { Switch } from "@socialfly/ui/components/controls";
import {
	ConfirmDialog,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@socialfly/ui/components/dialog";
import { EmptyState } from "@socialfly/ui/components/feedback";
import { Field, fieldAria } from "@socialfly/ui/components/field";
import { Textarea } from "@socialfly/ui/components/input";
import { cn } from "@socialfly/ui/utils";
import {
	ArrowDown,
	ArrowUp,
	KeyRound,
	Lightbulb,
	LineChart as LineChartIcon,
	Minus,
	Plus,
	Trash2,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import { useKeywordMutations, useKeywords, useResearchCapabilities } from "@/hooks/use-research";
import type { Keyword } from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { formatCompact, formatNumber, formatRelative, formatUsd, UNKNOWN } from "@/lib/format";
import { useOrg } from "../org-provider";
import { KeywordIdeasDialog } from "./keyword-ideas-dialog";
import { KeywordRankingDialog } from "./keyword-ranking";
import { ListSkeleton, LoadError, SetupNote } from "./research-shared";

/** The API takes at most 50 keywords per request. */
export const MAX_KEYWORDS_PER_ADD = 50;

/** One per line (commas also split), trimmed, de-duplicated case-insensitively. */
export function parseKeywords(text: string) {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of text.split(/[\n,]/)) {
		const k = raw.trim().replace(/\s+/g, " ");
		if (!k || seen.has(k.toLowerCase())) continue;
		seen.add(k.toLowerCase());
		out.push(k);
	}
	return out;
}

export function KeywordsTab() {
	const { can } = useOrg();
	const editor = can("editor");
	const caps = useResearchCapabilities();
	const keywords = useKeywords();
	const { setTracked, remove } = useKeywordMutations();
	const [adding, setAdding] = useState(false);
	const [ideas, setIdeas] = useState(false);
	const [charting, setCharting] = useState<Keyword | null>(null);
	const [deleting, setDeleting] = useState<Keyword | null>(null);

	const seo = caps.data?.seo ?? false;
	const items = keywords.data?.items ?? [];

	return (
		<div className="grid gap-5">
			{caps.isSuccess && !seo ? (
				<SetupNote>
					Search data isn't connected. Volume, difficulty, ideas and rank tracking need{" "}
					<code>DATAFORSEO_LOGIN</code> and <code>DATAFORSEO_PASSWORD</code> on the API.
				</SetupNote>
			) : null}

			<Card className="overflow-hidden">
				<CardHeader className="flex-row flex-wrap items-start justify-between gap-3 border-border border-b pb-4">
					<div className="grid gap-1">
						<CardTitle>Keywords</CardTitle>
						<CardDescription>Where your site ranks in Google, checked daily.</CardDescription>
					</div>
					{editor ? (
						<div className="flex flex-wrap gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => setIdeas(true)}
								disabled={!seo}
								title={seo ? undefined : "Needs DataForSEO credentials on the server"}
							>
								<Lightbulb />
								Get ideas
							</Button>
							<Button size="sm" onClick={() => setAdding(true)}>
								<Plus />
								Add keywords
							</Button>
						</div>
					) : null}
				</CardHeader>

				<div>
					{keywords.isPending ? (
						<div className="p-5">
							<ListSkeleton rows={5} />
						</div>
					) : keywords.isError ? (
						<div className="p-5">
							<LoadError
								title="Couldn't load keywords"
								error={keywords.error}
								onRetry={() => void keywords.refetch()}
							/>
						</div>
					) : items.length === 0 ? (
						<div className="p-5">
							<EmptyState
								icon={KeyRound}
								title="No keywords yet"
								description="Add the searches you want to be found for, or pick them from your brand research."
								action={
									editor ? (
										<Button size="sm" onClick={() => setAdding(true)}>
											<Plus />
											Add keywords
										</Button>
									) : undefined
								}
							/>
						</div>
					) : (
						<KeywordTable
							items={items}
							editor={editor}
							seo={seo}
							onTrack={(k, tracked) => setTracked.mutate({ id: k.id, tracked })}
							onChart={setCharting}
							onDelete={setDeleting}
						/>
					)}
				</div>
			</Card>

			{adding ? <AddKeywordsDialog onClose={() => setAdding(false)} /> : null}
			{ideas ? (
				<KeywordIdeasDialog
					existing={new Set(items.map((k) => k.keyword.toLowerCase()))}
					onClose={() => setIdeas(false)}
				/>
			) : null}
			<KeywordRankingDialog keyword={charting} onClose={() => setCharting(null)} />
			<ConfirmDialog
				open={deleting !== null}
				onOpenChange={(open) => (open ? undefined : setDeleting(null))}
				title={`Delete “${deleting?.keyword ?? ""}”?`}
				description="Its ranking history is deleted too."
				confirmLabel="Delete"
				tone="danger"
				onConfirm={async () => {
					if (!deleting) return;
					await remove.mutateAsync(deleting.id).catch(() => undefined);
					setDeleting(null);
				}}
			/>
		</div>
	);
}

function difficultyTone(d: number): BadgeTone {
	if (d < 30) return "success";
	if (d < 60) return "warning";
	return "danger";
}

function difficultyLabel(d: number) {
	if (d < 30) return "Easy";
	if (d < 60) return "Medium";
	return "Hard";
}

/** Position change: fewer is better, so a drop in the number is an improvement. */
function PositionChange({ k }: { k: Keyword }) {
	if (k.position === null) {
		return k.previousPosition !== null ? (
			<span className="font-mono text-danger text-xs">dropped out</span>
		) : null;
	}
	if (k.previousPosition === null)
		return <span className="font-mono text-muted-foreground text-xs">new</span>;
	const diff = k.previousPosition - k.position;
	if (diff === 0) {
		return (
			<span className="inline-flex items-center text-subtle-foreground text-xs">
				<Minus className="size-3" aria-hidden="true" />
				<span className="sr-only">unchanged</span>
			</span>
		);
	}
	const up = diff > 0;
	const Icon = up ? ArrowUp : ArrowDown;
	return (
		<span
			className={cn(
				"inline-flex items-center gap-0.5 font-mono text-xs tabular-nums",
				up ? "text-success" : "text-danger",
			)}
			title={`Was #${k.previousPosition}`}
		>
			<Icon className="size-3" aria-hidden="true" />
			<span className="sr-only">{up ? "up" : "down"} </span>
			{Math.abs(diff)}
		</span>
	);
}

const th = "h-10 px-4 font-medium";
const td = "px-4 py-3 font-mono tabular-nums";

function KeywordTable({
	items,
	editor,
	seo,
	onTrack,
	onChart,
	onDelete,
}: {
	items: Keyword[];
	editor: boolean;
	seo: boolean;
	onTrack: (k: Keyword, tracked: boolean) => void;
	onChart: (k: Keyword) => void;
	onDelete: (k: Keyword) => void;
}) {
	return (
		<div className="scrollbar-thin relative overflow-x-auto [contain:inline-size]">
			<table className="w-full min-w-[820px] text-sm">
				<caption className="sr-only">Your keywords with search metrics and ranking</caption>
				<thead>
					<tr className="border-border border-b bg-surface text-muted-foreground text-xs">
						<th scope="col" className={cn(th, "text-left")}>
							Keyword
						</th>
						<th scope="col" className={cn(th, "text-right")}>
							<abbr title="Average monthly searches" className="no-underline">
								Volume
							</abbr>
						</th>
						<th scope="col" className={cn(th, "text-right")}>
							Difficulty
						</th>
						<th scope="col" className={cn(th, "text-right")}>
							<abbr title="Cost per click in search ads" className="no-underline">
								CPC
							</abbr>
						</th>
						<th scope="col" className={cn(th, "text-right")}>
							Position
						</th>
						<th scope="col" className={cn(th, "text-left")}>
							Ranking page
						</th>
						<th scope="col" className={cn(th, "text-center")}>
							Tracked
						</th>
						<th scope="col" className={th}>
							<span className="sr-only">Actions</span>
						</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-border">
					{items.map((k) => (
						<tr key={k.id} className="transition-colors hover:bg-surface">
							<th scope="row" className="min-w-44 px-4 py-3 text-left font-medium">
								{k.keyword}
								{k.metricsUpdatedAt ? null : seo ? (
									<span className="block font-normal text-subtle-foreground text-xs">
										Metrics on the way
									</span>
								) : null}
							</th>
							<td className={cn(td, "text-right")} title={formatNumber(k.searchVolume)}>
								{formatCompact(k.searchVolume)}
							</td>
							<td className={cn(td, "text-right")}>
								{k.difficulty === null ? (
									UNKNOWN
								) : (
									<span className="inline-flex items-center gap-2">
										<span>{Math.round(k.difficulty)}</span>
										<Badge tone={difficultyTone(k.difficulty)}>
											{difficultyLabel(k.difficulty)}
										</Badge>
									</span>
								)}
							</td>
							<td className={cn(td, "text-right")}>
								{k.cpcUsd === null ? UNKNOWN : formatUsd(Number(k.cpcUsd))}
							</td>
							<td className={cn(td, "text-right")}>
								<span className="inline-flex items-center justify-end gap-1.5">
									<span title={k.rankCheckedAt ? `Checked ${formatRelative(k.rankCheckedAt)}` : ""}>
										{k.position === null ? (
											<span className="text-subtle-foreground">
												{k.rankCheckedAt ? "Not in top 100" : UNKNOWN}
											</span>
										) : (
											<span className="text-foreground">#{k.position}</span>
										)}
									</span>
									<PositionChange k={k} />
								</span>
							</td>
							<td className="max-w-56 px-4 py-3">
								{k.rankedUrl ? (
									<a
										href={k.rankedUrl}
										target="_blank"
										rel="noreferrer noopener"
										className="block truncate font-mono text-[11.5px] text-muted-foreground hover:text-foreground hover:underline"
									>
										{k.rankedUrl.replace(/^https?:\/\/(www\.)?/, "")}
									</a>
								) : (
									<span className="text-subtle-foreground">{UNKNOWN}</span>
								)}
							</td>
							<td className="px-4 py-3 text-center">
								<Switch
									checked={k.tracked}
									disabled={!editor}
									onCheckedChange={(v) => onTrack(k, v)}
									aria-label={`Track ranking for ${k.keyword}`}
								/>
							</td>
							<td className="px-2 py-3">
								<div className="flex justify-end gap-0.5">
									<Button
										variant="ghost"
										size="icon-xs"
										aria-label={`Ranking history for ${k.keyword}`}
										onClick={() => onChart(k)}
									>
										<LineChartIcon />
									</Button>
									{editor ? (
										<Button
											variant="ghost"
											size="icon-xs"
											aria-label={`Delete ${k.keyword}`}
											onClick={() => onDelete(k)}
										>
											<Trash2 />
										</Button>
									) : null}
								</div>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function AddKeywordsDialog({ onClose }: { onClose: () => void }) {
	const { add } = useKeywordMutations();
	const [text, setText] = useState("");
	const [touched, setTouched] = useState(false);
	const parsed = parseKeywords(text);
	const error =
		touched && parsed.length === 0
			? "Enter at least one keyword."
			: parsed.length > MAX_KEYWORDS_PER_ADD
				? `Add up to ${MAX_KEYWORDS_PER_ADD} at a time.`
				: parsed.some((k) => k.length > 100)
					? "Keep each keyword to 100 characters or fewer."
					: null;

	function onSubmit(e: FormEvent) {
		e.preventDefault();
		setTouched(true);
		if (!parsed.length || error) return;
		add.mutate(parsed, { onSuccess: onClose });
	}

	return (
		<Dialog open onOpenChange={(open) => (open || add.isPending ? undefined : onClose())}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add keywords</DialogTitle>
					<DialogDescription>New keywords are tracked from the next daily check.</DialogDescription>
				</DialogHeader>
				<form onSubmit={onSubmit} noValidate className="grid gap-4">
					<Field
						label="Keywords"
						htmlFor="keywords-input"
						error={error}
						hint={`One per line. ${parsed.length ? `${parsed.length} to add.` : ""}`}
					>
						<Textarea
							id="keywords-input"
							value={text}
							rows={7}
							placeholder={"social media scheduler\nbest time to post on linkedin"}
							onChange={(e) => setText(e.target.value)}
							autoFocus
							{...fieldAria("keywords-input", error, true)}
						/>
					</Field>
					{add.error ? (
						<p role="alert" className="text-danger text-sm">
							{errorMessage(add.error)}
						</p>
					) : null}
					<DialogFooter>
						<Button variant="outline" onClick={onClose} disabled={add.isPending}>
							Cancel
						</Button>
						<Button type="submit" loading={add.isPending}>
							Add {parsed.length > 1 ? `${parsed.length} keywords` : "keyword"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
