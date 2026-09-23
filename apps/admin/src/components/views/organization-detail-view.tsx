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
import { ConfirmDialog } from "@socialfly/ui/components/dialog";
import { Alert, EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import { Input } from "@socialfly/ui/components/input";
import { cn } from "@socialfly/ui/utils";
import { ArrowLeft, Radio, Users } from "lucide-react";
import Link from "next/link";
import { type FormEvent, type ReactNode, useState } from "react";
import { useOrganization, useUpdateOrgBudget } from "@/hooks/use-admin";
import type { OrgDetail } from "@/lib/api-types";
import { isApiError } from "@/lib/errors";
import {
	formatDate,
	formatDateTime,
	formatNumber,
	formatRelative,
	formatUsd,
	humanize,
} from "@/lib/format";
import { CHANNEL_STATUS, POST_STATUS, statusMeta } from "@/lib/status";
import { None, PageHeader, QueryError, TableCard, tableClass, tdClass, thClass } from "../common";

type Mode = "default" | "unlimited" | "custom";

const MAX_BUDGET = 1_000_000;

function describeOverride(value: number | null) {
	if (value === null) return "the server default";
	if (value === 0) return "unlimited";
	return `${formatUsd(value)} per month`;
}

function BudgetCard({ org }: { org: OrgDetail }) {
	const { aiBudget } = org;
	const initialMode: Mode =
		aiBudget.overrideUsd === null ? "default" : aiBudget.overrideUsd === 0 ? "unlimited" : "custom";
	const [mode, setMode] = useState<Mode>(initialMode);
	const [amount, setAmount] = useState(aiBudget.overrideUsd ? String(aiBudget.overrideUsd) : "");
	const [confirming, setConfirming] = useState(false);
	const update = useUpdateOrgBudget(org.id);

	const parsed = Number(amount);
	const amountError =
		mode !== "custom"
			? null
			: amount.trim() === ""
				? "Enter a monthly amount in USD."
				: !Number.isFinite(parsed) || parsed <= 0
					? "Enter an amount above $0 (use Unlimited for no cap)."
					: parsed > MAX_BUDGET
						? `The maximum is ${formatUsd(MAX_BUDGET)}.`
						: null;
	const next: number | null =
		mode === "default" ? null : mode === "unlimited" ? 0 : Math.round(parsed * 100) / 100;
	const unchanged = next === aiBudget.overrideUsd;

	const limit = aiBudget.limitUsd;
	const pct = limit && limit > 0 ? Math.min(100, Math.round((aiBudget.usedUsd / limit) * 100)) : 0;

	function onSubmit(event: FormEvent) {
		event.preventDefault();
		if (amountError || unchanged) return;
		setConfirming(true);
	}

	const options: { value: Mode; label: string; hint: string }[] = [
		{ value: "default", label: "Use default", hint: "Follow the server-wide monthly budget." },
		{ value: "unlimited", label: "Unlimited", hint: "No cap for this organization." },
		{
			value: "custom",
			label: "Custom amount",
			hint: "A monthly cap in USD for this organization.",
		},
	];

	return (
		<Card>
			<CardHeader>
				<CardTitle>AI spend vs budget</CardTitle>
				<CardDescription>
					Since {formatDate(aiBudget.periodStart)} (resets on the 1st, UTC). Enforced before every
					paid AI call.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-5">
				<div className="grid gap-2">
					<div className="flex flex-wrap items-baseline justify-between gap-2">
						<p>
							<span className="font-semibold text-2xl tabular-nums">
								{formatUsd(aiBudget.usedUsd)}
							</span>{" "}
							<span className="text-muted-foreground text-sm">
								{limit === null ? "used · no limit" : `of ${formatUsd(limit)} used`}
							</span>
						</p>
						<Badge tone={aiBudget.overrideUsd === null ? "neutral" : "violet"}>
							{aiBudget.overrideUsd === null ? "Server default" : "Override"}
						</Badge>
					</div>
					{limit !== null && limit > 0 ? (
						<div
							className="h-2 overflow-hidden rounded-full bg-muted"
							role="progressbar"
							aria-label="AI budget used"
							aria-valuemin={0}
							aria-valuemax={100}
							aria-valuenow={pct}
						>
							<div
								className={cn(
									"h-full rounded-full",
									pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warning" : "bg-primary",
								)}
								style={{ width: `${pct}%` }}
							/>
						</div>
					) : null}
				</div>

				<form onSubmit={onSubmit} className="grid gap-3" noValidate>
					<fieldset className="grid gap-2">
						<legend className="mb-2 font-medium text-sm">Monthly budget override</legend>
						{options.map((o) => (
							<label
								key={o.value}
								className={cn(
									"flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors",
									mode === o.value ? "border-ring bg-muted/50" : "border-border hover:bg-muted/40",
								)}
							>
								<input
									type="radio"
									name="budget-mode"
									value={o.value}
									checked={mode === o.value}
									onChange={() => setMode(o.value)}
									className="mt-0.5 accent-current"
								/>
								<span className="grid gap-0.5">
									<span className="font-medium">{o.label}</span>
									<span className="text-muted-foreground text-xs">{o.hint}</span>
								</span>
							</label>
						))}
					</fieldset>
					{mode === "custom" ? (
						<div className="grid gap-1.5">
							<label htmlFor="budget-amount" className="font-medium text-sm">
								Amount (USD per month)
							</label>
							<div className="relative max-w-48">
								<span
									className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground text-sm"
									aria-hidden="true"
								>
									$
								</span>
								<Input
									id="budget-amount"
									type="number"
									inputMode="decimal"
									min={0.01}
									max={MAX_BUDGET}
									step={0.01}
									className="pl-7"
									value={amount}
									onChange={(e) => setAmount(e.target.value)}
									aria-invalid={amountError && amount ? true : undefined}
									aria-describedby={amountError ? "budget-amount-error" : undefined}
								/>
							</div>
							{amountError && amount ? (
								<p id="budget-amount-error" className="text-danger text-xs">
									{amountError}
								</p>
							) : null}
						</div>
					) : null}
					<div className="flex flex-wrap items-center gap-2">
						<Button type="submit" disabled={unchanged || Boolean(amountError)}>
							Save budget
						</Button>
						{unchanged ? (
							<span className="text-muted-foreground text-xs">
								Currently {describeOverride(aiBudget.overrideUsd)}.
							</span>
						) : null}
					</div>
				</form>
			</CardContent>
			<ConfirmDialog
				open={confirming}
				onOpenChange={setConfirming}
				title={`Change ${org.name}'s AI budget?`}
				description={
					<>
						From <strong>{describeOverride(aiBudget.overrideUsd)}</strong> to{" "}
						<strong>{describeOverride(next)}</strong>. It applies to the organization's next AI
						request and is recorded in the audit log.
					</>
				}
				confirmLabel="Change budget"
				loading={update.isPending}
				onConfirm={async () => {
					try {
						await update.mutateAsync(next);
						setConfirming(false);
					} catch {
						// The mutation's onError already toasted; keep the dialog open to retry.
					}
				}}
			/>
		</Card>
	);
}

function PostsByStatus({ counts }: { counts: Record<string, number> }) {
	const entries = Object.entries(counts).filter(([, n]) => n > 0);
	return (
		<Card>
			<CardHeader>
				<CardTitle>Posts by status</CardTitle>
			</CardHeader>
			<CardContent>
				{entries.length === 0 ? (
					<p className="text-muted-foreground text-sm">No posts yet.</p>
				) : (
					<dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
						{entries.map(([key, n]) => {
							const m = statusMeta(POST_STATUS, key);
							return (
								<div key={key} className="flex items-center justify-between gap-2">
									<dt>
										<Badge tone={m.tone} dot>
											{m.label}
										</Badge>
									</dt>
									<dd className="text-sm tabular-nums">{formatNumber(n)}</dd>
								</div>
							);
						})}
					</dl>
				)}
			</CardContent>
		</Card>
	);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
	const id = `section-${title.toLowerCase().replace(/\s+/g, "-")}`;
	return (
		<section aria-labelledby={id} className="grid gap-3">
			<h2 id={id} className="font-semibold text-[15px] tracking-tight">
				{title}
			</h2>
			{children}
		</section>
	);
}

export function OrganizationDetailView({ id }: { id: string }) {
	const { data: org, error, isPending, refetch } = useOrganization(id);

	const back = (
		<Link
			href="/organizations"
			className="inline-flex items-center gap-1 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
		>
			<ArrowLeft className="size-3.5" aria-hidden="true" />
			Organizations
		</Link>
	);

	if (isPending) {
		return (
			<div className="grid gap-4">
				<Skeleton className="h-10 w-64" />
				<Skeleton className="h-48" />
				<Skeleton className="h-48" />
			</div>
		);
	}
	if (error || !org) {
		return (
			<>
				<PageHeader eyebrow={back} title="Organization" />
				{isApiError(error) && (error.status === 404 || error.status === 422) ? (
					<EmptyState
						title="Organization not found"
						description="It may have been removed, or the link is wrong."
					/>
				) : (
					<QueryError error={error} onRetry={() => void refetch()} />
				)}
			</>
		);
	}

	return (
		<>
			<PageHeader
				eyebrow={back}
				title={org.name}
				description={
					<>
						<span className="font-mono">{org.slug}</span> · {org.timezone} · created{" "}
						{formatDate(org.createdAt)}
					</>
				}
				actions={
					org.deletedAt ? <Badge tone="danger">Deleted {formatDate(org.deletedAt)}</Badge> : null
				}
			/>
			{org.deletedAt ? (
				<Alert tone="warning" className="mb-6" title="This organization is deleted">
					It is kept for history; its members can no longer use it.
				</Alert>
			) : null}
			<div className="grid gap-8">
				<div className="grid gap-6 lg:grid-cols-2">
					<BudgetCard key={`${org.aiBudget.overrideUsd}`} org={org} />
					<PostsByStatus counts={org.postsByStatus} />
				</div>

				<Section title={`Members (${org.members.length})`}>
					{org.members.length === 0 ? (
						<EmptyState icon={Users} title="No members" compact />
					) : (
						<TableCard>
							<table className={tableClass}>
								<thead>
									<tr>
										<th scope="col" className={thClass}>
											Member
										</th>
										<th scope="col" className={thClass}>
											Role
										</th>
										<th scope="col" className={thClass}>
											Joined
										</th>
									</tr>
								</thead>
								<tbody>
									{org.members.map((m) => (
										<tr key={m.userId}>
											<td className={tdClass}>
												<div className="font-medium">{m.name || m.email}</div>
												{m.name ? (
													<div className="text-muted-foreground text-xs">{m.email}</div>
												) : null}
											</td>
											<td className={tdClass}>
												<Badge tone={m.role === "owner" ? "primary" : "neutral"}>
													{humanize(m.role)}
												</Badge>
											</td>
											<td className={`${tdClass} text-muted-foreground`}>
												{formatDate(m.joinedAt)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</TableCard>
					)}
				</Section>

				<Section title={`Channels (${org.channels.length})`}>
					{org.channels.length === 0 ? (
						<EmptyState icon={Radio} title="No channels connected" compact />
					) : (
						<TableCard>
							<table className={tableClass}>
								<thead>
									<tr>
										<th scope="col" className={thClass}>
											Channel
										</th>
										<th scope="col" className={thClass}>
											Status
										</th>
										<th scope="col" className={thClass}>
											Last error
										</th>
										<th scope="col" className={thClass}>
											Token expires
										</th>
									</tr>
								</thead>
								<tbody>
									{org.channels.map((c) => {
										const s = statusMeta(CHANNEL_STATUS, c.status);
										const expired =
											c.tokenExpiresAt !== null &&
											new Date(c.tokenExpiresAt).getTime() < Date.now();
										return (
											<tr key={c.id}>
												<td className={tdClass}>
													<div className="font-medium">{c.name}</div>
													<div className="text-muted-foreground text-xs">
														{humanize(c.provider)}
														{c.username ? ` · @${c.username.replace(/^@/, "")}` : ""}
													</div>
												</td>
												<td className={tdClass}>
													<Badge tone={s.tone} dot>
														{s.label}
													</Badge>
												</td>
												<td className={`${tdClass} max-w-sm`}>
													{c.lastError ? (
														<span className="break-words text-danger text-xs">{c.lastError}</span>
													) : (
														<None />
													)}
												</td>
												<td className={`${tdClass} whitespace-nowrap`}>
													{c.tokenExpiresAt ? (
														<span
															className={expired ? "text-danger" : "text-muted-foreground"}
															title={formatDateTime(c.tokenExpiresAt)}
														>
															{expired ? "Expired " : ""}
															{formatRelative(c.tokenExpiresAt)}
														</span>
													) : (
														<None label="No expiry" />
													)}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</TableCard>
					)}
				</Section>
			</div>
		</>
	);
}
