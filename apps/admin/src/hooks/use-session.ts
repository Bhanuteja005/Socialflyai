"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { authClient, refreshSession, type SessionState } from "@/lib/auth-client";
import { qk } from "@/lib/query-keys";

/**
 * The access cookie lives 15 minutes; the refresh cookie much longer. When the
 * session endpoint says "signed out", rotate once before believing it.
 */
async function loadSession(): Promise<SessionState> {
	const state = await authClient.session();
	if (state.authenticated) return state;
	if (await refreshSession()) return authClient.session();
	return state;
}

export function useSession() {
	return useQuery({
		queryKey: qk.session,
		queryFn: loadSession,
		staleTime: 5 * 60_000,
		retry: 1,
	});
}

export function useSignOut() {
	const queryClient = useQueryClient();
	const router = useRouter();
	return useCallback(async () => {
		await authClient.logout().catch(() => undefined);
		// Drop every cached admin response before anything else can render it.
		queryClient.clear();
		router.replace("/login");
	}, [queryClient, router]);
}
