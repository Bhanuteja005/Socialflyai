"use client";

import { Badge, type BadgeTone } from "@socialfly/ui/components/badge";
import { Button } from "@socialfly/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@socialfly/ui/components/card";
import { Alert, EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import { Field, fieldAria } from "@socialfly/ui/components/field";
import { Input } from "@socialfly/ui/components/input";
import { cn } from "@socialfly/ui/utils";
import {
	AlertTriangle,
	ArrowLeft,
	Ban,
	Check,
	Clapperboard,
	FileText,
	GalleryHorizontal,
	Globe,
	History,
	Lightbulb,
	PenSquare,
	RefreshCw,
	Telescope,
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, type ReactNode, useState } from "react";
import { useBrandProfile } from "@/hooks/use-ai";
import {
	isRunActive,
	useActiveRun,
	useLatestRun,
	useResearchCapabilities,
	useResearchRun,
	useRunPages,
	useStartResearch,
} from "@/hooks/use-research";
import type { ContentIdea, ResearchRun, ResearchRunStatus } from "@/lib/api-types";
import { friendlyCode } from "@/lib/errors";
import { formatDateTime, formatNumber, formatRelative, formatUsd, pluralize } from "@/lib/format";
import { providerName } from "@/lib/providers";
import { AiError, AiNotConfigured } from "../ai/ai-shared";
import { useOrg } from "../org-provider";
import { ProviderIcon } from "../provider-icon";
import { InsightPicker } from "./insight-picker";
import { hostOf, LoadError } from "./research-shared";

type OpenTab = (tab: "visibility" | "keywords" | "competitors") => void;

export function BrandTab({ onOpenTab }: { onOpenTab: OpenTab }) {
	const caps = useResearchCapabilities();
	const latest = useLatestRun();
	const { runs, active } = useActiveRun();
	// A run picked from the history list; null = the current brief.
	const [viewingId, setViewingId] = useState<string | null>(null);
	const picked = useResearchRun(viewingId);

	if (latest.isPending || caps.isPending || runs.isPending) {
		return (
			<div className="grid gap-4" aria-busy="true">
				<Skeleton className="h-40" />
				<div className="grid gap-4 md:grid-cols-3">
					<Skeleton className="h-28" />
					<Skeleton className="h-28" />
					<Skeleton className="h-28" />
				</div>
			</div>
		);
	}
	if (latest.isError || caps.isError || runs.isError) {
		return (
			<LoadError
				title="Couldn't load your brand research"
				error={latest.error ?? caps.error ?? runs.error}
				onRetry={() => void Promise.all([latest.refetch(), caps.refetch(), runs.refetch()])}
			/>
		);
	}

	const configured = caps.data.research;
	const brief = latest.data;
	const newest = runs.data.items[0];
	// A failure newer than the brief on screen (the brief itself may be an older success).
	const freshFailure =
		!active && newest?.status === "failed" && newest.id !== brief?.id ? newest : null;
	const canRerun = !active && Boolean(brief ?? newest);

	let body: ReactNode;
	if (viewingId) {
		const run = picked.data;
		body = (
			<>
				<div className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
					<Button variant="ghost" size="xs" onClick={() => setViewingId(null)}>
						<ArrowLeft />
						Back to latest
					</Button>
					<span>Viewing an earlier run{run ? ` from ${formatRelative(run.createdAt)}` : ""}.</span>
				</div>
				{picked.isPending ? (
					<Skeleton className="h-64" />
				) : picked.isError ? (
					<LoadError
						title="Couldn't load this run"
						error={picked.error}
						onRetry={() => void picked.refetch()}
					/>
				) : isRunActive(picked.data.status) ? (
					<RunProgress run={picked.data} />
				) : picked.data.status === "failed" ? (
					<RunFailed run={picked.data} />
				) : (
					<RunInsights run={picked.data} onOpenTab={onOpenTab} />
				)}
			</>
		);
	} else if (!brief && !active) {
		body = <StartResearch configured={configured} intro />;
	} else {
		body = (
			<>
				{active ? <RunProgress run={active} /> : null}
				{freshFailure ? <RunFailed run={freshFailure} /> : null}
				{brief?.status === "succeeded" ? (
					<RunInsights run={brief} onOpenTab={onOpenTab} />
				) : brief?.status === "failed" && brief.id !== freshFailure?.id ? (
					<RunFailed run={brief} />
				) : null}
				{canRerun ? (
					<StartResearch
						configured={configured}
						again={(freshFailure ?? brief ?? newest)?.startUrl ?? ""}
					/>
				) : null}
			</>
		);
	}

	return (
		<div className="grid gap-6">
			{!configured ? (
				<AiNotConfigured>
					Brand research reads your website and summarizes it with AI. Add{" "}
					<code>ANTHROPIC_API_KEY</code> to the API's environment to turn it on.
				</AiNotConfigured>
			) : null}
			{body}
			<RunHistory
				runs={runs.data.items}
				currentId={viewingId ?? brief?.id ?? null}
				onPick={(id) => setViewingId(id === brief?.id ? null : id)}
			/>
		</div>
	);
}

// ── Starting a run ───────────────────────────────────────────────────────────

const URL_RE = /^https?:\/\/\S+\.\S+/;

function StartResearch({
	configured,
	intro,
	again,
}: {
	configured: boolean;
	intro?: boolean;
	/** "Research again" mode: the previous run's address, used when no website is saved. */
	again?: string;
}) {
	const { can } = useOrg();
	const brand = useBrandProfile();
	const start = useStartResearch();
	const [url, setUrl] = useState("");
	const [touched, setTouched] = useState(false);
	const website = brand.data?.website ?? null;
	const editor = can("editor");

	const urlError =
		touched && !website && !again && !URL_RE.test(url.trim())
			? "Enter your website's address, starting with https://"
			: null;

	function onSubmit(e: FormEvent) {
		e.preventDefault();
		setTouched(true);
		if (again) {
			// The saved website wins (it may have changed); otherwise re-read the same address.
			start.mutate(website ? undefined : again);
			return;
		}
		if (!website && !URL_RE.test(url.trim())) return;
		start.mutate(website ? undefined : url.trim());
	}

	const costNote = (
		<p className="text-subtle-foreground text-xs">
			Reads your public pages, then uses your AI budget to summarize them — usually a few cents. It
			takes a few minutes and runs in the background.
		</p>
	);

	if (again) {
		if (!editor) return null;
		return (
			<form
				onSubmit={onSubmit}
				className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border border-dashed px-4 py-3"
			>
				<div className="grid gap-0.5">
					<p className="font-medium text-sm">Website changed?</p>
					<p className="text-muted-foreground text-xs">
						Run the research again to refresh these insights. Uses your AI budget.
					</p>
				</div>
				<div className="grid justify-items-end gap-1">
					<Button
						type="submit"
						variant="outline"
						size="sm"
						loading={start.isPending}
						disabled={!configured || brand.isPending}
					>
						{start.isPending ? null : <RefreshCw />}
						Research again
					</Button>
					{!website && brand.isSuccess ? (
						<span className="text-muted-foreground text-xs">
							Reads {hostOf(again)} again ·{" "}
							<Link href="/settings/brand" className="text-primary-text hover:underline">
								save your website
							</Link>
						</span>
					) : null}
				</div>
				{start.error ? <AiError error={start.error} className="basis-full" /> : null}
			</form>
		);
	}

	return (
		<Card>
			<CardContent className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:items-start">
				<div className="grid gap-3">
					<div className="flex size-10 items-center justify-center rounded-lg border border-border bg-surface shadow-xs">
						<Telescope className="size-5 text-primary-text" aria-hidden="true" />
					</div>
					<h2 className="font-semibold text-lg tracking-tight">
						{intro ? "Let SocialFly get to know your brand" : "Research your website"}
					</h2>
					<p className="max-w-prose text-muted-foreground text-sm">
						We read your website and turn it into a brand brief: who you serve, what you offer, the
						questions buyers ask, likely competitors, content gaps and ready-to-make content ideas.
						You can then track those questions in AI assistants and the keywords in search.
					</p>
				</div>

				{!editor ? (
					<Alert tone="info" icon={Telescope}>
						Ask an editor to research your website.
					</Alert>
				) : (
					<form onSubmit={onSubmit} noValidate className="grid gap-3">
						{brand.isPending ? (
							<Skeleton className="h-9" />
						) : website ? (
							<p className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm">
								<Globe className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
								<span className="truncate">{hostOf(website)}</span>
								<Link
									href="/settings/brand"
									className="ml-auto shrink-0 text-primary-text text-xs hover:underline"
								>
									Change
								</Link>
							</p>
						) : (
							<Field
								label="Your website"
								htmlFor="research-url"
								error={urlError}
								hint={
									<>
										Or save it once in{" "}
										<Link href="/settings/brand" className="text-primary-text hover:underline">
											Brand voice settings
										</Link>
										.
									</>
								}
							>
								<Input
									id="research-url"
									type="url"
									inputMode="url"
									value={url}
									maxLength={500}
									placeholder="https://example.com"
									onChange={(e) => setUrl(e.target.value)}
									disabled={start.isPending}
									{...fieldAria("research-url", urlError, true)}
								/>
							</Field>
						)}
						<Button type="submit" loading={start.isPending} disabled={!configured}>
							{start.isPending ? null : <Telescope />}
							Research my website
						</Button>
						{costNote}
						{start.error ? <AiError error={start.error} /> : null}
					</form>
				)}
			</CardContent>
		</Card>
	);
}

// ── A run in progress ────────────────────────────────────────────────────────

const STEPS: { status: ResearchRunStatus; label: string; detail: string }[] = [
	{ status: "pending", label: "Queued", detail: "Waiting for a worker" },
	{ status: "crawling", label: "Reading your website", detail: "Fetching public pages" },
	{ status: "analyzing", label: "Analyzing", detail: "Writing your brand brief" },
];

function RunProgress({ run }: { run: ResearchRun }) {
	const current = STEPS.findIndex((s) => s.status === run.status);
	const ratio = run.pagesFound > 0 ? Math.min(1, run.pagesCrawled / run.pagesFound) : 0;
	return (
		<Card>
			<CardHeader>
				<CardTitle>Researching {hostOf(run.startUrl)}</CardTitle>
				<CardDescription>
					This usually takes a few minutes. You can leave this page — it keeps going in the
					background.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-5">
				<ol className="grid gap-3 sm:grid-cols-3" aria-label="Research progress">
					{STEPS.map((step, i) => {
						const done = i < current;
						const active = i === current;
						return (
							<li
								key={step.status}
								aria-current={active ? "step" : undefined}
								className={cn(
									"flex items-start gap-3 rounded-lg border px-3 py-2.5",
									active ? "border-primary/40 bg-primary-soft" : "border-border",
								)}
							>
								<span
									className={cn(
										"mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full font-semibold text-[11px]",
										done
											? "bg-primary text-primary-foreground"
											: active
												? "border-2 border-primary text-primary-text"
												: "border border-border-strong text-subtle-foreground",
									)}
									aria-hidden="true"
								>
									{done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
								</span>
								<span className="grid gap-0.5">
									<span className="font-medium text-sm">
										{step.label}
										<span className="sr-only">
											{done ? " (done)" : active ? " (in progress)" : " (not started)"}
										</span>
									</span>
									<span className="text-muted-foreground text-xs">{step.detail}</span>
								</span>
							</li>
						);
					})}
				</ol>

				<div className="grid gap-1.5" aria-live="polite">
					<div className="flex items-baseline justify-between text-sm">
						<span className="text-muted-foreground">Pages read</span>
						<span className="font-medium tabular-nums">
							{formatNumber(run.pagesCrawled)}
							{run.pagesFound ? ` of ${formatNumber(run.pagesFound)} found` : ""}
						</span>
					</div>
					<div
						className="h-1.5 overflow-hidden rounded-full bg-muted"
						role="progressbar"
						aria-label="Pages read"
						aria-valuemin={0}
						aria-valuemax={run.pagesFound || 1}
						aria-valuenow={run.pagesCrawled}
					>
						<div
							className={cn(
								"h-full rounded-full bg-primary transition-[width] duration-500",
								run.status === "pending" && "w-0",
							)}
							style={{
								width: run.status === "analyzing" ? "100%" : `${Math.round(ratio * 100)}%`,
							}}
						/>
					</div>
					<p className="text-subtle-foreground text-xs">Updates every few seconds.</p>
				</div>
			</CardContent>
		</Card>
	);
}

// ── A failed run ─────────────────────────────────────────────────────────────

function RunFailed({ run }: { run: ResearchRun }) {
	const code = run.error?.code;
	const robots = code === "robots_disallowed";
	return (
		<Alert
			tone={robots ? "warning" : "danger"}
			icon={robots ? Ban : AlertTriangle}
			title={
				robots
					? `${hostOf(run.startUrl)} asks crawlers to stay out`
					: `Research of ${hostOf(run.startUrl)} failed`
			}
		>
			<p>
				{(code ? friendlyCode(code) : undefined) ??
					run.error?.message ??
					"Something went wrong while researching your website."}
			</p>
			{robots ? (
				<p className="mt-1">
					We respect <code>robots.txt</code>. Allow <code>SocialFlyBot</code> to read your public
					pages, or research a different address, then try again.
				</p>
			) : null}
			<p className="mt-1 text-xs">Failed {formatRelative(run.completedAt ?? run.createdAt)}.</p>
		</Alert>
	);
}

// ── Insights ─────────────────────────────────────────────────────────────────

function RunInsights({ run, onOpenTab }: { run: ResearchRun; onOpenTab: OpenTab }) {
	const { org, can } = useOrg();
	const insights = run.insights;
	if (!insights) {
		return (
			<EmptyState
				icon={Telescope}
				title="No insights in this run"
				description="The research finished but didn't produce a brief. Try running it again."
			/>
		);
	}
	const editor = can("editor");
	const cost = run.costUsd === null ? null : Number(run.costUsd);

	return (
		<div className="grid gap-6">
			<Card>
				<CardHeader>
					<CardTitle>Your brand at a glance</CardTitle>
					<CardDescription>
						From {pluralize(run.pagesCrawled, "page")} of {hostOf(run.startUrl)}
						{run.completedAt ? (
							<span title={formatDateTime(run.completedAt, org.timezone)}>
								{" "}
								· {formatRelative(run.completedAt)}
							</span>
						) : null}
						{cost !== null && Number.isFinite(cost) ? ` · cost ${formatUsd(cost)}` : null}
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-5">
					<p className="max-w-prose text-sm leading-relaxed">{insights.summary}</p>
					<dl className="grid gap-4 md:grid-cols-2">
						<div className="grid content-start gap-1">
							<dt className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
								Audience
							</dt>
							<dd className="text-sm">{insights.audience}</dd>
						</div>
						<div className="grid content-start gap-1">
							<dt className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
								Value proposition
							</dt>
							<dd className="text-sm">{insights.valueProposition}</dd>
						</div>
					</dl>
				</CardContent>
			</Card>

			{insights.topics.length ? (
				<section aria-labelledby="topics-heading" className="grid gap-3">
					<h2 id="topics-heading" className="font-semibold text-[15px] tracking-tight">
						Topics you own
					</h2>
					<ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
						{insights.topics.map((t) => (
							<li
								key={t.name}
								className="grid content-start gap-1 rounded-lg border border-border bg-surface-raised p-4 shadow-xs"
							>
								<p className="font-medium text-sm">{t.name}</p>
								<p className="text-muted-foreground text-sm">{t.description}</p>
							</li>
						))}
					</ul>
				</section>
			) : null}

			<div className="grid items-start gap-6 xl:grid-cols-2">
				<InsightPicker
					runId={run.id}
					kind="buyerQuestions"
					title="Questions buyers ask"
					description="Track them in AI visibility to see whether assistants recommend you when people ask."
					actionLabel="Track in AI visibility"
					editable={editor}
					items={insights.buyerQuestions.map((q) => ({ key: q, label: q }))}
					onDone={() => onOpenTab("visibility")}
					doneLabel="Open AI visibility"
				/>
				<InsightPicker
					runId={run.id}
					kind="competitors"
					title="Likely competitors"
					description="Added competitors are compared with you in AI answers (share of voice)."
					actionLabel="Add to competitors"
					editable={editor}
					items={insights.competitors.map((c) => ({
						key: c.name,
						label: (
							<span className="grid gap-0.5">
								<span className="font-medium">
									{c.name}
									{c.domain ? (
										<span className="ml-1.5 font-normal text-muted-foreground text-xs">
											{c.domain}
										</span>
									) : null}
								</span>
								<span className="text-muted-foreground text-xs">{c.reason}</span>
							</span>
						),
						competitor: { name: c.name, domain: c.domain ?? undefined },
					}))}
					onDone={() => onOpenTab("competitors")}
					doneLabel="Open competitors"
				/>
			</div>

			<InsightPicker
				runId={run.id}
				kind="keywords"
				layout="chips"
				title="Keywords worth ranking for"
				description="Add them to your keyword list to see search volume and track where you rank."
				actionLabel="Add to keywords"
				editable={editor}
				items={insights.keywords.map((k) => ({ key: k, label: k }))}
				onDone={() => onOpenTab("keywords")}
				doneLabel="Open keywords"
			/>

			{insights.contentGaps.length ? (
				<Card>
					<CardHeader>
						<CardTitle>Content gaps</CardTitle>
						<CardDescription>
							Topics your audience cares about that your website doesn't cover well yet.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ul className="grid gap-3 md:grid-cols-2">
							{insights.contentGaps.map((g) => (
								<li key={g.topic} className="flex gap-3">
									<Lightbulb className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
									<span className="grid gap-0.5">
										<span className="font-medium text-sm">{g.topic}</span>
										<span className="text-muted-foreground text-sm">{g.why}</span>
									</span>
								</li>
							))}
						</ul>
					</CardContent>
				</Card>
			) : null}

			{insights.contentIdeas.length ? (
				<section aria-labelledby="ideas-heading" className="grid gap-3">
					<div className="grid gap-0.5">
						<h2 id="ideas-heading" className="font-semibold text-[15px] tracking-tight">
							Content ideas
						</h2>
						<p className="text-muted-foreground text-sm">
							Pick one to start drafting — you'll review everything before it's posted.
						</p>
					</div>
					<ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
						{insights.contentIdeas.map((idea) => (
							<IdeaCard key={idea.title} idea={idea} editable={editor} />
						))}
					</ul>
				</section>
			) : null}

			<PagesCrawled run={run} />
		</div>
	);
}

const FORMAT: Record<
	ContentIdea["format"],
	{ label: string; icon: typeof FileText; tone: BadgeTone }
> = {
	post: { label: "Post", icon: PenSquare, tone: "primary" },
	article: { label: "Article", icon: FileText, tone: "info" },
	carousel: { label: "Carousel", icon: GalleryHorizontal, tone: "violet" },
	video: { label: "Video", icon: Clapperboard, tone: "warning" },
};

/**
 * Where "Create" goes: posts and articles open the composer with the AI assist
 * pre-filled; carousels and videos open the matching Create studio with the topic.
 */
export function ideaHref(idea: ContentIdea) {
	if (idea.format === "carousel" || idea.format === "video") {
		const q = new URLSearchParams({ tab: idea.format, topic: `${idea.title}. ${idea.angle}` });
		return `/create?${q}`;
	}
	const brief =
		idea.format === "article"
			? `${idea.title}\n\nAngle: ${idea.angle}\n\nWrite it as a long-form, article-style post.`
			: `${idea.title}\n\nAngle: ${idea.angle}`;
	const q = new URLSearchParams({ brief });
	if (idea.platforms.length) q.set("platforms", idea.platforms.join(","));
	return `/compose?${q}`;
}

function IdeaCard({ idea, editable }: { idea: ContentIdea; editable: boolean }) {
	const f = FORMAT[idea.format];
	const Icon = f.icon;
	return (
		<li className="flex flex-col gap-3 rounded-lg border border-border bg-surface-raised p-4 shadow-xs">
			<div className="flex items-center justify-between gap-2">
				<Badge tone={f.tone}>
					<Icon aria-hidden="true" />
					{f.label}
				</Badge>
				{idea.platforms.length ? (
					<span className="flex items-center gap-1">
						{idea.platforms.map((p) => (
							<span key={p} title={providerName(p)}>
								<ProviderIcon provider={p} size="xs" />
								<span className="sr-only">{providerName(p)}</span>
							</span>
						))}
					</span>
				) : null}
			</div>
			<div className="grid flex-1 content-start gap-1">
				<p className="font-medium text-sm">{idea.title}</p>
				<p className="text-muted-foreground text-sm">{idea.angle}</p>
			</div>
			{editable ? (
				<Button asChild variant="outline" size="sm" className="justify-self-start">
					<Link href={ideaHref(idea)}>
						<Icon />
						Create
						<span className="sr-only">: {idea.title}</span>
					</Link>
				</Button>
			) : null}
		</li>
	);
}

function PagesCrawled({ run }: { run: ResearchRun }) {
	const [open, setOpen] = useState(false);
	const pages = useRunPages(run.id, open);
	const items = pages.data?.pages.flatMap((p) => p.items) ?? [];
	return (
		<details
			className="group rounded-lg border border-border bg-surface-raised shadow-xs"
			onToggle={(e) => setOpen(e.currentTarget.open)}
		>
			<summary className="flex cursor-pointer select-none items-center justify-between gap-3 rounded-lg px-5 py-3.5 font-medium text-sm focus-visible:outline-2 focus-visible:outline-ring">
				<span>
					Pages we read{" "}
					<span className="font-normal text-muted-foreground">
						({formatNumber(run.pagesCrawled)})
					</span>
				</span>
				<span className="text-muted-foreground text-xs group-open:hidden">Show</span>
				<span className="hidden text-muted-foreground text-xs group-open:inline">Hide</span>
			</summary>
			<div className="border-border border-t">
				{pages.isPending ? (
					<div className="p-4">
						<Skeleton className="h-24" />
					</div>
				) : pages.isError ? (
					<div className="p-4">
						<LoadError
							compact
							title="Couldn't load the pages"
							error={pages.error}
							onRetry={() => void pages.refetch()}
						/>
					</div>
				) : items.length === 0 ? (
					<p className="p-5 text-muted-foreground text-sm">No pages were read in this run.</p>
				) : (
					<>
						<ul className="divide-y divide-border">
							{items.map((p) => (
								<li key={p.id} className="grid gap-0.5 px-5 py-2.5">
									<div className="flex items-center gap-2">
										<a
											href={p.url}
											target="_blank"
											rel="noreferrer noopener"
											className="truncate font-medium text-sm hover:underline"
										>
											{p.title || p.url}
										</a>
										{p.statusCode !== null && p.statusCode >= 400 ? (
											<Badge tone="danger">HTTP {p.statusCode}</Badge>
										) : null}
									</div>
									<p className="truncate text-muted-foreground text-xs">
										{p.url}
										{p.wordCount ? ` · ${formatNumber(p.wordCount)} words` : ""}
									</p>
									{p.description ? (
										<p className="line-clamp-2 text-subtle-foreground text-xs">{p.description}</p>
									) : null}
								</li>
							))}
						</ul>
						{pages.hasNextPage ? (
							<div className="border-border border-t p-3 text-center">
								<Button
									variant="ghost"
									size="sm"
									loading={pages.isFetchingNextPage}
									onClick={() => void pages.fetchNextPage()}
								>
									Show more pages
								</Button>
							</div>
						) : null}
					</>
				)}
			</div>
		</details>
	);
}

// ── History ──────────────────────────────────────────────────────────────────

const STATUS: Record<ResearchRunStatus, { label: string; tone: BadgeTone }> = {
	pending: { label: "Queued", tone: "neutral" },
	crawling: { label: "Reading", tone: "info" },
	analyzing: { label: "Analyzing", tone: "info" },
	succeeded: { label: "Done", tone: "success" },
	failed: { label: "Failed", tone: "danger" },
};

function RunHistory({
	runs,
	currentId,
	onPick,
}: {
	runs: ResearchRun[];
	currentId: string | null;
	onPick: (id: string) => void;
}) {
	const { org } = useOrg();
	if (runs.length < 2) return null;
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<History className="size-4 text-muted-foreground" aria-hidden="true" />
					Earlier runs
				</CardTitle>
			</CardHeader>
			<ul className="mt-3 divide-y divide-border border-border border-t">
				{runs.map((r) => {
					const s = STATUS[r.status];
					const current = r.id === currentId;
					const cost = r.costUsd === null ? null : Number(r.costUsd);
					return (
						<li key={r.id}>
							<button
								type="button"
								onClick={() => onPick(r.id)}
								aria-current={current ? "true" : undefined}
								className={cn(
									"flex w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-left text-sm hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2",
									current && "bg-muted/60",
								)}
							>
								<span className="min-w-0 flex-1 truncate font-medium">{hostOf(r.startUrl)}</span>
								<Badge tone={s.tone} dot>
									{s.label}
								</Badge>
								<span className="text-muted-foreground text-xs tabular-nums">
									{pluralize(r.pagesCrawled, "page")}
									{cost !== null && Number.isFinite(cost) ? ` · ${formatUsd(cost)}` : ""}
								</span>
								<span
									className="w-28 text-right text-muted-foreground text-xs"
									title={formatDateTime(r.createdAt, org.timezone)}
								>
									{formatRelative(r.createdAt)}
								</span>
							</button>
						</li>
					);
				})}
			</ul>
		</Card>
	);
}
