"use client";

import { Badge } from "@socialfly/ui/components/badge";
import { Button } from "@socialfly/ui/components/button";
import { Card, CardFooter } from "@socialfly/ui/components/card";
import { Checkbox } from "@socialfly/ui/components/controls";
import { EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import { toast } from "@socialfly/ui/components/toast";
import { cn } from "@socialfly/ui/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, PauseCircle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { usePendingAdAccounts } from "@/hooks/use-ads";
import { adsProviderMeta } from "@/lib/ads";
import { api, call } from "@/lib/api-client";
import { errorMessage, isApiError } from "@/lib/errors";
import { pluralize } from "@/lib/format";
import { qk } from "@/lib/query-keys";
import { useOrg } from "../org-provider";
import { PageHeader } from "../page-header";
import { ProviderIcon } from "../provider-icon";

/** Where the ad-platform OAuth callback lands: pick which of the login's ad accounts to add. */
export function ConnectAdAccounts() {
	const params = useSearchParams();
	const pendingKey = params.get("pending") ?? "";
	const { orgId, can } = useOrg();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [chosen, setChosen] = useState<Set<string>>(new Set());
	const admin = can("admin");
	const connectError = params.get("error");

	// A failed OAuth round trip lands here too; the Accounts tab explains it and offers a retry.
	useEffect(() => {
		if (!connectError) return;
		const next = new URLSearchParams({ error: connectError });
		const provider = params.get("provider");
		if (provider) next.set("provider", provider);
		router.replace(`/ads/accounts?${next}`);
	}, [connectError, params, router]);

	const { data, isPending, isError, error } = usePendingAdAccounts(
		pendingKey,
		pendingKey.length >= 8 && admin && !connectError,
	);

	// Preselect every account that can run campaigns right now.
	useEffect(() => {
		if (data)
			setChosen(
				new Set(
					data.accounts
						.filter((a) => a.status === "active" && !a.alreadyConnected)
						.map((a) => a.externalId),
				),
			);
	}, [data]);

	const confirm = useMutation({
		mutationFn: () =>
			call(api.ads.accounts.$post({ json: { pendingKey, externalIds: [...chosen] } })),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: qk.adsAll(orgId) });
			toast.success(`${pluralize(chosen.size, "ad account")} connected`);
			router.replace("/ads/accounts");
		},
		onError: (e) => toast.error(errorMessage(e)),
	});

	const back = (
		<Link href="/ads/accounts" className="inline-flex items-center gap-1 hover:text-foreground">
			<ArrowLeft className="size-3.5" aria-hidden="true" />
			Ad accounts
		</Link>
	);

	if (!admin) {
		return (
			<EmptyState
				icon={AlertCircle}
				title="Only admins can connect ad accounts"
				action={
					<Button variant="outline" asChild>
						<Link href="/ads/accounts">Back to ad accounts</Link>
					</Button>
				}
			/>
		);
	}

	if (connectError) return null;

	const expired = !pendingKey || (isApiError(error) && [404, 410].includes(error.status));
	const providerName = data ? adsProviderMeta(data.provider).name : null;

	return (
		<div className="mx-auto max-w-2xl">
			<PageHeader
				eyebrow={back}
				title={providerName ? `Choose ${providerName} accounts` : "Choose ad accounts"}
				description="We found these ad accounts on your login. Pick the ones this organization should manage campaigns in."
			/>
			{expired || isError ? (
				<EmptyState
					icon={AlertCircle}
					title={expired ? "This connection has expired" : "Couldn't load ad accounts"}
					description={
						expired ? "Start the connection again from the Accounts tab." : errorMessage(error)
					}
					action={
						<Button asChild>
							<Link href="/ads/accounts">Back to ad accounts</Link>
						</Button>
					}
				/>
			) : isPending ? (
				<div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border">
					{["a", "b", "c"].map((k) => (
						<div key={k} className="flex items-center gap-3 bg-surface-raised px-5 py-4">
							<Skeleton className="size-4 rounded" />
							<Skeleton className="size-7 rounded-md" />
							<div className="grid flex-1 gap-1.5">
								<Skeleton className="h-3.5 w-40" />
								<Skeleton className="h-3 w-56 max-w-full" />
							</div>
						</div>
					))}
				</div>
			) : data.accounts.length === 0 ? (
				<EmptyState
					icon={AlertCircle}
					title="No ad accounts on this login"
					description="Create an ad account in the platform's ads manager, or sign in with a login that has access to one."
					action={
						<Button variant="outline" asChild>
							<Link href="/ads/accounts">Back to ad accounts</Link>
						</Button>
					}
				/>
			) : (
				<Card>
					<div className="flex items-center gap-3 border-border border-b px-5 py-4">
						<ProviderIcon provider={data.provider} size="lg" />
						<div className="grid min-w-0 flex-1">
							<p className="font-medium text-sm">{providerName}</p>
							<p className="text-muted-foreground text-xs">
								{pluralize(data.accounts.length, "ad account")} on this login
							</p>
						</div>
					</div>
					<ul className="divide-y divide-border">
						{data.accounts.map((account) => {
							const id = `ad-acct-${account.externalId}`;
							const usable = account.status === "active";
							const checked = chosen.has(account.externalId);
							return (
								<li key={account.externalId}>
									<label
										htmlFor={id}
										className={cn(
											"flex cursor-pointer items-center gap-3 px-5 py-3.5 transition-colors",
											checked ? "bg-muted/60" : "hover:bg-surface",
										)}
									>
										<Checkbox
											id={id}
											checked={checked}
											onCheckedChange={(v) =>
												setChosen((prev) => {
													const next = new Set(prev);
													if (v === true) next.add(account.externalId);
													else next.delete(account.externalId);
													return next;
												})
											}
										/>
										<span className="grid min-w-0 flex-1">
											<span className="truncate font-medium text-sm">{account.name}</span>
											<span className="truncate text-muted-foreground text-xs">
												{account.currency}
												{account.timezone ? ` · ${account.timezone}` : ""} · ID{" "}
												<span className="font-mono">{account.externalId}</span>
											</span>
										</span>
										<span className="flex shrink-0 flex-wrap justify-end gap-1.5">
											{account.alreadyConnected ? (
												<Badge tone="outline">Already connected</Badge>
											) : null}
											{usable ? null : (
												<Badge tone={account.status === "pending" ? "info" : "warning"} dot>
													{account.status === "pending" ? "Pending review" : "Disabled"}
												</Badge>
											)}
										</span>
									</label>
								</li>
							);
						})}
					</ul>
					<CardFooter className="justify-between">
						<p className="flex items-center gap-1.5 text-muted-foreground text-xs">
							<PauseCircle className="size-3.5 shrink-0" aria-hidden="true" />
							<span>
								<span className="font-medium text-foreground font-mono tabular-nums">
									{pluralize(chosen.size, "account")} selected
								</span>{" "}
								· Connecting never spends money
							</span>
						</p>
						<Button
							loading={confirm.isPending}
							disabled={chosen.size === 0}
							onClick={() => confirm.mutate()}
						>
							Connect selected
						</Button>
					</CardFooter>
				</Card>
			)}
		</div>
	);
}
