"use client";

import { Button } from "@socialfly/ui/components/button";
import { Alert } from "@socialfly/ui/components/feedback";
import { Field } from "@socialfly/ui/components/field";
import { Input } from "@socialfly/ui/components/input";
import { cn } from "@socialfly/ui/utils";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { type ComponentProps, type FormEvent, useEffect, useState } from "react";
import { useSession } from "@/hooks/use-session";
import { authClient, safeNext } from "@/lib/auth-client";
import { errorMessage, isApiError } from "@/lib/errors";
import { qk } from "@/lib/query-keys";

function PasswordInput({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
	const [visible, setVisible] = useState(false);
	return (
		<div className="relative">
			<Input type={visible ? "text" : "password"} className={cn("pr-10", className)} {...props} />
			<button
				type="button"
				onClick={() => setVisible((v) => !v)}
				className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
				aria-label={visible ? "Hide password" : "Show password"}
				aria-pressed={visible}
			>
				{visible ? (
					<EyeOff className="size-4" aria-hidden="true" />
				) : (
					<Eye className="size-4" aria-hidden="true" />
				)}
			</button>
		</div>
	);
}

/**
 * Staff sign-in. Login only: the `socialfly-admin` client refuses sign-ups, and staff use
 * the same account as in the product app. Whether the account may use the console is
 * decided afterwards by GET /admin/me (see AdminGuard), never here.
 */
export function LoginForm() {
	const router = useRouter();
	const params = useSearchParams();
	const queryClient = useQueryClient();
	const next = safeNext(params.get("next"));
	const { data: session } = useSession();
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");

	// Already signed in (the session cookie is shared with the product app): carry on.
	useEffect(() => {
		if (session?.authenticated) router.replace(next);
	}, [session, next, router]);

	async function onSubmit(event: FormEvent) {
		event.preventDefault();
		setError(null);
		setPending(true);
		try {
			const result = await authClient.login({ email: email.trim(), password });
			// A previous account's admin data must never survive into this session.
			queryClient.removeQueries({ queryKey: ["admin"] });
			queryClient.setQueryData(qk.session, { authenticated: true, ...result });
			router.replace(next);
		} catch (e) {
			setError(
				isApiError(e) && e.status === 401
					? "That email and password don't match an account."
					: errorMessage(e),
			);
			setPending(false);
		}
	}

	return (
		<>
			<div className="mb-6 grid gap-2">
				<h1 className="text-balance font-normal font-pixel text-[24px] leading-8">
					Sign in to the admin console
				</h1>
				<p className="text-muted-foreground text-sm">Use your usual SocialFly account.</p>
			</div>
			<form onSubmit={onSubmit} className="grid gap-4" noValidate>
				{error ? <Alert tone="danger" icon={AlertCircle} title={error} /> : null}
				<Field label="Email" htmlFor="email">
					<Input
						id="email"
						type="email"
						autoComplete="username"
						inputMode="email"
						required
						value={email}
						onChange={(e) => setEmail(e.target.value)}
					/>
				</Field>
				<Field label="Password" htmlFor="password">
					<PasswordInput
						id="password"
						autoComplete="current-password"
						required
						value={password}
						onChange={(e) => setPassword(e.target.value)}
					/>
				</Field>
				<Button type="submit" size="lg" loading={pending} disabled={!email || !password}>
					<LockKeyhole />
					Sign in to console
				</Button>
			</form>
			<p className="mt-5 border-border border-t pt-4 text-muted-foreground text-xs">
				Accounts without platform access can't open the console.
			</p>
		</>
	);
}
