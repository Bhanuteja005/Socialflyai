"use client";

import { Button } from "@socialfly/ui/components/button";
import { Tooltip } from "@socialfly/ui/components/controls";
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

const th = "h-10 px-4 text-left font-medium text-muted-foreground text-xs whitespace-nowrap";
const td = "px-4 py-3 align-middle";

export function CampaignsTable({ status }: { status?: AdCampaignStatus }) {
	const { org, can } = useOrg();
	const campaigns = useAdCampaigns(status ? { status } : {});
	const items = campaigns.data?.pages.flatMap((p) => p.items) ?? [];

	if (campaigns.isPending) {
		return (
			<div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border">
				{["a", "b", "c"].map((k) => (
					<div key={k} className="flex items-center gap-3 bg-surface-raised px-4 py-3">
						<Skeleton className="size-7 rounded-md" />
						<div className="grid flex-1 gap-1.5">
							<Skeleton className="h-3.5 w-48" />
							<Skeleton className="h-3 w-72 max-w-full" />
						</div>
						<Skeleton className="h-5 w-16 rounded-full" />
					</div>
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
		<div className="grid min-w-0 gap-3">
			<div className="scrollbar-thin relative min-w-0 overflow-x-auto rounded-2xl border border-border bg-surface-raised">
				<table className="w-full min-w-[680px] text-sm">
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
							<th scope="col" className={cn(th, "hidden lg:table-cell")}>
								On the platform
							</th>
							<th scope="col" className={cn(th, "w-12")}>
								<span className="sr-only">Links</span>
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-border">
						{items.map((c) => (
							<tr key={c.id} className="group relative transition-colors hover:bg-surface">
								<td className={td}>
									<div className="flex min-w-0 items-center gap-3">
										<ProviderIcon provider={c.provider} size="md" />
										<div className="grid min-w-0">
											{/* The name is the row's link; the ::after stretches it over the whole row. */}
											<Link
												href={`/ads/campaigns/${c.id}`}
												className="truncate font-medium after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-ring group-hover:underline"
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
								<td className={cn(td, "whitespace-nowrap text-right font-mono tabular-nums")}>
									{campaignBudget(c)}
								</td>
								<td
									className={cn(
										td,
										"whitespace-nowrap text-right font-medium font-mono tabular-nums",
									)}
								>
									{c.spendToDate === null ? "—" : formatMoney(c.spendToDate, c.currency)}
								</td>
								<td
									className={cn(
										td,
										"hidden text-muted-foreground text-xs capitalize lg:table-cell",
									)}
								>
									{c.platformStatus ? c.platformStatus.replace(/_/g, " ").toLowerCase() : "—"}
								</td>
								<td className={cn(td, "text-right")}>
									{c.manageUrl ? (
										<Tooltip content={`Open in ${adsProviderMeta(c.provider).name} manager`}>
											<a
												href={c.manageUrl}
												target="_blank"
												rel="noreferrer"
												aria-label={`Open ${c.name} in ${adsProviderMeta(c.provider).name} manager`}
												className="relative z-10 inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
											>
												<ExternalLink className="size-4" aria-hidden="true" />
											</a>
										</Tooltip>
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
