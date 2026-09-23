"use client";

import { Badge } from "@socialfly/ui/components/badge";
import { Button } from "@socialfly/ui/components/button";
import { ConfirmDialog } from "@socialfly/ui/components/dialog";
import { EmptyState } from "@socialfly/ui/components/feedback";
import { UserRound } from "lucide-react";
import { useState } from "react";
import { useSetUserStatus, useUsers } from "@/hooks/use-admin";
import { useDebounced } from "@/hooks/use-debounced";
import type { AdminUser } from "@/lib/api-types";
import { formatDate, formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import { useMe } from "../admin-guard";
import {
	LoadMore,
	None,
	PageHeader,
	QueryError,
	SearchBox,
	TableCard,
	TableSkeleton,
	tableClass,
	tdClass,
	thClass,
} from "../common";

type Pending = { user: AdminUser; action: "disable" | "enable" };

export function UsersView() {
	const me = useMe();
	const [search, setSearch] = useState("");
	const q = useDebounced(search.trim());
	const query = useUsers(q);
	const setStatus = useSetUserStatus();
	const [pending, setPending] = useState<Pending | null>(null);
	const items = query.data?.pages.flatMap((p) => p.items) ?? [];

	const who = pending ? pending.user.name || pending.user.email : "";

	return (
		<>
			<PageHeader
				title="Users"
				description="Every account, newest first. Disabling signs someone out everywhere at once."
			/>
			<div className="mb-4">
				<SearchBox
					id="user-search"
					label="Search users"
					placeholder="Search by email or name"
					value={search}
					onChange={setSearch}
				/>
			</div>
			{query.isError && !query.data ? (
				<QueryError error={query.error} onRetry={() => void query.refetch()} />
			) : query.isPending ? (
				<TableCard>
					<TableSkeleton />
				</TableCard>
			) : items.length === 0 ? (
				<EmptyState
					icon={UserRound}
					title={q ? `No users match "${q}"` : "No users yet"}
					description={q ? "Try part of the email address or name." : undefined}
				/>
			) : (
				<TableCard>
					<table className={tableClass}>
						<caption className="sr-only">Users</caption>
						<thead>
							<tr>
								<th scope="col" className={thClass}>
									User
								</th>
								<th scope="col" className={thClass}>
									Status
								</th>
								<th scope="col" className={`${thClass} text-right`}>
									Orgs
								</th>
								<th scope="col" className={thClass}>
									Last sign-in
								</th>
								<th scope="col" className={thClass}>
									Joined
								</th>
								<th scope="col" className={`${thClass} text-right`}>
									<span className="sr-only">Actions</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{items.map((user) => {
								const self = user.id === me.id;
								const disabled = user.status === "disabled";
								return (
									<tr key={user.id} className="hover:bg-muted/40">
										<td className={tdClass}>
											<div className="flex flex-wrap items-center gap-1.5 font-medium">
												{user.name || user.email}
												{self ? <Badge tone="outline">You</Badge> : null}
											</div>
											{user.name ? (
												<div className="text-muted-foreground text-xs">{user.email}</div>
											) : null}
										</td>
										<td className={tdClass}>
											<div className="flex flex-wrap gap-1.5">
												<Badge tone={disabled ? "danger" : "success"} dot>
													{disabled ? "Disabled" : "Active"}
												</Badge>
												{user.platformRole === "admin" ? (
													<Badge tone="violet">Platform admin</Badge>
												) : null}
												{user.emailVerifiedAt ? null : <Badge tone="warning">Unverified</Badge>}
											</div>
										</td>
										<td className={`${tdClass} text-right tabular-nums`}>
											{formatNumber(user.orgCount)}
										</td>
										<td className={`${tdClass} whitespace-nowrap text-muted-foreground`}>
											{user.lastLoginAt ? (
												<span title={formatDateTime(user.lastLoginAt)}>
													{formatRelative(user.lastLoginAt)}
												</span>
											) : (
												<None label="Never" />
											)}
										</td>
										<td className={`${tdClass} whitespace-nowrap text-muted-foreground`}>
											{formatDate(user.createdAt)}
										</td>
										<td className={`${tdClass} text-right`}>
											{self ? null : disabled ? (
												<Button
													variant="outline"
													size="xs"
													onClick={() => setPending({ user, action: "enable" })}
													aria-label={`Enable ${user.email}`}
												>
													Enable
												</Button>
											) : (
												<Button
													variant="danger-outline"
													size="xs"
													onClick={() => setPending({ user, action: "disable" })}
													aria-label={`Disable ${user.email}`}
												>
													Disable
												</Button>
											)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
					<LoadMore
						hasNextPage={query.hasNextPage}
						isFetchingNextPage={query.isFetchingNextPage}
						fetchNextPage={() => void query.fetchNextPage()}
						shown={items.length}
					/>
				</TableCard>
			)}

			<ConfirmDialog
				open={pending !== null}
				onOpenChange={(open) => (open ? undefined : setPending(null))}
				title={pending?.action === "disable" ? `Disable ${who}?` : `Enable ${who}?`}
				description={
					pending?.action === "disable" ? (
						<>
							<strong>{pending.user.email}</strong> will be signed out on every device right away
							and can't sign in again until re-enabled. Their organizations and posts are kept.
						</>
					) : (
						<>
							<strong>{pending?.user.email}</strong> will be able to sign in again. Their old
							sessions stay revoked, so they sign in fresh.
						</>
					)
				}
				tone={pending?.action === "disable" ? "danger" : "primary"}
				confirmLabel={pending?.action === "disable" ? "Disable and sign out" : "Enable account"}
				loading={setStatus.isPending}
				onConfirm={async () => {
					if (!pending) return;
					try {
						await setStatus.mutateAsync({
							user: pending.user,
							status: pending.action === "disable" ? "disabled" : "active",
						});
						setPending(null);
					} catch {
						// Toasted by the mutation; keep the dialog open.
					}
				}}
			/>
		</>
	);
}
