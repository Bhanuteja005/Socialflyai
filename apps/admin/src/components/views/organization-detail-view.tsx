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
import { Alert, EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import { Input } from "@socialfly/ui/components/input";
import { cn } from "@socialfly/ui/utils";
import { ArrowLeft, Radio, Users } from "lucide-react";
import Link from "next/link";
import { type FormEvent, type ReactNode, useState } from "react";
import { useOrganization, useUpdateOrgBudget } from "@/hooks/use-admin";
import type { OrgChannel, OrgDetail } from "@/lib/api-types";
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
import { PageHeader, QueryError, ShortId } from "../common";
import { Distribution, Monogram } from "./parts";

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
			<CardHeader className="border-border border-b pb-4">
				<div className="flex items-center justify-between gap-2">
					<CardTitle>AI spend vs budget</CardTitle>
					<Badge tone={aiBudget.overrideUsd === null ? "neutral" : "outline"}>
						{aiBudget.overrideUsd === null ? "Server default" : "Override"}
					</Badge>
				</div>
				<CardDescription className="text-xs">
					Since <span className="font-mono">{formatDate(aiBudget.periodStart)}</span>, resets on the
					1st (UTC).
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-5">
				<div className="grid gap-2">
					<div className="flex flex-wrap items-baseline justify-between gap-2">
						<p>
							<span className="font-medium font-mono text-[26px] tabular-nums leading-8 tracking-[-0.02em]">
								{formatUsd(aiBudget.usedUsd)}
							</span>{" "}
							<span className="text-muted-foreground text-sm">
								{limit === null ? "used · no limit" : `of ${formatUsd(limit)} used`}
							</span>
						</p>
						{limit !== null && limit > 0 ? (
							<span className="font-mono text-muted-foreground text-xs tabular-nums">{pct}%</span>
						) : null}
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
									pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warning" : "bg-foreground/70",
								)}
								style={{ width: `${pct}%` }}
							/>
						</div>
					) : null}
				</div>

				<form onSubmit={onSubmit} className="grid gap-3" noValidate>
					<fieldset className="grid gap-2">
						<legend className="mb-2 font-medium text-[13px]">Monthly budget override</legend>
						{options.map((o) => (
							<label
								key={o.value}
								className={cn(
									"flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
									mode === o.value
										? "border-foreground/40 bg-surface"
										: "border-border hover:border-border-strong hover:bg-surface",
								)}
							>
								<input
									type="radio"
									name="budget-mode"
									value={o.value}
									checked={mode === o.value}
									onChange={() => setMode(o.value)}
									className="mt-0.5 accent-foreground"
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
					<div className="flex flex-wrap items-center gap-3 pt-1">
						<Button type="submit" size="sm" disabled={unchanged || Boolean(amountError)}>
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

function Section({
	title,
	count,
	children,
}: {
	title: string;
	count: number;
	children: ReactNode;
}) {
	const id = `section-${title.toLowerCase().replace(/\s+/g, "-")}`;
	return (
		<Card>
			<CardHeader className="flex-row items-center justify-between border-border border-b pb-4">
				<CardTitle id={id} className="flex items-center gap-2">
					{title}
					<Badge tone="neutral" className="font-mono tabular-nums">
						{formatNumber(count)}
					</Badge>
				</CardTitle>
			</CardHeader>
			<section aria-labelledby={id}>{children}</section>
		</Card>
	);
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className="grid min-w-0 gap-0.5">
			<dt className="truncate text-muted-foreground text-xs">{label}</dt>
			<dd className="font-mono text-lg tabular-nums leading-7">{value}</dd>
		</div>
	);
}

function ChannelRow({ channel: c }: { channel: OrgChannel }) {
	const s = statusMeta(CHANNEL_STATUS, c.status);
	const expired = c.tokenExpiresAt !== null && new Date(c.tokenExpiresAt).getTime() < Date.now();
	return (
		<li className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-surface">
			<span
				className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
				aria-hidden="true"
			>
				<Radio className="size-4" />
			</span>
			<div className="grid min-w-0 flex-1 gap-0.5">
				<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
					<span className="truncate font-medium text-sm">{c.name}</span>
					<Badge tone={s.tone} dot>
						{s.label}
					</Badge>
				</div>
				<div className="text-muted-foreground text-xs">
					{humanize(c.provider)}
					{c.username ? ` · @${c.username.replace(/^@/, "")}` : ""}
					<span aria-hidden="true"> · </span>
					{c.tokenExpiresAt ? (
						<span
							className={expired ? "text-danger" : undefined}
							title={formatDateTime(c.tokenExpiresAt)}
						>
							Token {expired ? "expired" : "expires"} {formatRelative(c.tokenExpiresAt)}
						</span>
					) : (
						<span>Token has no expiry</span>
					)}
				</div>
				{c.lastError ? (
					<p className="mt-1.5 break-words rounded-lg bg-danger-soft px-2 py-1 text-danger text-xs">
						<span className="sr-only">Last error: </span>
						{c.lastError}
					</p>
				) : null}
			</div>
		</li>
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
			<div className="grid gap-6" aria-hidden="true">
				<Skeleton className="h-4 w-28" />
				<Skeleton className="h-40 rounded-3xl" />
				<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
					<Skeleton className="h-80 rounded-2xl" />
					<Skeleton className="h-80 rounded-2xl" />
				</div>
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

	const posts = Object.values(org.postsByStatus).reduce((a, b) => a + b, 0);
	const needsReauth = org.channels.filter((c) => c.status === "needs_reauth").length;

	return (
		<>
			<div className="mb-4 text-muted-foreground text-sm">{back}</div>
			{/* Who this tenant is, then the handful of numbers support asks for first. */}
			<Card className="mb-6 overflow-hidden rounded-3xl">
				<div className="flex items-start gap-4 p-5">
					<Monogram name={org.name} size="lg" />
					<div className="grid min-w-0 flex-1 gap-1">
						<div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
							<h1 className="font-normal font-pixel text-[22px] leading-7 sm:text-[26px] sm:leading-8">
								{org.name}
							</h1>
							{org.deletedAt ? (
								<Badge tone="danger" dot>
									Deleted {formatDate(org.deletedAt)}
								</Badge>
							) : (
								<Badge tone="success" dot>
									Active
								</Badge>
							)}
						</div>
						<p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-sm">
							<code className="font-mono text-[13px]">{org.slug}</code>
							<span aria-hidden="true">·</span>
							<span>{org.timezone}</span>
							<span aria-hidden="true">·</span>
							<span>
								Created <span className="font-mono">{formatDate(org.createdAt)}</span>
							</span>
							<span aria-hidden="true">·</span>
							<ShortId id={org.id} />
						</p>
					</div>
				</div>
				<dl className="grid grid-cols-2 gap-4 border-border border-t bg-surface px-5 py-4 sm:grid-cols-4">
					<Fact label="Members" value={formatNumber(org.members.length)} />
					<Fact
						label="Channels"
						value={
							<span className="flex flex-wrap items-baseline gap-x-2">
								{formatNumber(org.channels.length)}
								{needsReauth ? (
									<span className="font-sans text-warning text-xs">
										{needsReauth} need{needsReauth === 1 ? "s" : ""} reconnect
									</span>
								) : null}
							</span>
						}
					/>
					<Fact label="Posts" value={formatNumber(posts)} />
					<Fact label="AI spend this month" value={formatUsd(org.aiBudget.usedUsd)} />
				</dl>
			</Card>
			{org.deletedAt ? (
				<Alert tone="warning" className="mb-6" title="This organization is deleted">
					It is kept for history; its members can no longer use it.
				</Alert>
			) : null}
			<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
				<div className="grid min-w-0 gap-6">
					<Section title="Channels" count={org.channels.length}>
						{org.channels.length === 0 ? (
							<div className="p-5">
								<EmptyState icon={Radio} title="No channels connected" compact />
							</div>
						) : (
							<ul className="divide-y divide-border">
								{org.channels.map((c) => (
									<ChannelRow key={c.id} channel={c} />
								))}
							</ul>
						)}
					</Section>

					<Section title="Members" count={org.members.length}>
						{org.members.length === 0 ? (
							<div className="p-5">
								<EmptyState icon={Users} title="No members" compact />
							</div>
						) : (
							<ul className="divide-y divide-border">
								{org.members.map((m) => (
									<li
										key={m.userId}
										className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface"
									>
										<Avatar name={m.name || m.email} size="sm" />
										<div className="grid min-w-0 flex-1 gap-0.5">
											<div className="truncate font-medium text-sm">{m.name || m.email}</div>
											<div className="truncate text-muted-foreground text-xs">
												{m.name ? `${m.email} · ` : ""}Joined {formatDate(m.joinedAt)}
											</div>
										</div>
										<Badge tone={m.role === "owner" ? "outline" : "neutral"}>
											{humanize(m.role)}
										</Badge>
									</li>
								))}
							</ul>
						)}
					</Section>
				</div>

				<div className="grid min-w-0 gap-6">
					<BudgetCard key={`${org.aiBudget.overrideUsd}`} org={org} />
					<Card>
						<CardHeader className="flex-row items-center justify-between border-border border-b pb-4">
							<CardTitle>Posts by status</CardTitle>
							<span className="text-muted-foreground text-xs">
								<span className="font-mono text-foreground tabular-nums">
									{formatNumber(posts)}
								</span>{" "}
								posts
							</span>
						</CardHeader>
						<CardContent>
							<Distribution
								counts={org.postsByStatus}
								meta={(k) => statusMeta(POST_STATUS, k)}
								hideEmpty
							/>
						</CardContent>
					</Card>
				</div>
			</div>
		</>
	);
}
