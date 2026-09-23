"use client";

import { Avatar } from "@socialfly/ui/components/avatar";
import { Badge } from "@socialfly/ui/components/badge";
import { Button } from "@socialfly/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@socialfly/ui/components/card";
import { Field, fieldAria } from "@socialfly/ui/components/field";
import { Input } from "@socialfly/ui/components/input";
import { toast } from "@socialfly/ui/components/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, MailWarning } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { PasswordChecklist, PasswordInput } from "@/components/app/auth/auth-widgets";
import { useFormErrors } from "@/hooks/use-form-errors";
import { useCurrentUser } from "@/hooks/use-session";
import { authClient, passwordProblems, type SessionState } from "@/lib/auth-client";
import { errorMessage } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { PageHeader } from "../page-header";
import { SessionsCard } from "./sessions-card";
import { SettingsNav } from "./settings-nav";

function ProfileCard() {
	const user = useCurrentUser();
	const queryClient = useQueryClient();
	const errors = useFormErrors();
	const [name, setName] = useState(user?.name ?? "");
	const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? "");

	useEffect(() => {
		setName(user?.name ?? "");
		setAvatarUrl(user?.avatarUrl ?? "");
	}, [user?.name, user?.avatarUrl]);

	const save = useMutation({
		mutationFn: () =>
			authClient.updateProfile({ name: name.trim(), avatarUrl: avatarUrl.trim() || null }),
		onSuccess: (updated) => {
			queryClient.setQueryData<SessionState>(qk.session, (prev) =>
				prev?.authenticated ? { ...prev, user: updated } : prev,
			);
			toast.success("Profile updated");
		},
		onError: (e) => errors.fromError(e),
	});

	const resend = useMutation({
		mutationFn: () => authClient.requestVerification(user?.email ?? ""),
		onSuccess: () => toast.success("Verification email sent"),
		onError: (e) => toast.error(errorMessage(e)),
	});

	const changed =
		name.trim() !== (user?.name ?? "") || avatarUrl.trim() !== (user?.avatarUrl ?? "");

	function onSubmit(event: FormEvent) {
		event.preventDefault();
		errors.reset();
		save.mutate();
	}

	return (
		<Card>
			<form onSubmit={onSubmit} noValidate>
				<CardHeader>
					<CardTitle>Profile</CardTitle>
					<CardDescription>How you appear to your teammates.</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4">
					<div className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2.5">
						<Avatar src={avatarUrl || null} name={name || user?.email} size="lg" />
						<div className="grid min-w-0 flex-1">
							<p className="truncate font-medium text-sm">{user?.email}</p>
							{user?.emailVerified ? (
								<Badge tone="success" className="w-fit">
									<BadgeCheck />
									Verified
								</Badge>
							) : (
								<span className="flex flex-wrap items-center gap-2">
									<Badge tone="warning">
										<MailWarning />
										Not verified
									</Badge>
									<Button
										variant="link"
										size="xs"
										loading={resend.isPending}
										onClick={() => resend.mutate()}
									>
										Resend verification email
									</Button>
								</span>
							)}
						</div>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<Field label="Name" htmlFor="profile-name" error={errors.fields.name ?? errors.form}>
							<Input
								id="profile-name"
								autoComplete="name"
								value={name}
								maxLength={120}
								onChange={(e) => setName(e.target.value)}
								{...fieldAria("profile-name", errors.fields.name ?? errors.form)}
							/>
						</Field>
						<Field
							label="Avatar URL"
							htmlFor="profile-avatar"
							error={errors.fields.avatarUrl}
							hint="Link to a square image."
						>
							<Input
								id="profile-avatar"
								type="url"
								placeholder="https://"
								value={avatarUrl}
								onChange={(e) => setAvatarUrl(e.target.value)}
								{...fieldAria("profile-avatar", errors.fields.avatarUrl, true)}
							/>
						</Field>
					</div>
				</CardContent>
				<CardFooter>
					<Button type="submit" loading={save.isPending} disabled={!changed || !name.trim()}>
						Save profile
					</Button>
				</CardFooter>
			</form>
		</Card>
	);
}

function PasswordCard() {
	const queryClient = useQueryClient();
	const errors = useFormErrors();
	const [current, setCurrent] = useState("");
	const [next, setNext] = useState("");

	const change = useMutation({
		mutationFn: () => authClient.changePassword({ currentPassword: current, newPassword: next }),
		onSuccess: () => {
			setCurrent("");
			setNext("");
			void queryClient.invalidateQueries({ queryKey: qk.authSessions });
			toast.success("Password changed", { description: "Your other sessions were signed out." });
		},
		onError: (e) => errors.fromError(e, { currentPassword: "current", newPassword: "next" }),
	});

	function onSubmit(event: FormEvent) {
		event.preventDefault();
		errors.reset();
		const problem = passwordProblems(next);
		if (problem) return errors.setField("next", problem);
		change.mutate();
	}

	const currentError = errors.fields.current ?? errors.form;

	return (
		<Card>
			<form onSubmit={onSubmit} noValidate>
				<CardHeader>
					<CardTitle>Password</CardTitle>
					<CardDescription>
						Changing it signs you out everywhere else. Signed in with Google only? Use “Forgot
						password” to set one.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4 sm:grid-cols-2">
					<Field label="Current password" htmlFor="current-password" error={currentError}>
						<PasswordInput
							id="current-password"
							autoComplete="current-password"
							value={current}
							onChange={(e) => setCurrent(e.target.value)}
							{...fieldAria("current-password", currentError)}
						/>
					</Field>
					<div className="grid gap-2">
						<Field label="New password" htmlFor="new-password" error={errors.fields.next}>
							<PasswordInput
								id="new-password"
								autoComplete="new-password"
								value={next}
								onChange={(e) => setNext(e.target.value)}
								{...fieldAria("new-password", errors.fields.next)}
							/>
						</Field>
						{next ? <PasswordChecklist password={next} /> : null}
					</div>
				</CardContent>
				<CardFooter>
					<Button type="submit" loading={change.isPending} disabled={!current || !next}>
						Change password
					</Button>
				</CardFooter>
			</form>
		</Card>
	);
}

export function AccountSettings() {
	return (
		<div className="max-w-3xl">
			<PageHeader title="Settings" />
			<SettingsNav />
			<div className="grid gap-6">
				<ProfileCard />
				<PasswordCard />
				<SessionsCard />
			</div>
		</div>
	);
}
