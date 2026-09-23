"use client";

import { Badge } from "@socialfly/ui/components/badge";
import { Button } from "@socialfly/ui/components/button";
import { Card, CardContent, CardFooter } from "@socialfly/ui/components/card";
import { Checkbox } from "@socialfly/ui/components/controls";
import { EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import { toast } from "@socialfly/ui/components/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft } from "lucide-react";
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
		<Button variant="ghost" size="sm" asChild>
			<Link href="/ads/accounts">
				<ArrowLeft />
				Ad accounts
			</Link>
		</Button>
	);

	if (!admin) {
		return (
			<EmptyState icon={AlertCircle} title="Only admins can connect ad accounts" action={back} />
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
				<div className="grid gap-2">
					{["a", "b", "c"].map((k) => (
						<Skeleton key={k} className="h-14" />
					))}
				</div>
			) : data.accounts.length === 0 ? (
				<EmptyState
					icon={AlertCircle}
					title="No ad accounts on this login"
					description="Create an ad account in the platform's ads manager, or sign in with a login that has access to one."
					action={back}
				/>
			) : (
				<Card>
					<CardContent className="p-0">
						<ul className="divide-y divide-border">
							{data.accounts.map((account) => {
								const id = `ad-acct-${account.externalId}`;
								const usable = account.status === "active";
								return (
									<li key={account.externalId}>
										<label
											htmlFor={id}
											className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-muted/60"
										>
											<Checkbox
												id={id}
												checked={chosen.has(account.externalId)}
												onCheckedChange={(v) =>
													setChosen((prev) => {
														const next = new Set(prev);
														if (v === true) next.add(account.externalId);
														else next.delete(account.externalId);
														return next;
													})
												}
											/>
											<ProviderIcon provider={data.provider} size="sm" />
											<span className="grid min-w-0 flex-1">
												<span className="truncate font-medium text-sm">{account.name}</span>
												<span className="truncate text-muted-foreground text-xs">
													{account.currency}
													{account.timezone ? ` · ${account.timezone}` : ""} · ID{" "}
													{account.externalId}
												</span>
											</span>
											{account.alreadyConnected ? (
												<Badge tone="outline">Already connected</Badge>
											) : null}
											{usable ? null : (
												<Badge tone={account.status === "pending" ? "info" : "warning"}>
													{account.status === "pending" ? "Pending review" : "Disabled"}
												</Badge>
											)}
										</label>
									</li>
								);
							})}
						</ul>
					</CardContent>
					<CardFooter className="justify-between">
						<p className="text-muted-foreground text-xs">
							{pluralize(chosen.size, "account")} selected · Connecting never spends money
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
