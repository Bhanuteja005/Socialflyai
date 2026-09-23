"use client";

import { Badge } from "@socialfly/ui/components/badge";
import { Button } from "@socialfly/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@socialfly/ui/components/card";
import { Skeleton } from "@socialfly/ui/components/feedback";
import { Field, fieldAria } from "@socialfly/ui/components/field";
import { Input } from "@socialfly/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@socialfly/ui/components/select";
import { toast } from "@socialfly/ui/components/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useInvitations } from "@/hooks/queries";
import { useFormErrors } from "@/hooks/use-form-errors";
import { api, call, callVoid } from "@/lib/api-client";
import type { Invitation } from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { formatRelative } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import { ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/status";
import { useOrg } from "../org-provider";

type InviteRole = "admin" | "editor" | "viewer";
const INVITE_ROLES: InviteRole[] = ["editor", "viewer", "admin"];

export function Invitations() {
	const { orgId } = useOrg();
	const queryClient = useQueryClient();
	const invitations = useInvitations(true);
	const errors = useFormErrors();
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<InviteRole>("editor");

	const invite = useMutation({
		mutationFn: () =>
			call(api.organization.invitations.$post({ json: { email: email.trim(), role } })),
		onSuccess: (created) => {
			queryClient.setQueryData<{ invitations: Invitation[] }>(qk.invitations(orgId), (prev) => ({
				invitations: [
					...(prev?.invitations ?? []).filter((i) => i.email !== created.email),
					created,
				],
			}));
			toast.success(`Invitation sent to ${created.email}`);
			setEmail("");
		},
		onError: (e) => errors.fromError(e),
	});

	const revoke = useMutation({
		mutationFn: (id: string) =>
			callVoid(api.organization.invitations[":id"].$delete({ param: { id } })),
		onMutate: async (id) => {
			const key = qk.invitations(orgId);
			await queryClient.cancelQueries({ queryKey: key });
			const previous = queryClient.getQueryData<{ invitations: Invitation[] }>(key);
			queryClient.setQueryData<{ invitations: Invitation[] }>(key, (prev) =>
				prev ? { invitations: prev.invitations.filter((i) => i.id !== id) } : prev,
			);
			return { previous };
		},
		onError: (e, _id, ctx) => {
			if (ctx?.previous) queryClient.setQueryData(qk.invitations(orgId), ctx.previous);
			toast.error(errorMessage(e));
		},
		onSuccess: () => toast.success("Invitation revoked"),
	});

	function onSubmit(event: FormEvent) {
		event.preventDefault();
		errors.reset();
		invite.mutate();
	}

	const emailError = errors.fields.email ?? errors.form;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Invite people</CardTitle>
				<CardDescription>
					They'll get an email with a link to join. Invitations expire after a while.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-5">
				<form
					onSubmit={onSubmit}
					className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px_auto] sm:items-start"
					noValidate
				>
					<Field label="Email" htmlFor="invite-email" error={emailError}>
						<Input
							id="invite-email"
							type="email"
							placeholder="teammate@company.com"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							{...fieldAria("invite-email", emailError)}
						/>
					</Field>
					<Field label="Role" htmlFor="invite-role">
						<Select value={role} onValueChange={(v) => setRole(v as InviteRole)}>
							<SelectTrigger id="invite-role">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{INVITE_ROLES.map((r) => (
									<SelectItem key={r} value={r}>
										{ROLE_LABEL[r]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</Field>
					<Button
						type="submit"
						className="sm:mt-5.5"
						loading={invite.isPending}
						disabled={!email.trim()}
					>
						<Mail />
						Send invite
					</Button>
				</form>
				<p className="-mt-2 text-muted-foreground text-xs">{ROLE_DESCRIPTION[role]}</p>

				<div className="grid gap-2">
					<h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
						Pending
					</h3>
					{invitations.isPending ? (
						<Skeleton className="h-10" />
					) : invitations.data?.length ? (
						<ul className="divide-y divide-border rounded-md border border-border">
							{invitations.data.map((inv) => (
								<li key={inv.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
									<span className="min-w-0 flex-1 truncate text-sm">{inv.email}</span>
									<Badge tone="outline">{ROLE_LABEL[inv.role]}</Badge>
									<span className="text-muted-foreground text-xs">
										expires {formatRelative(inv.expiresAt)}
									</span>
									<Button
										variant="ghost"
										size="icon-xs"
										aria-label={`Revoke invitation for ${inv.email}`}
										onClick={() => revoke.mutate(inv.id)}
									>
										<X />
									</Button>
								</li>
							))}
						</ul>
					) : (
						<p className="text-muted-foreground text-sm">No pending invitations.</p>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
