"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, fieldAria } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useFormErrors } from "@/hooks/use-form-errors";
import { api, call, callVoid, setApiOrganization } from "@/lib/api-client";
import type { Organization } from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { qk } from "@/lib/query-keys";
import { clearStoredOrg, useOrg } from "../org-provider";
import { PageHeader } from "../page-header";
import { TimezoneSelect } from "../timezone-select";
import { SettingsNav } from "./settings-nav";

export function OrganizationSettings() {
	const { org, can, organizations } = useOrg();
	const queryClient = useQueryClient();
	const router = useRouter();
	const errors = useFormErrors();
	const [name, setName] = useState(org.name);
	const [timezone, setTimezone] = useState(org.timezone);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [confirmName, setConfirmName] = useState("");
	const admin = can("admin");

	useEffect(() => {
		setName(org.name);
		setTimezone(org.timezone);
	}, [org.name, org.timezone]);

	const save = useMutation({
		mutationFn: (input: { name?: string; timezone?: string }) =>
			call(api.organization.$patch({ json: input })),
		onSuccess: (updated) => {
			queryClient.setQueryData<{ organizations: Organization[] }>(qk.organizations, (prev) =>
				prev
					? { organizations: prev.organizations.map((o) => (o.id === updated.id ? updated : o)) }
					: prev,
			);
			// Calendar buckets and schedules depend on the zone.
			void queryClient.invalidateQueries({ queryKey: qk.postsAll(org.id) });
			toast.success("Organization updated");
		},
		onError: (e) => errors.fromError(e),
	});

	const remove = useMutation({
		mutationFn: () => callVoid(api.organization.$delete()),
		onSuccess: async () => {
			setApiOrganization(null);
			clearStoredOrg();
			queryClient.removeQueries({ queryKey: ["org"] });
			await queryClient.invalidateQueries({ queryKey: qk.organizations });
			toast.success(`${org.name} was deleted`);
			router.replace(organizations.length > 1 ? "/dashboard" : "/onboarding");
		},
		onError: (e) => toast.error(errorMessage(e)),
	});

	const changed = name.trim() !== org.name || timezone !== org.timezone;

	function onSubmit(event: FormEvent) {
		event.preventDefault();
		errors.reset();
		save.mutate({
			...(name.trim() !== org.name ? { name: name.trim() } : {}),
			...(timezone !== org.timezone ? { timezone } : {}),
		});
	}

	return (
		<div className="max-w-3xl">
			<PageHeader title="Settings" />
			<SettingsNav />
			<div className="grid gap-6">
				<Card>
					<form onSubmit={onSubmit} noValidate>
						<CardHeader>
							<CardTitle>General</CardTitle>
							<CardDescription>
								{admin
									? "How this organization appears to your team."
									: "Only admins can change these settings."}
							</CardDescription>
						</CardHeader>
						<CardContent className="grid gap-4 sm:grid-cols-2">
							<Field label="Name" htmlFor="org-name" error={errors.fields.name ?? errors.form}>
								<Input
									id="org-name"
									value={name}
									disabled={!admin}
									maxLength={80}
									onChange={(e) => setName(e.target.value)}
									{...fieldAria("org-name", errors.fields.name ?? errors.form)}
								/>
							</Field>
							<Field
								label="Time zone"
								htmlFor="org-tz"
								error={errors.fields.timezone}
								hint="Used by the calendar and when picking schedule times."
							>
								<TimezoneSelect
									id="org-tz"
									value={timezone}
									onValueChange={setTimezone}
									disabled={!admin}
								/>
							</Field>
						</CardContent>
						{admin ? (
							<CardFooter>
								<Button
									type="submit"
									loading={save.isPending}
									disabled={!changed || name.trim().length < 2}
								>
									Save changes
								</Button>
							</CardFooter>
						) : null}
					</form>
				</Card>

				{can("owner") ? (
					<Card className="border-danger/30">
						<CardHeader>
							<CardTitle>Delete organization</CardTitle>
							<CardDescription>
								Permanently removes the organization, its channels, scheduled posts and media for
								everyone. This can't be undone.
							</CardDescription>
						</CardHeader>
						<CardFooter className="justify-start border-danger/20 bg-danger-soft/40">
							<Button variant="danger" onClick={() => setDeleteOpen(true)}>
								Delete {org.name}
							</Button>
						</CardFooter>
					</Card>
				) : null}
			</div>

			<ConfirmDialog
				open={deleteOpen}
				onOpenChange={(open) => {
					setDeleteOpen(open);
					if (!open) setConfirmName("");
				}}
				title={`Delete ${org.name}?`}
				description="Scheduled posts will not be published. Posts already live stay on the platforms."
				confirmLabel="Delete organization"
				tone="danger"
				loading={remove.isPending}
				confirmDisabled={confirmName !== org.name}
				onConfirm={() => remove.mutate()}
			>
				<Field label={`Type “${org.name}” to confirm`} htmlFor="confirm-org-name">
					<Input
						id="confirm-org-name"
						value={confirmName}
						onChange={(e) => setConfirmName(e.target.value)}
						autoComplete="off"
					/>
				</Field>
			</ConfirmDialog>
		</div>
	);
}
