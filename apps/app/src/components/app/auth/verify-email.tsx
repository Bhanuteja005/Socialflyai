"use client";

import { Button } from "@socialfly/ui/components/button";
import { Spinner } from "@socialfly/ui/components/feedback";
import { Field } from "@socialfly/ui/components/field";
import { Input } from "@socialfly/ui/components/input";
import { toast } from "@socialfly/ui/components/toast";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useCurrentUser } from "@/hooks/use-session";
import { authClient } from "@/lib/auth-client";
import { errorMessage } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { StatusPanel } from "./recovery-forms";

function ResendForm({ initialEmail }: { initialEmail: string }) {
	const [email, setEmail] = useState(initialEmail);
	const [pending, setPending] = useState(false);

	async function onSubmit(event: FormEvent) {
		event.preventDefault();
		setPending(true);
		try {
			await authClient.requestVerification(email.trim());
			toast.success("Verification email sent", { description: `Check ${email.trim()}` });
		} catch (error) {
			toast.error(errorMessage(error));
		} finally {
			setPending(false);
		}
	}

	return (
		<form onSubmit={onSubmit} className="grid gap-3 text-left">
			<Field label="Email" htmlFor="verify-email">
				<Input
					id="verify-email"
					type="email"
					autoComplete="email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
				/>
			</Field>
			<Button type="submit" variant="outline" loading={pending} disabled={!email}>
				Resend verification email
			</Button>
		</form>
	);
}

export function VerifyEmail() {
	const params = useSearchParams();
	const token = params.get("token");
	const user = useCurrentUser();
	const queryClient = useQueryClient();
	const [state, setState] = useState<"idle" | "pending" | "done" | "error">(
		token ? "pending" : "idle",
	);
	const [message, setMessage] = useState<string | null>(null);
	const started = useRef(false);

	useEffect(() => {
		// Tokens are single-use: guard against the dev-mode double effect.
		if (!token || started.current) return;
		started.current = true;
		authClient
			.confirmVerification(token)
			.then(() => {
				setState("done");
				void queryClient.invalidateQueries({ queryKey: qk.session });
			})
			.catch((error) => {
				setMessage(errorMessage(error));
				setState("error");
			});
	}, [token, queryClient]);

	if (state === "pending") {
		return (
			<div className="grid justify-items-center gap-3 text-center">
				<Spinner className="size-6" />
				<p className="text-muted-foreground text-sm">Verifying your email…</p>
			</div>
		);
	}

	if (state === "done") {
		return (
			<StatusPanel icon={CheckCircle2} title="Email verified">
				<p>Thanks! Your email address is confirmed.</p>
				<Button asChild>
					<Link href="/dashboard">Continue to SocialFly</Link>
				</Button>
			</StatusPanel>
		);
	}

	if (state === "error") {
		return (
			<StatusPanel icon={AlertCircle} tone="danger" title="We couldn't verify your email">
				<p>{message}</p>
				<ResendForm initialEmail={user?.email ?? ""} />
			</StatusPanel>
		);
	}

	return (
		<StatusPanel icon={MailCheck} title="Verify your email">
			<p>We sent a verification link to your inbox. Open it to confirm your address.</p>
			<ResendForm initialEmail={user?.email ?? params.get("email") ?? ""} />
		</StatusPanel>
	);
}
