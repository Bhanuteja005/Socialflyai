"use client";

import { Button } from "@socialfly/ui/components/button";
import { Spinner } from "@socialfly/ui/components/feedback";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { safeNext } from "@/lib/auth-client";
import { friendlyCode } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { NEXT_STORAGE_KEY } from "./auth-widgets";
import { StatusPanel } from "./recovery-forms";

function takeStoredNext() {
	try {
		const value = sessionStorage.getItem(NEXT_STORAGE_KEY);
		sessionStorage.removeItem(NEXT_STORAGE_KEY);
		return value;
	} catch {
		return null;
	}
}

/** Google sign-in lands here: `?status=ok` or `?error=<code>`. */
export function OAuthCallback() {
	const params = useSearchParams();
	const router = useRouter();
	const queryClient = useQueryClient();
	const error = params.get("error");
	const ok = params.get("status") === "ok";

	useEffect(() => {
		if (!ok || error) return;
		const next = safeNext(takeStoredNext());
		void queryClient.invalidateQueries({ queryKey: qk.session }).then(() => router.replace(next));
	}, [ok, error, queryClient, router]);

	if (error || !ok) {
		return (
			<StatusPanel icon={AlertCircle} tone="danger" title="Sign-in didn't complete">
				<p>{friendlyCode(error) ?? "Something went wrong while signing you in with Google."}</p>
				<Button asChild>
					<Link href="/login">Back to sign in</Link>
				</Button>
			</StatusPanel>
		);
	}

	return (
		<div className="grid justify-items-center gap-3 text-center">
			<Spinner className="size-6" />
			<p className="text-muted-foreground text-sm">Signing you in…</p>
		</div>
	);
}
