"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, Building2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Field, fieldAria } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useFormErrors } from "@/hooks/use-form-errors";
import { useCurrentUser, useSignOut } from "@/hooks/use-session";
import { api, call, setApiOrganization } from "@/lib/api-client";
import { qk } from "@/lib/query-keys";
import { browserTimeZone } from "@/lib/timezone";
import { FullPageSpinner } from "./auth-guard";
import { storeOrg, useOrganizationsQuery } from "./org-provider";
import { Logo } from "./shell/app-shell";
import { TimezoneSelect } from "./timezone-select";

export function OnboardingForm() {
	const router = useRouter();
	const params = useSearchParams();
	const creatingAnother = params.get("new") === "1";
	const queryClient = useQueryClient();
	const user = useCurrentUser();
	const signOut = useSignOut();
	const { data, isPending } = useOrganizationsQuery();
	const errors = useFormErrors();
	const [name, setName] = useState("");
	const [timezone, setTimezone] = useState("UTC");
	const [pending, setPending] = useState(false);

	useEffect(() => setTimezone(browserTimeZone()), []);

	const hasOrgs = (data?.organizations.length ?? 0) > 0;
	useEffect(() => {
		if (hasOrgs && !creatingAnother) router.replace("/dashboard");
	}, [hasOrgs, creatingAnother, router]);

	if (isPending || (hasOrgs && !creatingAnother)) return <FullPageSpinner />;

	async function onSubmit(event: FormEvent) {
		event.preventDefault();
		errors.reset();
		setPending(true);
		try {
			const org = await call(api.organizations.$post({ json: { name: name.trim(), timezone } }));
			storeOrg(org.id);
			setApiOrganization(org.id);
			queryClient.removeQueries({ queryKey: ["org"] });
			await queryClient.invalidateQueries({ queryKey: qk.organizations });
			toast.success(`${org.name} is ready`, { description: "Next, connect your first channel." });
			router.replace("/channels");
		} catch (error) {
			errors.fromError(error);
			setPending(false);
		}
	}

	return (
		<div className="flex min-h-dvh flex-col bg-surface px-4 py-6">
			<div className="mx-auto flex w-full max-w-5xl items-center justify-between">
				<Logo />
				{creatingAnother ? (
					<Button variant="ghost" size="sm" asChild>
						<Link href="/dashboard">
							<ArrowLeft />
							Back
						</Link>
					</Button>
				) : (
					<Button variant="ghost" size="sm" onClick={() => void signOut()}>
						Sign out
					</Button>
				)}
			</div>
			<div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
				<div className="mb-6 grid justify-items-center gap-3 text-center">
					<span className="flex size-12 items-center justify-center rounded-xl bg-primary-soft text-primary-text">
						<Building2 className="size-6" aria-hidden="true" />
					</span>
					<h1 className="font-semibold text-2xl tracking-tight">
						{creatingAnother
							? "Create an organization"
							: `Welcome${user?.name ? `, ${user.name.split(" ")[0]}` : ""}!`}
					</h1>
					<p className="text-muted-foreground text-sm">
						An organization holds your channels, posts and team. You can invite teammates later.
					</p>
				</div>
				<Card>
					<CardContent>
						<form onSubmit={onSubmit} className="grid gap-4" noValidate>
							{errors.form ? <Alert tone="danger" icon={AlertCircle} title={errors.form} /> : null}
							<Field label="Organization name" htmlFor="org-name" error={errors.fields.name}>
								<Input
									id="org-name"
									placeholder="Acme Marketing"
									required
									minLength={2}
									maxLength={80}
									value={name}
									onChange={(e) => setName(e.target.value)}
									{...fieldAria("org-name", errors.fields.name)}
								/>
							</Field>
							<Field
								label="Time zone"
								htmlFor="org-timezone"
								error={errors.fields.timezone}
								hint="Your calendar and schedules use this zone."
							>
								<TimezoneSelect
									id="org-timezone"
									value={timezone}
									onValueChange={setTimezone}
									{...fieldAria("org-timezone", errors.fields.timezone, true)}
								/>
							</Field>
							<Button type="submit" size="lg" loading={pending} disabled={name.trim().length < 2}>
								Create organization
							</Button>
						</form>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
