"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Users } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { storeOrg } from "@/components/app/org-provider";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/feedback";
import { toast } from "@/components/ui/toast";
import { useSession, useSignOut } from "@/hooks/use-session";
import { api, call } from "@/lib/api-client";
import { errorMessage, isApiError } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { StatusPanel } from "./recovery-forms";

export function AcceptInvite() {
	const params = useSearchParams();
	const token = params.get("token") ?? "";
	const router = useRouter();
	const queryClient = useQueryClient();
	const { data: session, isPending } = useSession();
	const signOut = useSignOut();
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<{ code: string; message: string } | null>(null);

	const signedOut = !isPending && !session?.authenticated;
	useEffect(() => {
		if (signedOut && token) {
			router.replace(`/login?next=${encodeURIComponent(`/invite?token=${token}`)}`);
		}
	}, [signedOut, token, router]);

	if (!token) {
		return (
			<StatusPanel icon={AlertCircle} tone="danger" title="This invitation link is incomplete">
				<p>Open the link from your invitation email again.</p>
			</StatusPanel>
		);
	}

	if (isPending || signedOut) {
		return (
			<div className="flex justify-center">
				<Spinner className="size-6" />
			</div>
		);
	}

	async function accept() {
		setPending(true);
		setError(null);
		try {
			const org = await call(api.organizations.invitations.accept.$post({ json: { token } }));
			storeOrg(org.id);
			await queryClient.invalidateQueries({ queryKey: qk.organizations });
			toast.success(`You've joined ${org.name}`);
			router.replace("/dashboard");
		} catch (e) {
			setError({ code: isApiError(e) ? e.code : "unknown", message: errorMessage(e) });
			setPending(false);
		}
	}

	const email = session?.authenticated ? session.user.email : "";

	if (error) {
		return (
			<StatusPanel icon={AlertCircle} tone="danger" title="We couldn't accept this invitation">
				<p>{error.message}</p>
				{error.code === "invitation_email_mismatch" ? (
					<Button
						onClick={async () => {
							await signOut();
							router.replace(`/login?next=${encodeURIComponent(`/invite?token=${token}`)}`);
						}}
					>
						Sign in with another account
					</Button>
				) : (
					<Button variant="outline" asChild>
						<Link href="/dashboard">Go to dashboard</Link>
					</Button>
				)}
			</StatusPanel>
		);
	}

	return (
		<StatusPanel icon={Users} title="Join your team">
			<p>
				You've been invited to collaborate on SocialFly. You're signed in as{" "}
				<span className="font-medium text-foreground">{email}</span>.
			</p>
			<div className="grid gap-2">
				<Button size="lg" loading={pending} onClick={accept}>
					Accept invitation
				</Button>
				<Button variant="ghost" asChild>
					<Link href="/dashboard">Not now</Link>
				</Button>
			</div>
		</StatusPanel>
	);
}
