"use client";

import { Button } from "@socialfly/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@socialfly/ui/components/card";
import { Alert, EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import { NativeSelect } from "@socialfly/ui/components/select";
import { Info } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAdAccounts, useAdsOverview } from "@/hooks/use-ads";
import { adsProviderMeta, CAMPAIGN_STATUS, CAMPAIGN_STATUSES, formatMoney } from "@/lib/ads";
import { errorMessage } from "@/lib/errors";
import { formatCompact } from "@/lib/format";
import { RangePicker } from "../analytics/analytics-filters";
import { readRange } from "../analytics/analytics-utils";
import { useOrg } from "../org-provider";
import { ProviderIcon } from "../provider-icon";
import { AdKpiRow, AdKpiSkeleton, SpendByCampaignChart, SpendChart } from "./ads-charts";
import { AdsLanding } from "./ads-landing";
import { AdsLayout } from "./ads-shared";
import { CampaignsTable } from "./campaigns-table";

export function AdsOverviewView() {
	const { org } = useOrg();
	const params = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();
	const accounts = useAdAccounts();
	const range = readRange(params, org.timezone);
	const rawStatus = params.get("status") ?? "";
	const status = CAMPAIGN_STATUSES.find((s) => s === rawStatus);

	const update = (changes: Record<string, string | null>) => {
		const next = new URLSearchParams(params);
		for (const [k, v] of Object.entries(changes)) {
			if (v === null) next.delete(k);
			else next.set(k, v);
		}
		router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
	};

	const description = "Paid campaigns across your ad accounts. Spend is shown per currency.";

	if (accounts.isPending) {
		return (
			<AdsLayout description={description}>
				<AdKpiSkeleton />
			</AdsLayout>
		);
	}
	if (accounts.isError) {
		return (
			<AdsLayout description={description}>
				<EmptyState
					title="Couldn't load ads"
					description={errorMessage(accounts.error)}
					action={
						<Button variant="outline" onClick={() => accounts.refetch()}>
							Retry
						</Button>
					}
				/>
			</AdsLayout>
		);
	}
	if (accounts.data.length === 0) {
		return (
			<AdsLayout description={description}>
				<AdsLanding />
			</AdsLayout>
		);
	}

	return (
		<AdsLayout description={description}>
			<div className="grid grid-cols-[minmax(0,1fr)] gap-8">
				<section aria-labelledby="ads-results" className="grid min-w-0 gap-4">
					<div className="flex flex-wrap items-end justify-between gap-3">
						<div className="grid gap-0.5">
							<h2 id="ads-results" className="font-medium text-[15px]">
								Results
							</h2>
							<p className="text-muted-foreground text-xs">
								Delivery across every connected ad account
							</p>
						</div>
						<RangePicker
							key={`${range.from}-${range.to}`}
							range={range}
							onPreset={(days) => update({ range: String(days), from: null, to: null })}
							onCustom={(from, to) => update({ range: "custom", from, to })}
						/>
					</div>
					<OverviewResults from={range.from} to={range.to} />
				</section>

				<section aria-labelledby="ads-campaigns" className="grid min-w-0 gap-3">
					<div className="flex flex-wrap items-end justify-between gap-3">
						<div className="grid gap-0.5">
							<h2 id="ads-campaigns" className="font-medium text-[15px]">
								Campaigns
							</h2>
							<p className="text-muted-foreground text-xs">
								Drafts, approvals and everything running on the platforms
							</p>
						</div>
						<div className="flex items-center gap-2">
							<label htmlFor="ads-status-filter" className="sr-only">
								Status
							</label>
							<NativeSelect
								id="ads-status-filter"
								className="w-44"
								value={status ?? ""}
								onChange={(e) => update({ status: e.target.value || null })}
							>
								<option value="">All statuses</option>
								{CAMPAIGN_STATUSES.map((s) => (
									<option key={s} value={s}>
										{CAMPAIGN_STATUS[s].label}
									</option>
								))}
							</NativeSelect>
						</div>
					</div>
					<CampaignsTable status={status} />
				</section>
			</div>
		</AdsLayout>
	);
}

