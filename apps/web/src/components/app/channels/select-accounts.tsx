"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/controls";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { toast } from "@/components/ui/toast";
import { api, call } from "@/lib/api-client";
import { errorMessage, isApiError } from "@/lib/errors";
import { pluralize } from "@/lib/format";
import { providerName } from "@/lib/providers";
import { qk } from "@/lib/query-keys";
import { useOrg } from "../org-provider";
import { PageHeader } from "../page-header";
import { ProviderIcon } from "../provider-icon";

export function SelectAccounts() {
	const params = useSearchParams();
	const selectionId = params.get("selection") ?? "";
	const { orgId, can } = useOrg();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [chosen, setChosen] = useState<Set<string>>(new Set());

	const { data, isPending, isError, error } = useQuery({
		queryKey: qk.selection(orgId, selectionId),
		queryFn: () => call(api.channels.selections[":selectionId"].$get({ param: { selectionId } })),
		enabled: selectionId.length >= 8 && can("admin"),
		retry: false,
		staleTime: Number.POSITIVE_INFINITY,
	});

	// Preselect accounts that aren't connected yet.
	useEffect(() => {
		if (data)
			setChosen(new Set(data.accounts.filter((a) => !a.alreadyConnected).map((a) => a.externalId)));
	}, [data]);

	const confirm = useMutation({
		mutationFn: () =>
			call(
				api.channels.selections[":selectionId"].$post({
					param: { selectionId },
					json: { externalIds: [...chosen] },
				}),
			),
		onSuccess: ({ channels }) => {
			void queryClient.invalidateQueries({ queryKey: qk.channels(orgId) });
			toast.success(`${pluralize(channels.length, "channel")} connected`);
			router.replace("/channels");
		},
		onError: (e) => toast.error(errorMessage(e)),
	});

	const back = (
		<Button variant="ghost" size="sm" asChild>
			<Link href="/channels">
				<ArrowLeft />
				Channels
			</Link>
		</Button>
	);

	if (!can("admin")) {
		return <EmptyState icon={AlertCircle} title="Only admins can connect channels" action={back} />;
	}

	const expired = isApiError(error) && (error.status === 410 || error.status === 404);

	return (
		<div className="mx-auto max-w-2xl">
			<PageHeader
				eyebrow={back}
				title={data ? `Choose ${providerName(data.provider)} accounts` : "Choose accounts"}
				description="We found these accounts on your login. Pick the ones this organization should publish to."
			/>
			{!selectionId || isError ? (
				<EmptyState
					icon={AlertCircle}
					title={expired || !selectionId ? "This connection has expired" : "Couldn't load accounts"}
					description={
						expired || !selectionId
							? "Start the connection again from the Channels page."
							: errorMessage(error)
					}
					action={
						<Button asChild>
							<Link href="/channels">Back to channels</Link>
						</Button>
					}
				/>
			) : isPending ? (
				<div className="grid gap-2">
					{["a", "b", "c"].map((k) => (
						<Skeleton key={k} className="h-14" />
					))}
				</div>
			) : (
				<Card>
					<CardContent className="p-0">
						<ul className="divide-y divide-border">
							{data.accounts.map((account) => {
								const id = `acct-${account.externalId}`;
								const checked = chosen.has(account.externalId);
								return (
									<li key={account.externalId}>
										<label
											htmlFor={id}
											className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-muted/60"
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
											<Avatar
												src={account.avatarUrl}
												name={account.name}
												badge={<ProviderIcon provider={data.provider} size="xs" />}
											/>
											<span className="grid min-w-0 flex-1">
												<span className="truncate font-medium text-sm">{account.name}</span>
												{account.username ? (
													<span className="truncate text-muted-foreground text-xs">
														@{account.username}
													</span>
												) : null}
											</span>
											{account.alreadyConnected ? (
												<Badge tone="outline">Already connected</Badge>
											) : null}
										</label>
									</li>
								);
							})}
						</ul>
					</CardContent>
					<CardFooter className="justify-between">
						<p className="text-muted-foreground text-xs">
							{pluralize(chosen.size, "account")} selected
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
