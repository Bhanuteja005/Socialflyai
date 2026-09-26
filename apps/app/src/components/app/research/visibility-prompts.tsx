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
	DialogHeader,
	DialogTitle,
} from "@socialfly/ui/components/dialog";
import { EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import { Input } from "@socialfly/ui/components/input";
import { toast } from "@socialfly/ui/components/toast";
import { cn } from "@socialfly/ui/utils";
import {
	Check,
	ChevronDown,
	ExternalLink,
	MessageSquareText,
	Pencil,
	Plus,
	Trash2,
	X,
} from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import {
	MAX_PROMPTS,
	usePromptChecks,
	usePromptMutations,
	useVisibilityCheck,
	type useVisibilityPrompts,
} from "@/hooks/use-research";
import type { VisibilityCheck, VisibilityPrompt } from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { formatDateTime, formatPercent, formatRelative } from "@/lib/format";
import { useOrg } from "../org-provider";
import { engineName, ListSkeleton, LoadError } from "./research-shared";

export function PromptsCard({ prompts }: { prompts: ReturnType<typeof useVisibilityPrompts> }) {
	const { can } = useOrg();
	const editor = can("editor");
	const { create, remove } = usePromptMutations();
	const [draft, setDraft] = useState("");
	const [deleting, setDeleting] = useState<VisibilityPrompt | null>(null);
	const items = prompts.data?.items ?? [];
	// The cap is on *active* questions; paused ones don't count.
	const activeCount = items.filter((p) => p.active).length;
	const full = activeCount >= MAX_PROMPTS;

	function onAdd(e: FormEvent) {
		e.preventDefault();
		const prompt = draft.trim();
		if (prompt.length < 5 || full) return;
		create.mutate(prompt, {
			onSuccess: () => {
				setDraft("");
				toast.success("Question added. It's included in the next check.");
			},
		});
	}

	return (
		<Card className="overflow-hidden">
			<CardHeader className="border-border border-b pb-4">
				<CardTitle>Questions we ask</CardTitle>
				<CardDescription>
					Ask the way a buyer would, without naming your brand. Up to{" "}
					<span className="font-mono">{MAX_PROMPTS}</span> active.
				</CardDescription>
			</CardHeader>

			{editor ? (
				<form
					onSubmit={onAdd}
					className="flex flex-wrap gap-2 border-border border-b bg-surface px-5 py-4"
				>
					<label htmlFor="new-prompt" className="sr-only">
						New question
					</label>
					<Input
						id="new-prompt"
						value={draft}
						maxLength={500}
						disabled={full || create.isPending}
						placeholder={
							full
								? `${MAX_PROMPTS} questions are active — pause one to add more`
								: "Add a question buyers ask…"
						}
						onChange={(e) => setDraft(e.target.value)}
						className="min-w-0 flex-1 basis-40"
						aria-describedby={create.error ? "new-prompt-error" : undefined}
					/>
					<Button
						type="submit"
						loading={create.isPending}
						disabled={full || draft.trim().length < 5}
					>
						{create.isPending ? null : <Plus />}
						Add
					</Button>
					{create.error ? (
						<p id="new-prompt-error" role="alert" className="basis-full text-danger text-xs">
							{errorMessage(create.error)}
						</p>
					) : null}
				</form>
			) : null}

			<div>
				{prompts.isPending ? (
					<div className="p-5">
						<ListSkeleton />
					</div>
				) : prompts.isError ? (
					<div className="p-5">
						<LoadError
							title="Couldn't load your questions"
							error={prompts.error}
							onRetry={() => void prompts.refetch()}
						/>
					</div>
				) : items.length === 0 ? (
					<div className="p-5">
						<EmptyState
							compact
							icon={MessageSquareText}
							title="No questions yet"
							description="Add one above, or track the buyer questions from your brand research."
						/>
					</div>
				) : (
					<>
						<p className="flex h-10 items-center border-border border-b px-5 font-mono text-muted-foreground text-xs tabular-nums">
							{activeCount} of {MAX_PROMPTS} active
							{items.length > activeCount ? ` · ${items.length - activeCount} paused` : ""}
						</p>
						<ul className="divide-y divide-border">
							{items.map((p) => (
								<PromptRow
									key={p.id}
									prompt={p}
									editor={editor}
									canResume={!full}
									onDelete={() => setDeleting(p)}
								/>
							))}
						</ul>
					</>
				)}
			</div>

			<ConfirmDialog
				open={deleting !== null}
				onOpenChange={(open) => (open ? undefined : setDeleting(null))}
				title="Delete this question?"
				description="Its past checks are deleted too, and it no longer counts toward your visibility."
				confirmLabel="Delete"
				tone="danger"
				onConfirm={async () => {
					if (!deleting) return;
					await remove.mutateAsync(deleting.id).catch(() => undefined);
					setDeleting(null);
				}}
			/>
		</Card>
	);
}

function PromptRow({
	prompt,
	editor,
	canResume,
	onDelete,
}: {
	prompt: VisibilityPrompt;
	editor: boolean;
	/** False at the active-question cap: a paused one can't be resumed until another is paused. */
	canResume: boolean;
	onDelete: () => void;
}) {
	const { update } = usePromptMutations();
	const [open, setOpen] = useState(false);
	const [editing, setEditing] = useState(false);
	const [text, setText] = useState(prompt.prompt);
	const panelId = useId();

	function onSave(e: FormEvent) {
		e.preventDefault();
		const next = text.trim();
		if (next.length < 5) return;
		if (next === prompt.prompt) {
			setEditing(false);
			return;
		}
		update.mutate({ id: prompt.id, prompt: next }, { onSuccess: () => setEditing(false) });
	}

	return (
		<li className={cn(!prompt.active && "bg-surface")}>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3">
				{editing ? (
					<form onSubmit={onSave} className="flex min-w-0 flex-1 gap-2">
						<label htmlFor={`${panelId}-edit`} className="sr-only">
							Question
						</label>
						<Input
							id={`${panelId}-edit`}
							value={text}
							maxLength={500}
							autoFocus
							onChange={(e) => setText(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Escape") {
									setText(prompt.prompt);
									setEditing(false);
								}
							}}
						/>
						<Button
							type="submit"
							size="icon-sm"
							aria-label="Save question"
							loading={update.isPending}
							disabled={text.trim().length < 5}
						>
							{update.isPending ? null : <Check />}
						</Button>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Cancel editing"
							onClick={() => {
								setText(prompt.prompt);
								setEditing(false);
							}}
						>
							<X />
						</Button>
					</form>
				) : (
					<button
						type="button"
						onClick={() => setOpen((o) => !o)}
						aria-expanded={open}
						aria-controls={panelId}
						className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-ring"
					>
						<ChevronDown
							className={cn(
								"mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
								open && "rotate-180",
							)}
							aria-hidden="true"
						/>
						<span className="grid min-w-0 gap-0.5">
							<span className={cn("text-sm", !prompt.active && "text-muted-foreground")}>
								{prompt.prompt}
							</span>
							<span className="text-muted-foreground text-xs">
								{prompt.lastCheckedAt
									? `Checked ${formatRelative(prompt.lastCheckedAt)}`
									: "Not checked yet"}
								{prompt.active ? "" : " · paused"}
							</span>
						</span>
					</button>
				)}

				<span className="w-24 text-right">
					<span className="block font-mono text-sm tabular-nums">
						{formatPercent(prompt.mentionRate)}
					</span>
					<span className="block text-muted-foreground text-xs">mention rate</span>
				</span>

				{editor && !editing ? (
					<div className="flex items-center gap-1">
						<Switch
							checked={prompt.active}
							disabled={!prompt.active && !canResume}
							onCheckedChange={(active) => update.mutate({ id: prompt.id, active })}
							aria-label={prompt.active ? "Pause this question" : "Resume this question"}
							className="mr-1"
						/>
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label="Edit question"
							onClick={() => setEditing(true)}
						>
							<Pencil />
						</Button>
						<Button variant="ghost" size="icon-xs" aria-label="Delete question" onClick={onDelete}>
							<Trash2 />
						</Button>
					</div>
				) : null}
			</div>
			{open ? (
				<div id={panelId} className="border-border border-t bg-surface px-5 py-4">
					<PromptChecks promptId={prompt.id} />
				</div>
			) : null}
		</li>
	);
}

