"use client";

import { Badge } from "@socialfly/ui/components/badge";
import { Button } from "@socialfly/ui/components/button";
import { Tooltip } from "@socialfly/ui/components/controls";
import {
	ConfirmDialog,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@socialfly/ui/components/dialog";
import { Alert, EmptyState, Skeleton, Spinner } from "@socialfly/ui/components/feedback";
import { Field } from "@socialfly/ui/components/field";
import { Input } from "@socialfly/ui/components/input";
import { NativeSelect } from "@socialfly/ui/components/select";
import { toast } from "@socialfly/ui/components/toast";
import { cn } from "@socialfly/ui/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	AlertTriangle,
	BookOpen,
	Megaphone,
	Plus,
	RefreshCw,
	Trash2,
	UserRoundCog,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import {
	useAdAccounts,
	useAdIdentities,
	useAdsProviders,
	useConnectAdAccount,
} from "@/hooks/use-ads";
import { connectErrorMessage } from "@/hooks/use-connect-channel";
import { ADS_DOCS_URL, adsProviderMeta, identityLabel } from "@/lib/ads";
import { api, call, callVoid } from "@/lib/api-client";
import type { AdAccount, AdsProvider } from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { formatRelative } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import { useOrg } from "../org-provider";
import { ProviderIcon } from "../provider-icon";
import { AccountStatusBadge, AdsLayout } from "./ads-shared";

/** Toasts for the OAuth round trip (`?error=&provider=`), then cleans the URL. */
function useConnectErrorToast() {
	const params = useSearchParams();
	const router = useRouter();
	const handled = useRef(false);
	useEffect(() => {
		if (handled.current) return;
		const error = params.get("error");
		if (!error) return;
		handled.current = true;
		const provider = params.get("provider");
		toast.error(
			provider ? `Couldn't connect ${adsProviderMeta(provider).name}` : "Couldn't connect",
			{ description: connectErrorMessage(error) },
		);
		router.replace("/ads/accounts", { scroll: false });
	}, [params, router]);
}

export function AdAccountsView() {
	useConnectErrorToast();
	const accounts = useAdAccounts();

	return (
		<AdsLayout description="Ad accounts this organization can create campaigns in.">
			<section aria-labelledby="ad-accounts-heading" className="mb-10">
				<h2 id="ad-accounts-heading" className="mb-3 font-medium text-muted-foreground text-sm">
					Connected ad accounts
				</h2>
				{accounts.isPending ? (
					<div className="grid gap-2">
						{["a", "b"].map((k) => (
							<Skeleton key={k} className="h-16" />
						))}
					</div>
				) : accounts.isError ? (
					<EmptyState
						title="Couldn't load ad accounts"
						description={errorMessage(accounts.error)}
						action={
							<Button variant="outline" onClick={() => accounts.refetch()}>
								Retry
							</Button>
						}
					/>
				) : accounts.data.length === 0 ? (
					<EmptyState
						icon={Megaphone}
						title="No ad accounts yet"
						description="Connect an ad account below. Connecting never spends money — campaigns are always created paused."
					/>
				) : (
					<AccountList accounts={accounts.data} />
				)}
			</section>
			<section aria-labelledby="ad-connect-heading">
				<div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
					<h2 id="ad-connect-heading" className="font-medium text-muted-foreground text-sm">
						Ad platforms
					</h2>
					{ADS_DOCS_URL ? (
						<a
							href={ADS_DOCS_URL}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-1.5 text-muted-foreground text-xs underline-offset-2 hover:text-foreground hover:underline"
						>
							<BookOpen className="size-3.5" aria-hidden="true" />
							Setup guide for each platform
						</a>
					) : null}
				</div>
				<ProvidersGrid />
			</section>
		</AdsLayout>
	);
}

// ── Providers ────────────────────────────────────────────────────────────────

function ProvidersGrid() {
	const { can } = useOrg();
	const providers = useAdsProviders();
	const connect = useConnectAdAccount();
	const allowed = can("admin");

	if (providers.isPending) {
		return (
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{["a", "b", "c"].map((k) => (
					<Skeleton key={k} className="h-40" />
				))}
			</div>
		);
	}
	if (providers.isError) {
		return (
			<EmptyState
				title="Couldn't load ad platforms"
				description={errorMessage(providers.error)}
				action={
					<Button variant="outline" onClick={() => providers.refetch()}>
						Retry
					</Button>
				}
			/>
		);
	}

	// Ready platforms first; the rest explain what the server needs.
	const sorted = [...providers.data].sort((a, b) => Number(b.configured) - Number(a.configured));

	return (
		<ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{sorted.map((p) => (
				<ProviderCard
					key={p.id}
					provider={p}
					allowed={allowed}
					pending={connect.isPending && connect.variables === p.id}
					disabled={connect.isPending}
					onConnect={() => connect.mutate(p.id)}
				/>
			))}
		</ul>
	);
}

function ProviderCard({
	provider: p,
	allowed,
	pending,
	disabled,
	onConnect,
}: {
	provider: AdsProvider;
	allowed: boolean;
	pending: boolean;
	disabled: boolean;
	onConnect: () => void;
}) {
	const meta = adsProviderMeta(p.id);
	const button = (
		<Button
			variant="outline"
			size="sm"
			disabled={!allowed || disabled}
			loading={pending}
			onClick={onConnect}
			aria-label={`Connect ${p.displayName}`}
		>
			{pending ? null : <Plus />}
			Connect
		</Button>
	);
	return (
		<li
			className={cn(
				"flex flex-col gap-3 rounded-lg border border-border p-4",
				p.configured ? "bg-surface-raised shadow-xs" : "bg-surface",
			)}
		>
			<div className="flex items-center gap-3">
				<ProviderIcon provider={p.id} size="md" />
				<p className="flex-1 font-medium text-sm">{p.displayName}</p>
				{p.configured ? null : <Badge tone="outline">Not configured</Badge>}
			</div>
			<p className="text-muted-foreground text-xs leading-relaxed">{meta.description}</p>
			{p.configured ? (
				<div className="mt-auto">
					{allowed ? (
						button
					) : (
						<Tooltip content="Only admins can connect ad accounts">
							<span className="inline-flex">{button}</span>
						</Tooltip>
					)}
				</div>
			) : (
				<div className="mt-auto grid gap-2 text-xs">
					{meta.env.length ? (
						<div className="grid gap-1">
							<p className="text-muted-foreground">Set on the API server:</p>
							<ul className="flex flex-wrap gap-1">
								{meta.env.map((v) => (
									<li key={v}>
										<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
											{v}
										</code>
									</li>
								))}
							</ul>
						</div>
					) : null}
					{meta.approval ? (
						<p className="text-muted-foreground">
							<span className="font-medium text-foreground">Approval: </span>
							{meta.approval}
						</p>
					) : null}
					{ADS_DOCS_URL ? (
						<a
							href={ADS_DOCS_URL}
							target="_blank"
							rel="noreferrer"
							className="w-fit text-primary-text underline-offset-2 hover:underline"
						>
							How to set up {meta.name}
							<span className="sr-only"> (opens in a new tab)</span>
						</a>
					) : null}
				</div>
			)}
		</li>
	);
}

// ── Connected accounts ───────────────────────────────────────────────────────

function AccountList({ accounts }: { accounts: AdAccount[] }) {
	const { orgId } = useOrg();
	const queryClient = useQueryClient();
	const [removing, setRemoving] = useState<AdAccount | null>(null);
	const [identityFor, setIdentityFor] = useState<AdAccount | null>(null);

	const remove = useMutation({
		mutationFn: (id: string) => callVoid(api.ads.accounts[":id"].$delete({ param: { id } })),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: qk.adsAll(orgId) });
			toast.success("Ad account removed");
			setRemoving(null);
		},
		onError: (e) => toast.error(errorMessage(e)),
	});

	return (
		<>
			<ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface-raised">
				{accounts.map((a) => (
					<AccountRow
						key={a.id}
						account={a}
						onRemove={() => setRemoving(a)}
						onIdentity={() => setIdentityFor(a)}
					/>
				))}
			</ul>
			<ConfirmDialog
				open={removing !== null}
				onOpenChange={(open) => (open ? undefined : setRemoving(null))}
				title={`Remove ${removing?.name ?? "ad account"}?`}
				description="SocialFly forgets this account and its access. Campaigns already created stay on the platform — pause or delete them in its ads manager if needed. Accounts with campaigns in progress can't be removed."
				confirmLabel="Remove"
				tone="danger"
				loading={remove.isPending}
				onConfirm={() => (removing ? remove.mutate(removing.id) : undefined)}
			/>
			<IdentityDialog account={identityFor} onClose={() => setIdentityFor(null)} />
		</>
	);
}

