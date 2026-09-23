"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { Spinner } from "@/components/ui/feedback";
import { useSession } from "@/hooks/use-session";
import { setApiOrganization } from "@/lib/api-client";
import { setUnauthorizedHandler } from "@/lib/auth-client";

export function FullPageSpinner({ label = "Loading" }: { label?: string }) {
	return (
		<div className="flex min-h-dvh items-center justify-center">
			<Spinner className="size-5" label={label} />
		</div>
	);
}

/**
 * Client-side session check for the app. The proxy already bounced visitors with
 * no auth cookies at all; this catches expired/revoked sessions.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
	const { data, isPending, isError } = useSession();
	const router = useRouter();
	const pathname = usePathname();
	const queryClient = useQueryClient();

	useEffect(() => {
		setUnauthorizedHandler(() => {
			setApiOrganization(null);
			queryClient.clear();
			const next = `${window.location.pathname}${window.location.search}`;
			router.replace(`/login?next=${encodeURIComponent(next)}`);
		});
	}, [queryClient, router]);

	const signedOut = !isPending && (isError || !data?.authenticated);
	useEffect(() => {
		if (!signedOut) return;
		const next = `${pathname}${window.location.search}`;
		router.replace(`/login?next=${encodeURIComponent(next)}`);
	}, [signedOut, pathname, router]);

	if (isPending || signedOut) return <FullPageSpinner label="Checking your session" />;
	return <>{children}</>;
}
