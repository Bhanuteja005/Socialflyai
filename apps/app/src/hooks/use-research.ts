"use client";

import { toast } from "@socialfly/ui/components/toast";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useOrg } from "@/components/app/org-provider";
import { api, call, callVoid } from "@/lib/api-client";
import type {
	ApplyInsightsInput,
	CompetitorInput,
	CompetitorUpdate,
	ResearchRun,
	ResearchRunStatus,
} from "@/lib/api-types";
import { errorMessage, isApiError } from "@/lib/errors";
import { pluralize } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import { useAfterAiCall } from "./use-ai";

/** A run the worker is still on: poll it. */
export const isRunActive = (status: ResearchRunStatus | undefined) =>
	status === "pending" || status === "crawling" || status === "analyzing";

const RUN_POLL_MS = 3_000;

export function useResearchCapabilities() {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.researchCapabilities(orgId),
		queryFn: () => call(api.research.capabilities.$get()),
		// Server configuration: changes on a deploy, not during a session.
		staleTime: 10 * 60_000,
	});
}

// ── Brand research runs ─────────────────────────────────────────────────────

/** The brief to show: the latest successful run, else the latest run (null when none). */
export function useLatestRun() {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.researchLatestRun(orgId),
		queryFn: () => call(api.research.runs.latest.$get()),
	});
}

const RUNS_LIMIT = 10;

export function useResearchRuns() {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.researchRunsList(orgId, RUNS_LIMIT),
		queryFn: () => call(api.research.runs.$get({ query: { limit: String(RUNS_LIMIT) } })),
	});
}

/** One run by id, polled every 3 s while the worker is on it. */
export function useResearchRun(id: string | null) {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.researchRun(orgId, id ?? ""),
		queryFn: () => call(api.research.runs[":id"].$get({ param: { id: id ?? "" } })),
		enabled: Boolean(id),
		refetchInterval: (q) => (isRunActive(q.state.data?.status) ? RUN_POLL_MS : false),
	});
}

/**
 * The run in progress, if any. `/runs/latest` prefers the last *successful* run (so the
 * brief stays on screen during a re-run), so progress is followed through the newest
 * entry of the history instead. When it settles, the brief, history and budget refresh.
 */
export function useActiveRun() {
	const { orgId } = useOrg();
	const queryClient = useQueryClient();
	const afterAiCall = useAfterAiCall();
	const runs = useResearchRuns();
	const newest = runs.data?.items[0];
	const run = useResearchRun(newest && isRunActive(newest.status) ? newest.id : null);
	const status = run.data?.status;

	useEffect(() => {
		if (status !== "succeeded" && status !== "failed") return;
		void queryClient.invalidateQueries({ queryKey: qk.researchRuns(orgId) });
		afterAiCall();
	}, [status, queryClient, orgId, afterAiCall]);

	return { runs, active: run.data && isRunActive(run.data.status) ? run.data : null };
}

const PAGES = 20;

export function useRunPages(runId: string, enabled: boolean) {
	const { orgId } = useOrg();
	return useInfiniteQuery({
		queryKey: qk.researchPages(orgId, runId),
		queryFn: ({ pageParam }) =>
			call(
				api.research.runs[":id"].pages.$get({
					param: { id: runId },
					query: { before: pageParam ?? undefined, limit: String(PAGES) },
				}),
			),
		initialPageParam: null as string | null,
		getNextPageParam: (last) => last.nextCursor ?? undefined,
		enabled,
	});
}

export function useStartResearch() {
	const { orgId } = useOrg();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (url?: string) => call(api.research.runs.$post({ json: { url } })),
		onSuccess: (run: ResearchRun) => {
			// Seed the poll and the history with the 202 body so progress shows immediately.
			queryClient.setQueryData(qk.researchRun(orgId, run.id), run);
			queryClient.setQueryData<{ items: ResearchRun[] }>(
				qk.researchRunsList(orgId, RUNS_LIMIT),
				(old) => (old ? { items: [run, ...old.items.filter((r) => r.id !== run.id)] } : old),
			);
		},
		onError: (e) => {
			// Someone else started one meanwhile: pick theirs up instead.
			if (isApiError(e) && e.code === "research_in_progress")
				void queryClient.invalidateQueries({ queryKey: qk.researchRuns(orgId) });
		},
	});
}

