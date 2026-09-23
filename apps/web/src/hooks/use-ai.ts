"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { useOrg } from "@/components/app/org-provider";
import { api, call } from "@/lib/api-client";
import type { Generation, GenerationsQuery } from "@/lib/api-types";
import { qk } from "@/lib/query-keys";

/** Generations the worker hasn't finished yet. */
export const isGenerationActive = (g: Pick<Generation, "status"> | undefined) =>
	g?.status === "pending" || g?.status === "running";

export function useAiCapabilities() {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.aiCapabilities(orgId),
		queryFn: () => call(api.ai.capabilities.$get()),
		staleTime: 60_000,
	});
}

export function useBrandProfile() {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.brand(orgId),
		queryFn: () => call(api.ai.brand.$get()),
		staleTime: 5 * 60_000,
	});
}

/** One generation, polled every 2s while the worker is on it. */
export function useGeneration(id: string | null) {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.generation(orgId, id ?? ""),
		queryFn: () => call(api.ai.generations[":id"].$get({ param: { id: id ?? "" } })),
		enabled: Boolean(id),
		refetchInterval: (q) => (isGenerationActive(q.state.data) ? 2_000 : false),
	});
}

export function useGenerations(query: GenerationsQuery = {}) {
	const { orgId } = useOrg();
	return useQuery({
		queryKey: qk.generations(orgId, query),
		queryFn: () => call(api.ai.generations.$get({ query })),
		refetchInterval: (q) => (q.state.data?.items.some(isGenerationActive) ? 4_000 : false),
	});
}

/**
 * Every AI call spends budget and may create a generation; refresh the usage
 * meter and the recent list after each one, whether it succeeded or not.
 */
export function useAfterAiCall() {
	const { orgId } = useOrg();
	const queryClient = useQueryClient();
	return useCallback(() => {
		void queryClient.invalidateQueries({ queryKey: qk.aiCapabilities(orgId) });
		void queryClient.invalidateQueries({ queryKey: qk.generationsAll(orgId) });
	}, [orgId, queryClient]);
}

/**
 * Starts an async generation (image, carousel) and follows it to completion:
 * seeds the poll with the 202 body, then refreshes budget, history and the
 * media library once the worker is done.
 */
export function useGenerationRun<TInput>(start: (input: TInput) => Promise<Generation>) {
	const { orgId } = useOrg();
	const queryClient = useQueryClient();
	const afterAiCall = useAfterAiCall();
	const [id, setId] = useState<string | null>(null);
	const mutation = useMutation({
		mutationFn: start,
		onSuccess: (g) => {
			queryClient.setQueryData(qk.generation(orgId, g.id), g);
			setId(g.id);
		},
		onSettled: afterAiCall,
	});
	const generation = useGeneration(id);
	const status = generation.data?.status;

	useEffect(() => {
		if (status !== "succeeded" && status !== "failed") return;
		afterAiCall();
		if (status === "succeeded")
			void queryClient.invalidateQueries({ queryKey: qk.mediaAll(orgId) });
	}, [status, afterAiCall, queryClient, orgId]);

	const reset = useCallback(() => {
		setId(null);
		mutation.reset();
	}, [mutation.reset]);

	return {
		start: mutation.mutate,
		startError: mutation.error,
		generation: id ? generation.data : undefined,
		pollError: generation.error,
		busy: mutation.isPending || isGenerationActive(generation.data),
		reset,
	};
}
