"use client";

import { Avatar } from "@socialfly/ui/components/avatar";
import { Badge } from "@socialfly/ui/components/badge";
import { Button } from "@socialfly/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@socialfly/ui/components/card";
import { ConfirmDialog } from "@socialfly/ui/components/dialog";
import { Skeleton } from "@socialfly/ui/components/feedback";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@socialfly/ui/components/select";
import { toast } from "@socialfly/ui/components/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LogOut, UserMinus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMembers } from "@/hooks/queries";
import { useCurrentUser } from "@/hooks/use-session";
import { api, callVoid, setApiOrganization } from "@/lib/api-client";
import type { Member, Role } from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import { ROLE_LABEL } from "@/lib/status";
import { clearStoredOrg, useOrg } from "../org-provider";
import { PageHeader } from "../page-header";
import { Invitations } from "./invitations";
import { SettingsNav } from "./settings-nav";

export function TeamSettings() {
	const { orgId, org, can } = useOrg();
	const user = useCurrentUser();
	const members = useMembers();
	const queryClient = useQueryClient();
	const router = useRouter();
	const [removing, setRemoving] = useState<Member | null>(null);
	const owner = can("owner");
	const admin = can("admin");

	const changeRole = useMutation({
		mutationFn: (v: { userId: string; role: Role }) =>
			callVoid(
				api.organization.members[":userId"].$patch({
					param: { userId: v.userId },
					json: { role: v.role },
				}),
			),
		onMutate: async ({ userId, role }) => {
			const key = qk.members(orgId);
			await queryClient.cancelQueries({ queryKey: key });
			const previous = queryClient.getQueryData<{ members: Member[] }>(key);
			queryClient.setQueryData<{ members: Member[] }>(key, (prev) =>
				prev
					? { members: prev.members.map((m) => (m.userId === userId ? { ...m, role } : m)) }
					: prev,
			);
			return { previous };
		},
		onError: (e, _v, ctx) => {
			if (ctx?.previous) queryClient.setQueryData(qk.members(orgId), ctx.previous);
			toast.error(errorMessage(e));
		},
		onSuccess: () => toast.success("Role updated"),
		onSettled: () => queryClient.invalidateQueries({ queryKey: qk.members(orgId) }),
	});

	const remove = useMutation({
		mutationFn: (userId: string) =>
			callVoid(api.organization.members[":userId"].$delete({ param: { userId } })),
		onSuccess: async (_, userId) => {
			setRemoving(null);
			if (userId === user?.id) {
				setApiOrganization(null);
				clearStoredOrg();
				queryClient.removeQueries({ queryKey: ["org"] });
				await queryClient.invalidateQueries({ queryKey: qk.organizations });
				toast.success(`You left ${org.name}`);
				router.replace("/dashboard");
				return;
			}
			void queryClient.invalidateQueries({ queryKey: qk.members(orgId) });
			toast.success("Member removed");
		},
		onError: (e) => {
			setRemoving(null);
			toast.error(errorMessage(e));
		},
	});

	// Owners manage everyone; admins manage non-owners. Only owners can hand out "owner".
	const canManage = (m: Member) => m.userId !== user?.id && admin && (owner || m.role !== "owner");
	const roleOptions: Role[] = owner
		? ["owner", "admin", "editor", "viewer"]
		: ["admin", "editor", "viewer"];
	const leaving = removing?.userId === user?.id;

	return (
		<div className="max-w-3xl">
			<PageHeader title="Settings" />
			<SettingsNav />
			<div className="grid gap-6">
				<Card>
					<CardHeader>
						<CardTitle>Members</CardTitle>
						<CardDescription>
							Viewers can only look. Editors create and publish posts. Admins also manage channels,
							team and settings.
						</CardDescription>
					</CardHeader>
					<CardContent className="px-0 pb-2">
						{members.isPending ? (
							<div className="grid gap-2 px-5">
								{["a", "b", "c"].map((k) => (
									<Skeleton key={k} className="h-12" />
								))}
							</div>
						) : (
							<ul className="divide-y divide-border">
								{members.data?.map((m) => {
									const self = m.userId === user?.id;
									return (
										<li key={m.userId} className="flex flex-wrap items-center gap-3 px-5 py-3">
											<Avatar src={m.avatarUrl} name={m.name ?? m.email} />
											<div className="grid min-w-0 flex-1">
												<p className="flex items-center gap-2 truncate font-medium text-sm">
													{m.name ?? m.email}
													{self ? <Badge tone="outline">You</Badge> : null}
												</p>
												<p className="truncate text-muted-foreground text-xs">
													{m.email} · joined {formatDate(m.joinedAt)}
												</p>
											</div>
											{canManage(m) ? (
												<Select
													value={m.role}
													onValueChange={(role) =>
														changeRole.mutate({ userId: m.userId, role: role as Role })
													}
												>
													<SelectTrigger
														className="h-8 w-28"
														aria-label={`Role for ${m.name ?? m.email}`}
													>
														<SelectValue />
													</SelectTrigger>
													<SelectContent align="end">
														{roleOptions.map((r) => (
															<SelectItem key={r} value={r}>
																{ROLE_LABEL[r]}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											) : (
												<Badge tone={m.role === "owner" ? "primary" : "neutral"}>
													{ROLE_LABEL[m.role]}
												</Badge>
											)}
											{canManage(m) || self ? (
												<Button
													variant="ghost"
													size="icon-sm"
													aria-label={self ? "Leave organization" : `Remove ${m.name ?? m.email}`}
													onClick={() => setRemoving(m)}
												>
													{self ? <LogOut /> : <UserMinus />}
												</Button>
											) : null}
										</li>
									);
								})}
							</ul>
						)}
					</CardContent>
				</Card>

				{admin ? <Invitations /> : null}
			</div>

			<ConfirmDialog
				open={removing !== null}
				onOpenChange={(open) => (open ? undefined : setRemoving(null))}
				title={leaving ? `Leave ${org.name}?` : `Remove ${removing?.name ?? removing?.email}?`}
				description={
					leaving
						? "You'll lose access to its channels and posts until someone invites you again."
						: "They'll lose access immediately. Posts they created stay."
				}
				confirmLabel={leaving ? "Leave" : "Remove"}
				tone="danger"
				loading={remove.isPending}
				onConfirm={() => (removing ? remove.mutate(removing.userId) : undefined)}
			/>
		</div>
	);
}