export function useApplyInsights() {
	const { orgId } = useOrg();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: ApplyInsightsInput) =>
			call(api.research.insights.apply.$post({ json: input })),
		onSuccess: (r) => {
			const parts = [
				r.promptsAdded ? pluralize(r.promptsAdded, "prompt") : null,
				r.competitorsAdded ? pluralize(r.competitorsAdded, "competitor") : null,
				r.keywordsAdded ? pluralize(r.keywordsAdded, "keyword") : null,
			].filter(Boolean);
			toast.success(
				parts.length
					? `Added ${parts.join(", ")}.`
					: "Nothing new to add — they're already in your lists.",
			);
			void queryClient.invalidateQueries({ queryKey: qk.competitors(orgId) });
			void queryClient.invalidateQueries({ queryKey: qk.keywords(orgId) });
			void queryClient.invalidateQueries({ queryKey: qk.visibilityPrompts(orgId) });
		},
		onError: (e) => toast.error(errorMessage(e)),
	});
}

// ── Competitors ─────────────────────────────────────────────────────────────

export function useCompetitors() {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.competitors(orgId),
		queryFn: () => call(api.research.competitors.$get()),
	});
}

/** Create, update and delete share one invalidation; share of voice depends on the list too. */
export function useCompetitorMutations() {
	const { orgId } = useOrg();
	const queryClient = useQueryClient();
	const onSuccess = () => {
		void queryClient.invalidateQueries({ queryKey: qk.competitors(orgId) });
		void queryClient.invalidateQueries({ queryKey: qk.visibilityAll(orgId) });
	};
	const create = useMutation({
		mutationFn: (input: CompetitorInput) =>
			callVoid(api.research.competitors.$post({ json: input })),
		onSuccess,
	});
	const update = useMutation({
		mutationFn: ({ id, ...json }: CompetitorUpdate & { id: string }) =>
			callVoid(api.research.competitors[":id"].$patch({ param: { id }, json })),
		onSuccess,
	});
	const remove = useMutation({
		mutationFn: (id: string) =>
			callVoid(api.research.competitors[":id"].$delete({ param: { id } })),
		onSuccess,
		onError: (e) => toast.error(errorMessage(e)),
	});
	return { create, update, remove };
}

// ── Keywords ────────────────────────────────────────────────────────────────

export function useKeywords() {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.keywords(orgId),
		queryFn: () => call(api.research.keywords.$get()),
	});
}

export function useKeywordMutations() {
	const { orgId } = useOrg();
	const queryClient = useQueryClient();
	const onSuccess = () => void queryClient.invalidateQueries({ queryKey: qk.keywords(orgId) });
	const add = useMutation({
		mutationFn: (keywords: string[]) =>
			call(api.research.keywords.$post({ json: { keywords, tracked: true } })),
		onSuccess: (r) => {
			toast.success(
				r.added
					? `Added ${pluralize(r.added, "keyword")}.`
					: "Those keywords are already on your list.",
			);
			onSuccess();
		},
	});
	const setTracked = useMutation({
		mutationFn: ({ id, tracked }: { id: string; tracked: boolean }) =>
			callVoid(api.research.keywords[":id"].$patch({ param: { id }, json: { tracked } })),
		onSuccess,
		onError: (e) => toast.error(errorMessage(e)),
	});
	const remove = useMutation({
		mutationFn: (id: string) => callVoid(api.research.keywords[":id"].$delete({ param: { id } })),
		onSuccess,
		onError: (e) => toast.error(errorMessage(e)),
	});
	return { add, setTracked, remove };
}

export function useKeywordRankings(id: string | null, days = 90) {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.keywordRankings(orgId, id ?? "", days),
		queryFn: () =>
			call(
				api.research.keywords[":id"].rankings.$get({
					param: { id: id ?? "" },
					query: { days: String(days) },
				}),
			),
		enabled: Boolean(id),
		staleTime: 30 * 60_000,
	});
}

