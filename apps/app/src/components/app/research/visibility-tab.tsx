"use client";

import { Button } from "@socialfly/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@socialfly/ui/components/card";
import { Alert, EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import { cn } from "@socialfly/ui/utils";
import { Bot, Eye, Info, Play } from "lucide-react";
import { useMemo } from "react";
import {
	useResearchCapabilities,
	useRunVisibilityCheck,
	useVisibilityPrompts,
	useVisibilitySummary,
} from "@/hooks/use-research";
import type { VisibilitySummary } from "@/lib/api-types";
import { formatDateTime, formatPercent, formatRelative, UNKNOWN } from "@/lib/format";
import { useOrg } from "../org-provider";
import { ENGINES, LoadError, StatTile, StatTilesSkeleton } from "./research-shared";
import { EngineTable, MentionTrendChart, ShareOfVoiceChart } from "./visibility-charts";
import { PromptsCard } from "./visibility-prompts";

const PERIODS = [30, 90] as const;

export function VisibilityTab({ days, onDays }: { days: number; onDays: (d: number) => void }) {
	const { org, can } = useOrg();
	const caps = useResearchCapabilities();
	const summary = useVisibilitySummary(days);
	const prompts = useVisibilityPrompts();
	const run = useRunVisibilityCheck();

	const engines = caps.data?.visibilityEngines ?? [];
	const activePrompts = prompts.data?.items.filter((p) => p.active).length ?? 0;
	const lastCheckedAt = summary.data?.lastCheckedAt ?? null;

	return (
		<div className="grid gap-6">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="grid max-w-2xl gap-2">
					<p className="text-muted-foreground text-sm">
						We ask AI assistants the questions your buyers ask and measure how often they mention
						you, where you rank among the brands they name, and whether they cite your website.
					</p>
					{caps.isSuccess && engines.length ? (
						<ul className="flex flex-wrap items-center gap-1.5" aria-label="Engines checked">
							{engines.map((e) => (
								<li
									key={e.id}
									className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-raised px-2.5 py-0.5 text-xs"
								>
									<Bot className="size-3 text-muted-foreground" aria-hidden="true" />
									<span className="font-medium">{ENGINES[e.id]?.name ?? e.id}</span>
									<span className="text-muted-foreground">{e.model}</span>
								</li>
							))}
						</ul>
					) : null}
				</div>
				<div className="grid justify-items-end gap-1.5">
					<div className="flex flex-wrap items-center gap-2">
						<fieldset className="flex rounded-md border border-border p-0.5">
							<legend className="sr-only">Period</legend>
							{PERIODS.map((p) => (
								<button
									key={p}
									type="button"
									aria-pressed={days === p}
									onClick={() => onDays(p)}
									className={cn(
										"cursor-pointer rounded-sm px-2.5 py-1 font-medium text-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring",
										days === p
											? "bg-muted text-foreground"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									{p} days
								</button>
							))}
						</fieldset>
						{can("editor") ? (
							<Button
								size="sm"
								loading={run.isPending}
								disabled={!engines.length || activePrompts === 0}
								onClick={() => run.mutate()}
							>
								{run.isPending ? null : <Play />}
								Run check now
							</Button>
						) : null}
					</div>
					<p className="text-right text-subtle-foreground text-xs">
						{lastCheckedAt ? (
							<span title={formatDateTime(lastCheckedAt, org.timezone)}>
								Last checked {formatRelative(lastCheckedAt)}.{" "}
							</span>
						) : null}
						{can("editor")
							? "Runs in the background and uses your AI budget."
							: "Checks run automatically."}
					</p>
				</div>
			</div>

			{caps.isSuccess && engines.length === 0 ? <NoEngines /> : null}

			<Overview
				summary={summary}
				hasPrompts={(prompts.data?.items.length ?? 0) > 0}
				models={new Map(engines.map((e) => [e.id, e.model]))}
				days={days}
			/>

			<PromptsCard prompts={prompts} />
		</div>
	);
}

function NoEngines() {
	return (
		<Alert tone="info" icon={Info} title="No AI engines are configured">
			Each engine is turned on by an API key on the server:{" "}
			{Object.values(ENGINES).map((e, i, all) => (
				<span key={e.envVar}>
					{e.name} with <code>{e.envVar}</code>
					{i < all.length - 1 ? ", " : "."}
				</span>
			))}{" "}
			Ask whoever runs SocialFly to add at least one.
		</Alert>
	);
}

function Overview({
	summary,
	hasPrompts,
	models,
	days,
}: {
	summary: ReturnType<typeof useVisibilitySummary>;
	hasPrompts: boolean;
	models: Map<string, string>;
	days: number;
}) {
	if (summary.isPending) {
		return (
			<div className="grid gap-6" aria-busy="true">
				<StatTilesSkeleton />
				<div className="grid gap-6 xl:grid-cols-2">
					<Skeleton className="h-72" />
					<Skeleton className="h-72" />
				</div>
			</div>
		);
	}
	if (summary.isError) {
		return (
			<LoadError
				title="Couldn't load AI visibility"
				error={summary.error}
				onRetry={() => void summary.refetch()}
			/>
		);
	}
	const data = summary.data;
	if (data.overall.checks === 0) {
		return (
			<EmptyState
				icon={Eye}
				title={hasPrompts ? `No checks in the last ${days} days` : "Add a question to start"}
				description={
					hasPrompts
						? "Checks run automatically a few times a week. Run one now to see results in a few minutes."
						: "Add the questions your buyers ask below — or pick them from your brand research — and we'll start asking AI assistants."
				}
			/>
		);
	}
	return (
		<div className="grid gap-6" aria-busy={summary.isFetching || undefined}>
			<Kpis data={data} />
			<div className="grid items-start gap-6 xl:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Share of voice</CardTitle>
						<p className="text-muted-foreground text-xs">
							Of all the brand mentions in AI answers, how many were you.
						</p>
					</CardHeader>
					<CardContent>
						{data.shareOfVoice.length ? (
							<ShareOfVoiceChart rows={data.shareOfVoice} />
						) : (
							<p className="text-muted-foreground text-sm">
								No brands were mentioned yet. Add competitors to compare against them.
							</p>
						)}
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Mention rate by week</CardTitle>
						<p className="text-muted-foreground text-xs">
							The share of answers that named you, week by week.
						</p>
					</CardHeader>
					<CardContent>
						<MentionTrendChart weeks={data.trend} />
					</CardContent>
				</Card>
			</div>
			{data.byEngine.length ? (
				<Card>
					<CardHeader>
						<CardTitle>By engine</CardTitle>
					</CardHeader>
					<div className="mt-3">
						<EngineTable rows={data.byEngine} models={models} />
					</div>
				</Card>
			) : null}
		</div>
	);
}

function Kpis({ data }: { data: VisibilitySummary }) {
	const o = data.overall;
	const positive = useMemo(() => {
		// Works whether the API sends counts or fractions: it's a share of the three.
		const total = o.sentiment.positive + o.sentiment.neutral + o.sentiment.negative;
		return total > 0 ? o.sentiment.positive / total : null;
	}, [o.sentiment]);
	return (
		<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
			<StatTile
				label="Mention rate"
				value={formatPercent(o.mentionRate)}
				hint={`Of ${o.checks} answers checked`}
			/>
			<StatTile
				label="Average rank"
				value={o.avgRank === null ? UNKNOWN : `#${o.avgRank.toFixed(1)}`}
				hint={
					o.avgRank === null ? "Not ranked in any answer yet" : "Among brands named, when mentioned"
				}
			/>
			<StatTile
				label="Positive tone"
				value={formatPercent(positive)}
				hint={positive === null ? "No mentions to judge yet" : "Of answers that mention you"}
			/>
			<StatTile
				label="Cites your site"
				value={formatPercent(o.ownCitationRate)}
				hint="Answers linking to your website"
			/>
		</div>
	);
}
