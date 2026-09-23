"use client";

import { Button } from "@socialfly/ui/components/button";
import { EmptyState } from "@socialfly/ui/components/feedback";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { api, call, setApiOrganization } from "@/lib/api-client";
import type { Organization, Role } from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { can } from "@/lib/status";
import { FullPageSpinner } from "./auth-guard";

const STORAGE_KEY = "sf-org-id";

type OrgContextValue = {
	org: Organization;
	orgId: string;
	role: Role;
	organizations: Organization[];
	switchOrg: (id: string) => void;
	/** `can("editor")` → current role is editor or higher. */
	can: (minimum: Role) => boolean;
};

const OrgContext = createContext<OrgContextValue | null>(null);

function readStoredOrg() {
	try {
		return localStorage.getItem(STORAGE_KEY);
	} catch {
		return null;
	}
}

export function clearStoredOrg() {
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// ignore
	}
}

export function storeOrg(id: string) {
	try {
		localStorage.setItem(STORAGE_KEY, id);
	} catch {
		// Storage unavailable: the choice lasts until reload.
	}
}

export function useOrganizationsQuery() {
	return useQuery({
		queryKey: qk.organizations,
		queryFn: () => call(api.organizations.$get()),
		staleTime: 60_000,
	});
}

/** Resolves the current organization and scopes every API call to it. */
export function OrgProvider({ children }: { children: ReactNode }) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const { data, isPending, isError, error, refetch } = useOrganizationsQuery();
	// Only ever rendered on the client (below AuthGuard), so storage is readable here.
	const [selectedId, setSelectedId] = useState<string | null>(readStoredOrg);

	const organizations = data?.organizations ?? [];
	const org = organizations.find((o) => o.id === selectedId) ?? organizations[0] ?? null;

	// Set synchronously during render so the first child query already carries the header.
	if (org) setApiOrganization(org.id);

	useEffect(() => {
		if (data && data.organizations.length === 0) router.replace("/onboarding");
	}, [data, router]);

	useEffect(() => {
		if (org && org.id !== selectedId) storeOrg(org.id);
	}, [org, selectedId]);

	const switchOrg = useCallback(
		(id: string) => {
			storeOrg(id);
			setApiOrganization(id);
			setSelectedId(id);
			queryClient.removeQueries({ queryKey: ["org"] });
			router.push("/dashboard");
		},
		[queryClient, router],
	);

	const value = useMemo<OrgContextValue | null>(
		() =>
			org
				? {
						org,
						orgId: org.id,
						role: org.role,
						organizations,
						switchOrg,
						can: (minimum: Role) => can(org.role, minimum),
					}
				: null,
		[org, organizations, switchOrg],
	);

	if (isError) {
		return (
			<div className="flex min-h-dvh items-center justify-center p-4">
				<EmptyState
					title="Couldn't load your workspaces"
					description={errorMessage(error)}
					action={<Button onClick={() => refetch()}>Try again</Button>}
				/>
			</div>
		);
	}
	if (isPending || !value) return <FullPageSpinner label="Loading your workspace" />;
	return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg() {
	const ctx = useContext(OrgContext);
	if (!ctx) throw new Error("useOrg must be used inside <OrgProvider>");
	return ctx;
}