const SENTIMENT: Record<string, { label: string; tone: BadgeTone }> = {
	positive: { label: "Positive", tone: "success" },
	neutral: { label: "Neutral", tone: "neutral" },
	negative: { label: "Negative", tone: "danger" },
};

function PromptChecks({ promptId }: { promptId: string }) {
	const checks = usePromptChecks(promptId, true);
	const [viewing, setViewing] = useState<string | null>(null);

	if (checks.isPending) {
		return (
			<div className="grid gap-2" aria-busy="true">
				<Skeleton className="h-20" />
				<Skeleton className="h-20" />
			</div>
		);
	}
	if (checks.isError) {
		return (
			<LoadError
				compact
				title="Couldn't load recent answers"
				error={checks.error}
				onRetry={() => void checks.refetch()}
			/>
		);
	}
	if (!checks.data.items.length) {
		return (
			<p className="text-muted-foreground text-sm">
				No answers yet. This question is asked in the next check.
			</p>
		);
	}
	return (
		<>
			<ul className="grid gap-3" aria-label="Recent answers">
				{checks.data.items.map((c) => (
					<CheckItem key={c.id} check={c} onView={() => setViewing(c.id)} />
				))}
			</ul>
			<FullAnswerDialog id={viewing} onClose={() => setViewing(null)} />
		</>
	);
}