function AccountRow({
	account: a,
	onRemove,
	onIdentity,
}: {
	account: AdAccount;
	onRemove: () => void;
	onIdentity: () => void;
}) {
	const { can } = useOrg();
	const connect = useConnectAdAccount();
	const admin = can("admin");
	const needsReauth = a.status === "needs_reauth";
	const needsIdentity = a.identityRequired.length > 0;
	const meta = adsProviderMeta(a.provider);

	return (
		<li
			className={cn(
				"grid gap-2 px-4 py-3.5",
				(needsReauth || needsIdentity) && "bg-warning-soft/30",
			)}
		>
			<div className="flex flex-wrap items-center gap-x-4 gap-y-3 sm:flex-nowrap">
				<ProviderIcon provider={a.provider} size="md" />
				<div className="grid min-w-0 flex-1 gap-0.5">
					<div className="flex min-w-0 flex-wrap items-center gap-2">
						<p className="truncate font-medium text-sm">{a.name}</p>
						<AccountStatusBadge status={a.status} />
					</div>
					<p className="truncate text-muted-foreground text-xs">
						{meta.name} · {a.currency}
						{a.timezone ? ` · ${a.timezone}` : ""} · Connected {formatRelative(a.createdAt)}
					</p>
				</div>
				{admin ? (
					<div className="ml-auto flex flex-wrap items-center gap-1.5">
						{needsReauth ? (
							<Button
								size="sm"
								loading={connect.isPending}
								onClick={() => connect.mutate(a.provider)}
							>
								<RefreshCw />
								Reconnect
							</Button>
						) : null}
						{needsIdentity || meta.identityLabels ? (
							<Button
								size="sm"
								variant={needsIdentity ? "primary" : "outline"}
								onClick={onIdentity}
							>
								<UserRoundCog />
								{needsIdentity ? "Finish setup" : "Identity"}
							</Button>
						) : null}
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={`Remove ${a.name}`}
							onClick={onRemove}
						>
							<Trash2 />
						</Button>
					</div>
				) : null}
			</div>
			{needsReauth ? (
				<p className="flex items-start gap-1.5 text-warning text-xs">
					<AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
					<span>
						{a.lastError ?? "Access expired."} Campaigns can't be created, activated or paused from
						SocialFly until you reconnect.
					</span>
				</p>
			) : a.lastError ? (
				<p className="text-danger text-xs">{a.lastError}</p>
			) : null}
			{needsIdentity ? (
				<p className="flex items-start gap-1.5 text-warning text-xs">
					<AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
					<span>
						Choose the {a.identityRequired.map((k) => identityLabel(a.provider, k)).join(" and ")}{" "}
						ads run as before creating campaigns.
					</span>
				</p>
			) : null}
		</li>
	);
}

