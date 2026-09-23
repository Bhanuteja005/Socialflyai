"use client";

import { toast } from "@socialfly/ui/components/toast";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrg } from "@/components/app/org-provider";
import { api, call, callVoid } from "@/lib/api-client";
import type {
	AdCampaignDetail,
	AdCampaignsQuery,
	AdCopyInput,
	CreateCampaignInput,
	TargetingType,
	UpdateCampaignInput,
} from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { qk } from "@/lib/query-keys";

export function useAdsProviders() {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.adsProviders(orgId),
		queryFn: () => call(api.ads.providers.$get()),
		staleTime: 10 * 60_000,
	});
}

export function useAdAccounts(enabled = true) {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.adAccounts(orgId),
		queryFn: () => call(api.ads.accounts.$get()),
		enabled,
	});
}

export function usePendingAdAccounts(key: string, enabled: boolean) {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.adPending(orgId, key),
		queryFn: () => call(api.ads.pending[":key"].$get({ param: { key } })),
		enabled,
		retry: false,
		staleTime: Number.POSITIVE_INFINITY,
	});
}

export function useAdIdentities(accountId: string, enabled = true) {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.adIdentities(orgId, accountId),
		queryFn: () => call(api.ads.accounts[":id"].identities.$get({ param: { id: accountId } })),
		enabled,
		staleTime: 5 * 60_000,
	});
}

export function useAdTargetingSearch(accountId: string, type: TargetingType, q: string) {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.adTargeting(orgId, accountId, type, q),
		queryFn: () =>
			call(
				api.ads.accounts[":id"].targeting.$get({ param: { id: accountId }, query: { type, q } }),
			),
		enabled: Boolean(accountId) && q.trim().length >= 2,
		staleTime: 10 * 60_000,
		placeholderData: (prev) => prev,
	});
}

const PAGE = 25;

export function useAdCampaigns(query: Omit<AdCampaignsQuery, "before" | "limit"> = {}) {
	const { orgId } = useOrg();
	return useInfiniteQuery({
		queryKey: qk.adCampaigns(orgId, query),
		queryFn: ({ pageParam }) =>
			call(
				api.ads.campaigns.$get({
					query: { ...query, before: pageParam ?? undefined, limit: String(PAGE) },
				}),
			),
		initialPageParam: null as string | null,
		getNextPageParam: (last) => last.nextCursor,
		// Creation and activation happen in the worker; keep in-flight rows current.
		refetchInterval: (q) =>
			q.state.data?.pages.some((p) =>
				p.items.some((c) => c.status === "creating" || c.status === "approved"),
			)
				? 5_000
				: false,
	});
}

export function useAdCampaign(id: string) {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.adCampaign(orgId, id),
		queryFn: () => call(api.ads.campaigns[":id"].$get({ param: { id } })),
		enabled: Boolean(id),
		refetchInterval: (q) =>
			q.state.data?.status === "creating" || q.state.data?.status === "approved" ? 4_000 : false,
	});
}

export function useAdsSettings(enabled = true) {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.adsSettings(orgId),
		queryFn: () => call(api.ads.settings.$get()),
		enabled,
	});
}

export function useAdsOverview(from: string, to: string) {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.adsOverview(orgId, from, to),
		queryFn: () => call(api.ads.overview.$get({ query: { from, to } })),
		staleTime: 5 * 60_000,
		placeholderData: (prev) => prev,
	});
}

// ── Mutations ────────────────────────────────────────────────────────────────

/** Starts OAuth for an ad platform and sends the browser to its consent screen. */
export function useConnectAdAccount() {
	return useMutation({
		mutationFn: (provider: string) =>
			call(api.ads.connect[":provider"].$post({ param: { provider } })),
		onSuccess: ({ url }) => window.location.assign(url),
		onError: (error) => toast.error(errorMessage(error, "Couldn't start the connection")),
	});
}

export function useInvalidateAds() {
	const { orgId } = useOrg();
	const queryClient = useQueryClient();
	return () => queryClient.invalidateQueries({ queryKey: qk.adsAll(orgId) });
}

export function useAdCopy() {
	return useMutation({
		mutationFn: (input: AdCopyInput) => call(api.ads.copy.$post({ json: input })),
	});
}

export function useSaveCampaign() {
	const { orgId } = useOrg();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (v: { id?: string; input: CreateCampaignInput }) => {
			if (!v.id) return call(api.ads.campaigns.$post({ json: v.input }));
			const { adAccountId: _account, ...rest } = v.input;
			const patch: UpdateCampaignInput = rest;
			return call(api.ads.campaigns[":id"].$patch({ param: { id: v.id }, json: patch }));
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: qk.adCampaignsAll(orgId) });
		},
	});
}

type CampaignAction =
	| { type: "approve" }
	| { type: "reject"; reason: string }
	| { type: "activate"; confirmBudget: number }
	| { type: "pause" }
	| { type: "archive" }
	| { type: "retry"; confirmNotCreated?: boolean };

const ACTION_DONE: Record<CampaignAction["type"], string> = {
	approve: "Approved — creating it on the platform, paused",
	reject: "Sent back to the author",
	activate: "Activation requested — it starts spending once the platform confirms",
	pause: "Pause requested",
	archive: "Campaign archived",
	retry: "Retrying — we'll update the status shortly",
};

/** Lifecycle actions on one campaign; each returns the updated campaign. */
export function useCampaignAction(id: string) {
	const { orgId } = useOrg();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (a: CampaignAction) => {
			const c = api.ads.campaigns[":id"];
			const param = { id };
			switch (a.type) {
				case "approve":
					return call(c.approve.$post({ param }));
				case "reject":
					return call(c.reject.$post({ param, json: { reason: a.reason } }));
				case "activate":
					return call(c.activate.$post({ param, json: { confirmBudget: a.confirmBudget } }));
				case "pause":
					return call(c.pause.$post({ param }));
				case "archive":
					return call(c.archive.$post({ param }));
				case "retry":
					return call(
						c.retry.$post({ param, json: { confirmNotCreated: a.confirmNotCreated ?? false } }),
					);
			}
		},
		onSuccess: (updated, a) => {
			queryClient.setQueryData<AdCampaignDetail>(qk.adCampaign(orgId, id), (prev) =>
				prev ? { ...prev, ...updated } : prev,
			);
			void queryClient.invalidateQueries({ queryKey: qk.adsAll(orgId) });
			toast.success(ACTION_DONE[a.type]);
		},
	});
}

export function useDeleteCampaign() {
	const { orgId } = useOrg();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => callVoid(api.ads.campaigns[":id"].$delete({ param: { id } })),
		onSuccess: (_, id) => {
			queryClient.removeQueries({ queryKey: qk.adCampaign(orgId, id) });
			void queryClient.invalidateQueries({ queryKey: qk.adCampaignsAll(orgId) });
			toast.success("Campaign deleted");
		},
		onError: (e) => toast.error(errorMessage(e)),
	});
}