function OverviewResults({ from, to }: { from: string; to: string }) {
	const overview = useAdsOverview(from, to);

	if (overview.isPending) {
		return (
			<div className="grid gap-4">
				<AdKpiSkeleton />
				<Skeleton className="h-52" />
			</div>
		);
	}
	if (overview.isError) {
		return (
			<EmptyState
				compact
				title="Couldn't load results"
				description={errorMessage(overview.error)}
				action={
					<Button variant="outline" size="sm" onClick={() => overview.refetch()}>
						Retry
					</Button>
				}
			/>
		);
	}

	const groups = overview.data.totals;
	if (groups.length === 0) {
		return (
			<EmptyState
				compact
				title="No spend in this period"
				description="Results appear here a few hours after an active campaign starts delivering."
			/>
		);
	}

	return (
		<div className="grid gap-6">
			{groups.length > 1 || overview.data.currencyNote ? (
				<Alert tone="info" icon={Info}>
					{overview.data.currencyNote ??
						"Your ad accounts use different currencies. Each is shown separately — amounts are never converted or added together."}
				</Alert>
			) : null}
			{groups.map((g) => (
				<CurrencyGroup
					key={g.currency}
					totals={g}
					campaigns={overview.data.byCampaign.filter((c) => c.currency === g.currency)}
					providers={overview.data.byProvider.filter((p) => p.currency === g.currency)}
					showHeading={groups.length > 1}
				/>
			))}
		</div>
	);
}

type Overview = NonNullable<ReturnType<typeof useAdsOverview>["data"]>;

function CurrencyGroup({
	totals,
	campaigns,
	providers,
	showHeading,
}: {
	totals: Overview["totals"][number];
	campaigns: Overview["byCampaign"];
	providers: Overview["byProvider"];
	showHeading: boolean;
}) {
	// A daily series per currency, if the API sends one; otherwise the per-campaign split.
	const days = (totals as { daily?: { date: string; spend: number }[] }).daily ?? [];
	return (
		<div className="grid gap-4">
			{showHeading ? (
				<h3 className="font-medium text-muted-foreground text-[13px]">
					Accounts billed in {totals.currency}
				</h3>
			) : null}
			<AdKpiRow totals={totals} currency={totals.currency} />
			<div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
				<Card>
					<CardHeader className="flex-row items-center justify-between border-border border-b pb-4">
						<CardTitle>{days.length ? "Daily spend" : "Spend by campaign"}</CardTitle>
						<span className="text-muted-foreground text-xs">{totals.currency}</span>
					</CardHeader>
					<CardContent className="pt-4">
						{days.length ? (
							<SpendChart days={days} currency={totals.currency} />
						) : (
							<SpendByCampaignChart
								rows={campaigns.map((c) => ({
									campaignId: c.campaignId,
									name: c.name,
									spend: c.spend,
								}))}
								currency={totals.currency}
							/>
						)}
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="border-border border-b pb-4">
						<CardTitle>By platform</CardTitle>
					</CardHeader>
					<CardContent className="pt-4">
						<ul className="grid gap-4">
							{providers.map((p) => {
								// Share of this currency's spend; the bar is decorative, the amount is the data.
								const share = totals.spend ? Math.min(1, p.spend / totals.spend) : 0;
								return (
									<li key={p.provider} className="grid gap-2">
										<div className="flex items-center gap-2.5 text-sm">
											<ProviderIcon provider={p.provider} size="md" />
											<span className="grid min-w-0 flex-1">
												<span className="truncate font-medium">
													{adsProviderMeta(p.provider).name}
												</span>
												<span className="text-muted-foreground text-xs font-mono tabular-nums">
													{formatCompact(p.clicks)} clicks
												</span>
											</span>
											<span className="font-medium font-mono tabular-nums">
												{formatMoney(p.spend, totals.currency)}
											</span>
										</div>
										<div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
											<div
												className="h-full rounded-full bg-ink"
												style={{ width: `${Math.round(share * 100)}%` }}
											/>
										</div>
									</li>
								);
							})}
						</ul>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
