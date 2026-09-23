"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { setApiOrganization } from "@/lib/api-client";
import { authClient, type PublicUser, refreshSession, type SessionState } from "@/lib/auth-client";
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

/** The signed-in user; only call below <AuthGuard>, which guarantees a session. */
export function useCurrentUser(): PublicUser | null {
	const { data } = useSession();
	return data?.authenticated ? data.user : null;
}

export function useSignOut() {
	const queryClient = useQueryClient();
	const router = useRouter();
	return useCallback(async () => {
		await authClient.logout().catch(() => undefined);
		setApiOrganization(null);
		queryClient.clear();
		router.replace("/login");
	}, [queryClient, router]);
}