function CheckItem({ check: c, onView }: { check: VisibilityCheck; onView: () => void }) {
	const { org } = useOrg();
	const sentiment = c.sentiment ? SENTIMENT[c.sentiment] : undefined;
	return (
		<li className="grid gap-2 rounded-xl border border-border bg-surface-raised p-4">
			<div className="flex flex-wrap items-center gap-2 text-xs">
				<span className="font-medium text-sm">{engineName(c.engine)}</span>
				<span className="font-mono text-[11px] text-muted-foreground">{c.model}</span>
				<span
					className="font-mono text-subtle-foreground"
					title={formatDateTime(c.checkedAt, org.timezone)}
				>
					· {formatRelative(c.checkedAt)}
				</span>
				<span className="ml-auto flex flex-wrap items-center gap-1.5">
					{c.errorCode ? (
						<Badge tone="warning">Check failed</Badge>
					) : c.brandMentioned ? (
						<Badge tone="success">
							<Check aria-hidden="true" />
							Mentioned
						</Badge>
					) : (
						<Badge tone="neutral">
							<X aria-hidden="true" />
							Not mentioned
						</Badge>
					)}
					{c.brandRank !== null ? <Badge tone="outline">Rank #{c.brandRank}</Badge> : null}
					{sentiment ? <Badge tone={sentiment.tone}>{sentiment.label}</Badge> : null}
				</span>
			</div>

			{c.errorCode ? (
				<p className="text-muted-foreground text-sm">
					The engine didn't answer ({c.errorCode.replaceAll("_", " ")}). It's retried in the next
					check.
				</p>
			) : (
				<>
					{c.answerExcerpt ? (
						<p className="line-clamp-3 text-muted-foreground text-sm">{c.answerExcerpt}</p>
					) : null}
					{c.competitors.length ? (
						<p className="text-xs">
							<span className="text-muted-foreground">Competitors named: </span>
							{c.competitors.map((x) => x.name).join(", ")}
						</p>
					) : null}
					{c.citations.length ? (
						<ul className="flex flex-wrap gap-1.5" aria-label="Sources cited">
							{c.citations.map((ci) => (
								<li key={ci.url}>
									<a
										href={ci.url}
										target="_blank"
										rel="noreferrer noopener"
										className={cn(
											"inline-flex max-w-64 items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:underline",
											ci.own
												? "border-border-strong bg-surface text-foreground"
												: "border-border text-muted-foreground",
										)}
									>
										<span className="truncate">{ci.domain}</span>
										{ci.own ? <span className="font-medium">· you</span> : null}
										{ci.competitorId && !ci.own ? (
											<span className="font-medium">· competitor</span>
										) : null}
										<ExternalLink className="size-3 shrink-0" aria-hidden="true" />
									</a>
								</li>
							))}
						</ul>
					) : null}
					<Button variant="link" size="xs" className="justify-self-start" onClick={onView}>
						View full answer
					</Button>
				</>
			)}
		</li>
	);
}

function FullAnswerDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
	const { org } = useOrg();
	const check = useVisibilityCheck(id);
	return (
		<Dialog open={id !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						{check.data ? `${engineName(check.data.engine)}'s answer` : "Full answer"}
					</DialogTitle>
					<DialogDescription>
						{check.data
							? `${check.data.model} · ${formatDateTime(check.data.checkedAt, org.timezone)}`
							: "Loading…"}
					</DialogDescription>
				</DialogHeader>
				{check.isPending ? (
					<Skeleton className="h-48" />
				) : check.isError ? (
					<LoadError
						compact
						title="Couldn't load the answer"
						error={check.error}
						onRetry={() => void check.refetch()}
					/>
				) : (
					<div className="scrollbar-thin max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-surface p-4 text-sm leading-relaxed">
						{check.data.answer || "The engine returned an empty answer."}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
