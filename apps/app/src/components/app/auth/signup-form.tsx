"use client";

import { Button } from "@socialfly/ui/components/button";
import { Alert } from "@socialfly/ui/components/feedback";
import { Field, fieldAria } from "@socialfly/ui/components/field";
import { Input } from "@socialfly/ui/components/input";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { useFormErrors } from "@/hooks/use-form-errors";
import { authClient, passwordProblems, safeNext } from "@/lib/auth-client";
import { isApiError } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import {
	AuthHeading,
	Divider,
	GoogleButton,
	PasswordChecklist,
	PasswordInput,
} from "./auth-widgets";

export function SignupForm() {
	const router = useRouter();
	const params = useSearchParams();
	const queryClient = useQueryClient();
	const next = safeNext(params.get("next"), "/onboarding");
	const errors = useFormErrors();
	const [pending, setPending] = useState(false);
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");

	async function onSubmit(event: FormEvent) {
		event.preventDefault();
		errors.reset();
		const problem = passwordProblems(password);
		if (problem) {
			errors.setField("password", problem);
			return;
		}
		setPending(true);
		try {
			const result = await authClient.register({
				email: email.trim(),
				password,
				name: name.trim() || undefined,
			});
			queryClient.setQueryData(qk.session, { authenticated: true, ...result });
			router.replace(next);
		} catch (error) {
			if (isApiError(error) && error.code === "email_taken") {
				errors.setErrors({
					fields: { email: "An account with this email already exists." },
					form: null,
				});
			} else {
				errors.fromError(error);
			}
			setPending(false);
		}
	}

	return (
		<>
			<AuthHeading title="Create your account" />
			<GoogleButton next={next} label="Sign up with Google" />
			<Divider>or</Divider>
			<form onSubmit={onSubmit} className="grid gap-4" noValidate>
				{errors.form ? <Alert tone="danger" icon={AlertCircle} title={errors.form} /> : null}
				<Field label="Name" htmlFor="name" error={errors.fields.name}>
					<Input
						id="name"
						autoComplete="name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						{...fieldAria("name", errors.fields.name)}
					/>
				</Field>
				<Field label="Work email" htmlFor="email" error={errors.fields.email}>
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
				{errors.fields.email?.includes("already exists") ? (
					<p className="-mt-2 text-muted-foreground text-xs">
						<Link
							href={`/login?email=${encodeURIComponent(email)}`}
							className="font-medium text-foreground underline underline-offset-2"
						>
							Sign in instead
						</Link>{" "}
						or{" "}
						<Link href="/forgot-password" className="underline underline-offset-2">
							reset your password
						</Link>
						.
					</p>
				) : null}
				<Field label="Password" htmlFor="password" error={errors.fields.password}>
					<PasswordInput
						id="password"
						autoComplete="new-password"
						required
						value={password}
						onChange={(e) => {
							setPassword(e.target.value);
							if (errors.fields.password) errors.setField("password", null);
						}}
						{...fieldAria("password", errors.fields.password)}
					/>
				</Field>
				<PasswordChecklist password={password} />
				<Button type="submit" size="lg" loading={pending} disabled={!email || !password}>
					Create account
				</Button>
			</form>
			<p className="mt-6 text-center text-muted-foreground text-sm">
				Already have an account?{" "}
				<Link
					href={`/login${params.get("next") ? `?next=${encodeURIComponent(next)}` : ""}`}
					className="font-medium text-foreground underline-offset-4 hover:underline"
				>
					Sign in
				</Link>
			</p>
		</>
	);
}
