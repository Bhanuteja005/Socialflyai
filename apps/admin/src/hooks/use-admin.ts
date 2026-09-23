"use client";

import { toast } from "@socialfly/ui/components/toast";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, call } from "@/lib/api-client";
import type {
	AdminTargetStatus,
	AdminUser,
	GenerationKind,
	GenerationStatus,
	OrgDetail,
	UserStatus,
} from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { qk } from "@/lib/query-keys";

const PAGE_SIZE = "25";

/** Keyset pagination: `before` is the previous page's `nextCursor`; null ends the list. */
const pages = {
	initialPageParam: undefined as string | undefined,
	getNextPageParam: (last: { nextCursor: string | null }) => last.nextCursor ?? undefined,
};

/** Gates the console: 404 means "not a platform admin". Only runs once there is a session. */
export function useAdminMe(enabled = true) {
	return useQuery({
		queryKey: qk.me,
		enabled,
		queryFn: () => call(adminApi.me.$get()),
		staleTime: 5 * 60_000,
	});
}

export function useOverview() {
	return useQuery({
		queryKey: qk.overview,
		queryFn: () => call(adminApi.overview.$get()),
		refetchInterval: 60_000,
	});
}

export function useOrganizations(q: string) {
	return useInfiniteQuery({
		queryKey: qk.organizations(q),
		queryFn: ({ pageParam }) =>
			call(
				adminApi.organizations.$get({
					query: { q: q || undefined, before: pageParam, limit: PAGE_SIZE },
				}),
			),
		...pages,
	});
}

export function useOrganization(id: string) {
	return useQuery({
		queryKey: qk.organization(id),
		queryFn: () => call(adminApi.organizations[":id"].$get({ param: { id } })),
	});
}

export function useUpdateOrgBudget(id: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (aiMonthlyBudgetUsd: number | null) =>
			call(adminApi.organizations[":id"].$patch({ param: { id }, json: { aiMonthlyBudgetUsd } })),
		onSuccess: (summary) => {
			// The PATCH answers with the summary; keep the detail's extra sections.
			queryClient.setQueryData<OrgDetail>(qk.organization(id), (prev) =>
				prev
					? {
							...prev,
							...summary,
							aiBudget: {
								...prev.aiBudget,
								overrideUsd: summary.aiMonthlyBudgetUsd,
								limitUsd: summary.aiEffectiveBudgetUsd,
							},
						}
					: prev,
			);
			void queryClient.invalidateQueries({ queryKey: qk.organization(id) });
			void queryClient.invalidateQueries({ queryKey: qk.organizationsAll });
			void queryClient.invalidateQueries({ queryKey: qk.audit });
			toast.success(`AI budget updated for ${summary.name}`);
		},
		onError: (error) => toast.error(errorMessage(error, "Couldn't update the AI budget.")),
	});
}

export function useUsers(q: string) {
	return useInfiniteQuery({
		queryKey: qk.users(q),
		queryFn: ({ pageParam }) =>
			call(
				adminApi.users.$get({
					query: { q: q || undefined, before: pageParam, limit: PAGE_SIZE },
				}),
			),
		...pages,
	});
}

export function useSetUserStatus() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ user, status }: { user: AdminUser; status: UserStatus }) =>
			call(adminApi.users[":id"].$patch({ param: { id: user.id }, json: { status } })),
		onSuccess: (user) => {
			void queryClient.invalidateQueries({ queryKey: qk.usersAll });
			void queryClient.invalidateQueries({ queryKey: qk.overview });
			void queryClient.invalidateQueries({ queryKey: qk.audit });
			toast.success(
				user.status === "disabled"
					? `${user.email} is disabled and signed out everywhere`
					: `${user.email} can sign in again`,
			);
		},
		onError: (error) => toast.error(errorMessage(error, "Couldn't change the user's status.")),
	});
}

export function useFailedTargets(status: AdminTargetStatus | "all") {
	return useInfiniteQuery({
		queryKey: qk.targets(status),
		queryFn: ({ pageParam }) =>
			call(
				adminApi.publishing.targets.$get({
					query: {
						status: status === "all" ? undefined : status,
						before: pageParam,
						limit: PAGE_SIZE,
					},
				}),
			),
		...pages,
	});
}

export function useGenerations(status: GenerationStatus | "all", kind: GenerationKind | "all") {
	return useInfiniteQuery({
		queryKey: qk.generations(status, kind),
		queryFn: ({ pageParam }) =>
			call(
				adminApi.ai.generations.$get({
					query: {
						status: status === "all" ? undefined : status,
						kind: kind === "all" ? undefined : kind,
						before: pageParam,
						limit: PAGE_SIZE,
					},
				}),
			),
		...pages,
	});
}

export function useQueues() {
	return useQuery({
		queryKey: qk.queues,
		queryFn: () => call(adminApi.queues.$get()),
		refetchInterval: 15_000,
	});
}

export function useAudit() {
	return useInfiniteQuery({
		queryKey: qk.audit,
		queryFn: ({ pageParam }) =>
			call(adminApi.audit.$get({ query: { before: pageParam, limit: PAGE_SIZE } })),
		...pages,
	});
}
