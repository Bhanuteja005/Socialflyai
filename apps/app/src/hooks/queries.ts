"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useOrg } from "@/components/app/org-provider";
import { api, call } from "@/lib/api-client";
import type { PostsQuery } from "@/lib/api-types";
import { qk } from "@/lib/query-keys";

export function useProviders() {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.providers(orgId),
		queryFn: () => call(api.channels.providers.$get()),
		staleTime: 10 * 60_000,
		select: (d) => d.providers,
	});
}

export function useChannels() {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.channels(orgId),
		queryFn: () => call(api.channels.$get()),
		select: (d) => d.channels,
	});
}

export function usePosts(
	query: PostsQuery = {},
	options: { enabled?: boolean; refetchInterval?: number } = {},
) {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.posts(orgId, query),
		queryFn: () => call(api.posts.$get({ query })),
		select: (d) => d.posts,
		...options,
	});
}

export function usePost(id: string) {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.post(orgId, id),
		queryFn: () => call(api.posts[":id"].$get({ param: { id } })),
		// While something is in flight, keep the per-channel status live.
		refetchInterval: (q) =>
			q.state.data?.targets.some((t) => ["queued", "publishing", "processing"].includes(t.status))
				? 5_000
				: false,
	});
}

export function useMediaLibrary(kind?: "image" | "video") {
	const { orgId } = useOrg();
	return useInfiniteQuery({
		queryKey: qk.media(orgId, kind),
		queryFn: ({ pageParam }) =>
			call(
				api.media.$get({
					query: { kind, cursor: pageParam ?? undefined, limit: "40" },
				}),
			),
		initialPageParam: null as string | null,
		getNextPageParam: (last) => last.nextCursor,
	});
}

export function useMembers() {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.members(orgId),
		queryFn: () => call(api.organization.members.$get()),
		select: (d) => d.members,
	});
}

export function useInvitations(enabled: boolean) {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.invitations(orgId),
		queryFn: () => call(api.organization.invitations.$get()),
		select: (d) => d.invitations,
		enabled,
	});
}
