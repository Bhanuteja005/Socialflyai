"use client";

import { Button } from "@socialfly/ui/components/button";
import { Spinner } from "@socialfly/ui/components/feedback";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, ShieldOff } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { useAdminMe } from "@/hooks/use-admin";
import { useSession, useSignOut } from "@/hooks/use-session";
import type { AdminMe } from "@/lib/api-types";
import { setUnauthorizedHandler } from "@/lib/auth-client";
import { isApiError } from "@/lib/errors";
import { QueryError, StaffBadge } from "./common";

function FullPage({ children }: { children: ReactNode }) {
	return (
		<main className="flex min-h-dvh items-center justify-center bg-surface px-4">{children}</main>
	);
}

function NoAccess({ email }: { email: string | undefined }) {
	const signOut = useSignOut();
	const [pending, setPending] = useState(false);
	return (
		<FullPage>
			<div className="grid max-w-md justify-items-center gap-4 rounded-xl border border-border bg-surface-raised p-8 text-center shadow-xs">
				<span className="flex size-11 items-center justify-center rounded-lg bg-danger-soft text-danger">
					<ShieldOff className="size-5" aria-hidden="true" />
				</span>
				<StaffBadge />
				<h1 className="font-semibold text-lg tracking-tight">
					This account does not have access to the admin console
				</h1>
				<p className="text-muted-foreground text-sm">
					{email ? (
						<>
							You're signed in as <span className="font-medium text-foreground">{email}</span>.{" "}
						</>
					) : null}
					Sign out and use a staff account, or ask an engineer to grant platform access.
				</p>
				<Button
					variant="outline"
					loading={pending}
					onClick={async () => {
						setPending(true);
						await signOut();
					}}
				>
					<LogOut />
					Sign out
				</Button>
			</div>
		</FullPage>
	);
}

const AdminContext = createContext<AdminMe | null>(null);

/** The signed-in platform admin; only call below <AdminGuard>. */
export function useMe(): AdminMe {
	const me = useContext(AdminContext);
	if (!me) throw new Error("useMe() must be used inside <AdminGuard>");
	return me;
}

/**
 * Two gates before any admin data renders: a session (else → /login), then
 * GET /admin/me. The API answers 404 to everyone who is not a platform admin, so a
 * 404 here shows the no-access screen and nothing else is ever requested.
 */
export function AdminGuard({ children }: { children: ReactNode }) {
	const session = useSession();
	const router = useRouter();
	const pathname = usePathname();
	const queryClient = useQueryClient();
	const authenticated = session.data?.authenticated === true;
	const me = useAdminMe(authenticated);

	useEffect(() => {
		setUnauthorizedHandler(() => {
			queryClient.clear();
			const next = `${window.location.pathname}${window.location.search}`;
			router.replace(`/login?next=${encodeURIComponent(next)}`);
		});
	}, [queryClient, router]);

	const signedOut = !session.isPending && (session.isError || !authenticated);
	useEffect(() => {
		if (!signedOut) return;
		const next = `${pathname}${window.location.search}`;
		router.replace(pathname === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`);
	}, [signedOut, pathname, router]);

	if (session.isPending || signedOut) {
		return (
			<FullPage>
				<Spinner className="size-5" label="Checking your session" />
			</FullPage>
		);
	}
	if (me.isPending) {
		return (
			<FullPage>
				<Spinner className="size-5" label="Checking console access" />
			</FullPage>
		);
	}
	if (me.isError) {
		const status = isApiError(me.error) ? me.error.status : 0;
		// 404: not a platform admin. 403: the account is disabled. Neither may see anything.
		if (status === 404 || status === 403) {
			return <NoAccess email={session.data?.authenticated ? session.data.user.email : undefined} />;
		}
		return (
			<FullPage>
				<div className="w-full max-w-md">
					<QueryError
						error={me.error}
						title="Couldn't check your console access"
						onRetry={() => void me.refetch()}
					/>
				</div>
			</FullPage>
		);
	}
	return <AdminContext.Provider value={me.data}>{children}</AdminContext.Provider>;
}