/**
 * Picks the identity ads run as (Facebook Page, LinkedIn Page, funding source…). Keys
 * with options from the platform render as selects; the rest fall back to a text input.
 */
function IdentityDialog({ account, onClose }: { account: AdAccount | null; onClose: () => void }) {
	const { orgId } = useOrg();
	const queryClient = useQueryClient();
	const identities = useAdIdentities(account?.id ?? "", account !== null);
	const [values, setValues] = useState<Record<string, string>>({});
	const fields = identities.data?.fields ?? [];

	// Start from what's saved; the API sends each field's current value.
	useEffect(() => {
		if (!identities.data) return;
		const initial: Record<string, string> = {};
		for (const f of identities.data.fields) initial[f.key] = f.value ?? "";
		setValues(initial);
	}, [identities.data]);

	const save = useMutation({
		mutationFn: () => {
			if (!account) throw new Error("No account");
			// Only identity keys; an emptied optional field is sent as null, which removes it.
			const metadata: Record<string, string | null> = {};
			for (const f of fields) metadata[f.key] = values[f.key]?.trim() || null;
			return call(
				api.ads.accounts[":id"].$patch({ param: { id: account.id }, json: { metadata } }),
			);
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: qk.adAccounts(orgId) });
			toast.success("Ad account updated");
			onClose();
		},
	});

	const missing = fields.filter((f) => f.required && !values[f.key]?.trim());

	function onSubmit(e: FormEvent) {
		e.preventDefault();
		if (missing.length === 0) save.mutate();
	}

	return (
		<Dialog
			open={account !== null}
			onOpenChange={(open) => {
				if (!open && !save.isPending) {
					save.reset();
					onClose();
				}
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Who do these ads run as?</DialogTitle>
					<DialogDescription>
						{account
							? `${adsProviderMeta(account.provider).name} shows ads from ${account.name} as one of your pages or profiles.`
							: null}
					</DialogDescription>
				</DialogHeader>
				{identities.isPending ? (
					<div className="flex justify-center py-6">
						<Spinner label="Loading options" />
					</div>
				) : identities.isError ? (
					<Alert
						tone="danger"
						icon={AlertTriangle}
						action={
							<Button size="sm" variant="outline" onClick={() => identities.refetch()}>
								Retry
							</Button>
						}
					>
						{errorMessage(identities.error)}
					</Alert>
				) : (
					<form id="identity-form" onSubmit={onSubmit} noValidate className="grid gap-4">
						{fields.length === 0 ? (
							<p className="text-muted-foreground text-sm">This account needs no extra setup.</p>
						) : null}
						{fields.map((f) => {
							const id = `identity-${f.key}`;
							const options = f.options ?? [];
							const value = values[f.key] ?? "";
							// A saved value the platform no longer lists stays selectable.
							const listed = !value || options.some((o) => o.value === value);
							return (
								<Field
									key={f.key}
									label={f.required ? f.label : `${f.label} (optional)`}
									htmlFor={id}
									hint={
										f.hint ??
										(options.length ? undefined : "Paste the ID from the platform's ads manager.")
									}
								>
									{options.length ? (
										<NativeSelect
											id={id}
											value={value}
											onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
											aria-describedby={`${id}-hint`}
										>
											<option value="">{f.required ? "Choose…" : "None"}</option>
											{listed ? null : <option value={value}>{value}</option>}
											{options.map((o) => (
												<option key={o.value} value={o.value}>
													{o.label}
												</option>
											))}
										</NativeSelect>
									) : (
										<Input
											id={id}
											value={value}
											onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
											aria-describedby={`${id}-hint`}
										/>
									)}
								</Field>
							);
						})}
						{save.error ? (
							<Alert tone="danger" icon={AlertTriangle}>
								{errorMessage(save.error)}
							</Alert>
						) : null}
					</form>
				)}
				<DialogFooter>
					<Button variant="outline" onClick={onClose} disabled={save.isPending}>
						Cancel
					</Button>
					<Button
						type="submit"
						form="identity-form"
						loading={save.isPending}
						disabled={!identities.isSuccess || missing.length > 0}
					>
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
