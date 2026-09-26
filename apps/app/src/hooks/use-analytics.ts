"use client";

import { toast } from "@socialfly/ui/components/toast";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrg } from "@/components/app/org-provider";
import { api, call } from "@/lib/api-client";
import type { AnalyticsOverviewQuery, AnalyticsPostsQuery } from "@/lib/api-types";
import { errorMessage, isApiError } from "@/lib/errors";
import { qk } from "@/lib/query-keys";

// Metrics are collected in the background every few hours, so there is nothing to
// gain from refetching on every focus; a few minutes of staleness is honest.
const STALE = 5 * 60_000;

export function useAnalyticsOverview(query: AnalyticsOverviewQuery, enabled = true) {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.analyticsOverview(orgId, query),
		queryFn: () => call(api.analytics.overview.$get({ query })),
		staleTime: STALE,
		enabled,
		// Keep the previous range on screen while a new one loads instead of flashing skeletons.
		placeholderData: (prev) => prev,
	});
}

const PAGE = 25;

export function useAnalyticsPosts(query: Omit<AnalyticsPostsQuery, "before" | "limit">) {
	const { orgId } = useOrg();
	return useInfiniteQuery({
		queryKey: qk.analyticsPosts(orgId, query),
		queryFn: ({ pageParam }) =>
			call(
				api.analytics.posts.$get({
					query: { ...query, before: pageParam ?? undefined, limit: String(PAGE) },
				}),
			),
		initialPageParam: null as string | null,
		// The API only pages the date sort; ranked sorts return one top-N page.
		getNextPageParam: (last) => last.nextCursor ?? undefined,
		staleTime: STALE,
	});
}

export function usePostAnalytics(postId: string, enabled: boolean) {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.analyticsPost(orgId, postId),
		queryFn: () => call(api.analytics.posts[":postId"].$get({ param: { postId } })),
		staleTime: STALE,
		enabled,
	});
}

/** One channel's account numbers (followers, reach, ...) per day over a range. */
export function useChannelAnalytics(channelId: string | null, range: { from: string; to: string }) {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.analyticsChannel(orgId, channelId ?? "", range.from, range.to),
		queryFn: () =>
			call(
				api.analytics.channels[":channelId"].$get({
					param: { channelId: channelId ?? "" },
					query: { from: range.from, to: range.to },
				}),
			),
		enabled: channelId !== null,
		staleTime: STALE,
	});
}

export function useBestTimes(channelIds: string) {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.bestTimes(orgId, channelIds),
		queryFn: () =>
			call(
				api.analytics["best-times"].$get({
					query: { channelIds: channelIds || undefined, weeks: "12" },
				}),
			),
		// Twelve weeks of history barely moves within a session.
		staleTime: 30 * 60_000,
	});
}

function retryAfter(error: unknown): number | null {
	if (!isApiError(error) || error.status !== 429) return null;
	const seconds = Number(error.details?.retryAfterSeconds);
	return Number.isFinite(seconds) && seconds > 0 ? seconds : 60;
}

export function useRefreshAnalytics() {
	const { orgId } = useOrg();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => call(api.analytics.refresh.$post()),
		onSuccess: () => {
			toast.success("Collecting fresh numbers. They usually land within a few minutes.");
			// The collector runs asynchronously; look again once it has had a moment.
			setTimeout(
				() => void queryClient.invalidateQueries({ queryKey: qk.analyticsAll(orgId) }),
				30_000,
			);
		},
		onError: (e) => {
			const wait = retryAfter(e);
			if (wait !== null) {
				const minutes = Math.ceil(wait / 60);
				toast.error(
					`Numbers were refreshed recently. Try again in ${minutes === 1 ? "a minute" : `${minutes} minutes`}.`,
				);
			} else {
				toast.error(errorMessage(e));
			}
		},
	});
}
