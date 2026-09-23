"use client";

import { Button } from "@socialfly/ui/components/button";
import { EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import { cn } from "@socialfly/ui/utils";
import { ExternalLink, Megaphone } from "lucide-react";
import Link from "next/link";
import { useAdCampaigns } from "@/hooks/use-ads";
import { adsProviderMeta, formatMoney, objectiveLabel } from "@/lib/ads";
import type { AdCampaign, AdCampaignStatus } from "@/lib/api-types";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { useOrg } from "../org-provider";
import { ProviderIcon } from "../provider-icon";
import { CampaignStatusBadge } from "./ads-shared";

export const campaignBudget = (
	c: Pick<AdCampaign, "dailyBudget" | "lifetimeBudget" | "currency">,
) =>
	c.dailyBudget !== null
		? `${formatMoney(c.dailyBudget, c.currency)} / day`
		: c.lifetimeBudget !== null
			? `${formatMoney(c.lifetimeBudget, c.currency)} total`
			: "—";

const th = "px-3 py-2 text-left font-medium text-muted-foreground text-xs whitespace-nowrap";
const td = "px-3 py-2.5 align-middle";

export function CampaignsTable({ status }: { status?: AdCampaignStatus }) {
	const { org, can } = useOrg();
	const campaigns = useAdCampaigns(status ? { status } : {});
	const items = campaigns.data?.pages.flatMap((p) => p.items) ?? [];

	if (campaigns.isPending) {
		return (
			<div className="grid gap-2">
				{["a", "b", "c"].map((k) => (
					<Skeleton key={k} className="h-12" />
				))}
			</div>
		);
	}
	if (campaigns.isError) {
		return (
			<EmptyState
				compact
				title="Couldn't load campaigns"
				description={errorMessage(campaigns.error)}
				action={
					<Button variant="outline" size="sm" onClick={() => campaigns.refetch()}>
						Retry
					</Button>
				}
			/>
		);
	}
	if (items.length === 0) {
		return (
			<EmptyState
				compact
				icon={Megaphone}
				title={status ? "No campaigns with this status" : "No campaigns yet"}
				description={
					status
						? undefined
						: "Create a campaign, or boost a published post from its page. Nothing spends until an admin activates it."
				}
				action={
					!status && can("editor") ? (
						<Button asChild size="sm">
							<Link href="/ads/campaigns/new">New campaign</Link>
						</Button>
					) : undefined
				}
			/>
		);
	}

	return (
		<div className="grid gap-3">
			<div className="scrollbar-thin overflow-x-auto rounded-lg border border-border bg-surface-raised">
				<table className="w-full min-w-[760px] text-sm">
					<caption className="sr-only">Ad campaigns</caption>
					<thead className="border-border border-b bg-surface">
						<tr>
							<th scope="col" className={th}>
								Campaign
							</th>
							<th scope="col" className={th}>
								Status
							</th>
							<th scope="col" className={cn(th, "text-right")}>
								Budget
							</th>
							<th scope="col" className={cn(th, "text-right")}>
								Spent to date
							</th>
							<th scope="col" className={th}>
								On the platform
							</th>
							<th scope="col" className={th}>
								<span className="sr-only">Links</span>
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-border">
						{items.map((c) => (
							<tr key={c.id} className="hover:bg-muted/40">
								<td className={td}>
									<div className="flex min-w-0 items-center gap-2.5">
										<ProviderIcon provider={c.provider} size="sm" />
										<div className="grid min-w-0">
											<Link
												href={`/ads/campaigns/${c.id}`}
												className="truncate font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring"
											>
												{c.name}
											</Link>
											<span className="truncate text-muted-foreground text-xs">
												{c.adAccount.name} · {objectiveLabel(c.objective)} · Starts{" "}
												{formatDate(c.startAt, org.timezone)}
											</span>
										</div>
									</div>
								</td>
								<td className={td}>
									<CampaignStatusBadge status={c.status} />
								</td>
								<td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>
									{campaignBudget(c)}
								</td>
								<td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>
									{c.spendToDate === null ? "—" : formatMoney(c.spendToDate, c.currency)}
								</td>
								<td className={cn(td, "text-muted-foreground text-xs")}>
									{c.platformStatus ? c.platformStatus.replace(/_/g, " ").toLowerCase() : "—"}
								</td>
								<td className={cn(td, "text-right")}>
									{c.manageUrl ? (
										<a
											href={c.manageUrl}
											target="_blank"
											rel="noreferrer"
											className="inline-flex items-center gap-1 whitespace-nowrap text-muted-foreground text-xs hover:text-foreground"
										>
											<ExternalLink className="size-3.5" aria-hidden="true" />
											Open in {adsProviderMeta(c.provider).name} manager
										</a>
									) : null}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{campaigns.hasNextPage ? (
				<div className="flex justify-center">
					<Button
						variant="outline"
						size="sm"
						loading={campaigns.isFetchingNextPage}
						onClick={() => campaigns.fetchNextPage()}
					>
						Load more
					</Button>
				</div>
			) : null}
		</div>
	);
}
