"use client";

import { Button } from "@socialfly/ui/components/button";
import { Card, CardContent } from "@socialfly/ui/components/card";
import { Alert } from "@socialfly/ui/components/feedback";
import { Field, fieldAria } from "@socialfly/ui/components/field";
import { Input } from "@socialfly/ui/components/input";
import { toast } from "@socialfly/ui/components/toast";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, Building2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
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
		<div className="relative flex min-h-dvh flex-col overflow-hidden bg-canvas px-4 py-6">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-x-0 top-0 h-[420px] [mask-image:radial-gradient(ellipse_70%_100%_at_50%_0%,black_10%,transparent_75%)]"
			>
				<div className="bg-glow absolute inset-0" />
			</div>
			<div className="relative mx-auto flex w-full max-w-5xl items-center justify-between">
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
			<div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
				{creatingAnother ? null : (
					<ol
						className="mb-8 flex items-center justify-center gap-2 text-xs"
						aria-label="Setup steps"
					>
						{["Workspace", "Channels", "Team"].map((step, i) => (
							<li key={step} className="flex items-center gap-2">
								<span
									className={
										i === 0
											? "flex items-center gap-1.5 rounded-full bg-ink px-2.5 py-1 font-medium text-ink-foreground"
											: "flex items-center gap-1.5 rounded-full border border-border bg-surface-raised px-2.5 py-1 text-muted-foreground"
									}
									aria-current={i === 0 ? "step" : undefined}
								>
									<span className="tabular-nums">{i + 1}</span>
									{step}
								</span>
								{i < 2 ? <span className="h-px w-5 bg-border-strong" aria-hidden="true" /> : null}
							</li>
						))}
					</ol>
				)}
				<div className="mb-6 grid justify-items-center gap-3 text-center">
					<span className="flex size-12 items-center justify-center rounded-2xl border border-border bg-surface-raised text-primary-text shadow-sm">
						<Building2 className="size-6" aria-hidden="true" />
					</span>
					<h1 className="font-semibold text-[26px] tracking-[-0.02em]">
						{creatingAnother
							? "Create an organization"
							: `Welcome${user?.name ? `, ${user.name.split(" ")[0]}` : ""}!`}
					</h1>
					<p className="text-muted-foreground text-sm">
						An organization holds your channels, posts and team. You can invite teammates later.
					</p>
				</div>
				<Card className="shadow-panel">
					<CardContent className="p-6">
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