export function useKeywordIdeas() {
	return useMutation({
		mutationFn: (seeds: string[]) =>
			call(api.research.keywords.ideas.$post({ json: { seeds, limit: 50 } })),
	});
}

// ── AI visibility ───────────────────────────────────────────────────────────

export const MAX_PROMPTS = 25;

export function useVisibilityPrompts() {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.visibilityPrompts(orgId),
		queryFn: () => call(api.research.visibility.prompts.$get()),
	});
}

export function usePromptMutations() {
	const { orgId } = useOrg();
	const queryClient = useQueryClient();
	const onSuccess = () => void queryClient.invalidateQueries({ queryKey: qk.visibilityAll(orgId) });
	const create = useMutation({
		mutationFn: (prompt: string) =>
			callVoid(api.research.visibility.prompts.$post({ json: { prompt } })),
		onSuccess,
	});
	const update = useMutation({
		mutationFn: ({ id, ...json }: { id: string; prompt?: string; active?: boolean }) =>
			callVoid(api.research.visibility.prompts[":id"].$patch({ param: { id }, json })),
		onSuccess,
		onError: (e) => toast.error(errorMessage(e)),
	});
	const remove = useMutation({
		mutationFn: (id: string) =>
			callVoid(api.research.visibility.prompts[":id"].$delete({ param: { id } })),
		onSuccess,
		onError: (e) => toast.error(errorMessage(e)),
	});
	return { create, update, remove };
}

// Checks run a few times a week in the background; minutes of staleness are honest.
const VISIBILITY_STALE = 5 * 60_000;

export function useVisibilitySummary(days: number) {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.visibilitySummary(orgId, days),
		queryFn: () => call(api.research.visibility.summary.$get({ query: { days: String(days) } })),
		staleTime: VISIBILITY_STALE,
		placeholderData: (prev) => prev,
	});
}

export function usePromptChecks(promptId: string, enabled: boolean) {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.promptChecks(orgId, promptId),
		queryFn: () =>
			call(
				api.research.visibility.prompts[":id"].checks.$get({
					param: { id: promptId },
					query: { limit: "12" },
				}),
			),
		enabled,
		staleTime: VISIBILITY_STALE,
	});
}

export function useVisibilityCheck(id: string | null) {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.visibilityCheck(orgId, id ?? ""),
		queryFn: () => call(api.research.visibility.checks[":id"].$get({ param: { id: id ?? "" } })),
		enabled: Boolean(id),
		staleTime: Number.POSITIVE_INFINITY,
	});
}

/** Seconds until the next manual run is allowed, from a 429's details. */
export function retryAfterSeconds(error: unknown): number | null {
	if (!isApiError(error) || error.status !== 429 || error.code === "ai_budget_exceeded")
		return null;
	const seconds = Number(error.details?.retryAfterSeconds);
	return Number.isFinite(seconds) && seconds > 0 ? seconds : 60;
}

export function useRunVisibilityCheck() {
	const { orgId } = useOrg();
	const queryClient = useQueryClient();
	const afterAiCall = useAfterAiCall();
	return useMutation({
		mutationFn: () => call(api.research.visibility.run.$post()),
		onSuccess: (r) => {
			if (r.queued)
				toast.success(
					"Asking the AI engines your questions in the background. Results appear here in a few minutes.",
				);
			// The checks run asynchronously; look again once they have had time to land.
			setTimeout(() => {
				void queryClient.invalidateQueries({ queryKey: qk.visibilityAll(orgId) });
				afterAiCall();
			}, 90_000);
		},
		onError: (e) => {
			const wait = retryAfterSeconds(e);
			if (wait !== null) {
				const minutes = Math.ceil(wait / 60);
				toast.error(
					`Checks ran recently. The next run is available in ${minutes === 1 ? "a minute" : `${minutes} min`}.`,
				);
			} else {
				toast.error(errorMessage(e));
			}
		},
	});
}
