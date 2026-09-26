"use client";

import { Button } from "@socialfly/ui/components/button";
import { Alert } from "@socialfly/ui/components/feedback";
import { Field, fieldAria } from "@socialfly/ui/components/field";
import { Input } from "@socialfly/ui/components/input";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { useFormErrors } from "@/hooks/use-form-errors";
import { useSession } from "@/hooks/use-session";
import { authClient, safeNext } from "@/lib/auth-client";
import { isApiError } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { AuthHeading, Divider, GoogleButton, PasswordInput } from "./auth-widgets";

export function LoginForm() {
	const router = useRouter();
	const params = useSearchParams();
	const queryClient = useQueryClient();
	const next = safeNext(params.get("next"));
	const { data: session } = useSession();
	const errors = useFormErrors();
	const [pending, setPending] = useState(false);
	const [email, setEmail] = useState(params.get("email") ?? "");
	const [password, setPassword] = useState("");

	// Already signed in (e.g. followed a stale link to /login): carry on.
	useEffect(() => {
		if (session?.authenticated) router.replace(next);
	}, [session, next, router]);

	async function onSubmit(event: FormEvent) {
		event.preventDefault();
		errors.reset();
		setPending(true);
		try {
			const result = await authClient.login({ email: email.trim(), password });
			queryClient.setQueryData(qk.session, { authenticated: true, ...result });
			router.replace(next);
		} catch (error) {
			if (isApiError(error) && error.status === 401) {
				errors.setErrors({ fields: {}, form: "That email and password don't match an account." });
			} else {
				errors.fromError(error);
			}
			setPending(false);
		}
	}

	return (
		<>
			<AuthHeading title="Welcome back" />
			<GoogleButton next={next} />
			<Divider>or</Divider>
			<form onSubmit={onSubmit} className="grid gap-4" noValidate>
				{errors.form ? <Alert tone="danger" icon={AlertCircle} title={errors.form} /> : null}
				<Field label="Email" htmlFor="email" error={errors.fields.email}>
					<Input
						id="email"
						type="email"
						autoComplete="email"
						inputMode="email"
						required
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						{...fieldAria("email", errors.fields.email)}
					/>
				</Field>
				<Field
					label="Password"
					htmlFor="password"
					error={errors.fields.password}
					action={
						<Link
							href={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`}
							className="text-muted-foreground text-xs hover:text-foreground"
						>
							Forgot password?
						</Link>
					}
				>
					<PasswordInput
						id="password"
						autoComplete="current-password"
						required
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						{...fieldAria("password", errors.fields.password)}
					/>
				</Field>
				<Button type="submit" size="lg" loading={pending} disabled={!email || !password}>
					Sign in
				</Button>
			</form>
			<p className="mt-6 text-center text-muted-foreground text-sm">
				New to SocialFly?{" "}
				<Link
					href={`/signup${params.get("next") ? `?next=${encodeURIComponent(next)}` : ""}`}
					className="font-medium text-foreground underline-offset-4 hover:underline"
				>
					Create an account
				</Link>
			</p>
		</>
	);
}
