"use client";

import { Button } from "@socialfly/ui/components/button";
import { Alert } from "@socialfly/ui/components/feedback";
import { Field, fieldAria } from "@socialfly/ui/components/field";
import { Input } from "@socialfly/ui/components/input";
import { AlertCircle, ArrowLeft, CheckCircle2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, type ReactNode, useState } from "react";
import { useFormErrors } from "@/hooks/use-form-errors";
import { authClient, passwordProblems } from "@/lib/auth-client";
import { isApiError } from "@/lib/errors";
import { AuthHeading, PasswordChecklist, PasswordInput } from "./auth-widgets";

export function StatusPanel({
	icon: Icon,
	tone = "success",
	title,
	children,
}: {
	icon: typeof MailCheck;
	tone?: "success" | "danger";
	title: string;
	children: ReactNode;
}) {
	return (
		<div className="grid justify-items-center gap-4 text-center">
			<span
				className={
					tone === "success"
						? "flex size-10 items-center justify-center rounded-full bg-muted text-foreground"
						: "flex size-10 items-center justify-center rounded-full bg-danger-soft text-danger"
				}
			>
				<Icon className="size-5" aria-hidden="true" />
			</span>
			<h1 className="text-balance font-normal font-pixel text-[24px] leading-8">{title}</h1>
			<div className="grid gap-4 text-muted-foreground text-sm">{children}</div>
		</div>
	);
}

export function ForgotPasswordForm() {
	const params = useSearchParams();
	const [email, setEmail] = useState(params.get("email") ?? "");
	const [sent, setSent] = useState(false);
	const [pending, setPending] = useState(false);
	const errors = useFormErrors();

	async function onSubmit(event: FormEvent) {
		event.preventDefault();
		errors.reset();
		setPending(true);
		try {
			await authClient.requestRecovery(email.trim());
			setSent(true);
		} catch (error) {
			errors.fromError(error);
		} finally {
			setPending(false);
		}
	}

	if (sent) {
		return (
			<StatusPanel icon={MailCheck} title="Check your inbox">
				<p>
					If an account exists for <span className="font-medium text-foreground">{email}</span>,
					we've sent a reset link. It expires soon.
				</p>
				<Button variant="outline" asChild>
					<Link href="/login">
						<ArrowLeft />
						Back to sign in
					</Link>
				</Button>
			</StatusPanel>
		);
	}

	return (
		<>
			<AuthHeading
				title="Reset your password"
				description="We'll email you a link to choose a new one."
			/>
			<form onSubmit={onSubmit} className="grid gap-4" noValidate>
				{errors.form ? <Alert tone="danger" icon={AlertCircle} title={errors.form} /> : null}
				<Field label="Email" htmlFor="email" error={errors.fields.email}>
					<Input
						id="email"
						type="email"
						autoComplete="email"
						required
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						{...fieldAria("email", errors.fields.email)}
					/>
				</Field>
				<Button type="submit" size="lg" loading={pending} disabled={!email}>
					Send reset link
				</Button>
			</form>
			<p className="mt-6 text-center text-sm">
				<Link
					href="/login"
					className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
				>
					<ArrowLeft className="size-3.5" aria-hidden="true" />
					Back to sign in
				</Link>
			</p>
		</>
	);
}

export function ResetPasswordForm() {
	const params = useSearchParams();
	const token = params.get("token") ?? "";
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [done, setDone] = useState(false);
	const [pending, setPending] = useState(false);
	const errors = useFormErrors();

	if (!token) {
		return (
			<StatusPanel icon={AlertCircle} tone="danger" title="This link is incomplete">
				<p>Open the link from your email again, or request a new one.</p>
				<Button asChild>
					<Link href="/forgot-password">Request a new link</Link>
				</Button>
			</StatusPanel>
		);
	}

	if (done) {
		return (
			<StatusPanel icon={CheckCircle2} title="Password updated">
				<p>For your security we signed you out everywhere. Sign in with your new password.</p>
				<Button asChild>
					<Link href="/login">Sign in</Link>
				</Button>
			</StatusPanel>
		);
	}

	async function onSubmit(event: FormEvent) {
		event.preventDefault();
		errors.reset();
		const problem = passwordProblems(password);
		if (problem) return errors.setField("password", problem);
		if (password !== confirm) return errors.setField("confirm", "Passwords don't match.");
		setPending(true);
		try {
			await authClient.confirmRecovery(token, password);
			setDone(true);
		} catch (error) {
			if (isApiError(error) && error.code === "invalid_token") {
				errors.setErrors({
					fields: {},
					form: "This reset link is invalid or has expired. Request a new one.",
				});
			} else {
				errors.fromError(error);
			}
		} finally {
			setPending(false);
		}
	}

	return (
		<>
			<AuthHeading
				title="Choose a new password"
				description="You'll be signed out of other devices."
			/>
			<form onSubmit={onSubmit} className="grid gap-4" noValidate>
				{errors.form ? (
					<Alert
						tone="danger"
						icon={AlertCircle}
						title={errors.form}
						action={
							<Button variant="link" size="xs" asChild>
								<Link href="/forgot-password">New link</Link>
							</Button>
						}
					/>
				) : null}
				<Field label="New password" htmlFor="password" error={errors.fields.password}>
					<PasswordInput
						id="password"
						autoComplete="new-password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						{...fieldAria("password", errors.fields.password)}
					/>
				</Field>
				<PasswordChecklist password={password} />
				<Field label="Confirm password" htmlFor="confirm" error={errors.fields.confirm}>
					<PasswordInput
						id="confirm"
						autoComplete="new-password"
						value={confirm}
						onChange={(e) => setConfirm(e.target.value)}
						{...fieldAria("confirm", errors.fields.confirm)}
					/>
				</Field>
				<Button type="submit" size="lg" loading={pending} disabled={!password || !confirm}>
					Update password
				</Button>
			</form>
		</>
	);
}
