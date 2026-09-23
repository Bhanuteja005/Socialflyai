"use client";

import { Badge } from "@socialfly/ui/components/badge";
import { Button } from "@socialfly/ui/components/button";
import { cn } from "@socialfly/ui/utils";
import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAdAccounts } from "@/hooks/use-ads";
import { ACCOUNT_STATUS, CAMPAIGN_STATUS } from "@/lib/ads";
import type { AdAccountStatus, AdCampaignStatus } from "@/lib/api-types";
import { useOrg } from "../org-provider";
import { PageHeader } from "../page-header";

export function CampaignStatusBadge({ status }: { status: AdCampaignStatus }) {
	const meta = CAMPAIGN_STATUS[status] ?? { label: status, tone: "neutral" as const };
	return (
		<Badge tone={meta.tone} dot>
			{meta.label}
		</Badge>
	);
}

export function AccountStatusBadge({ status }: { status: AdAccountStatus }) {
	const meta = ACCOUNT_STATUS[status] ?? { label: status, tone: "neutral" as const };
	return (
		<Badge tone={meta.tone} dot>
			{meta.label}
		</Badge>
	);
}

const TABS = [
	{ href: "/ads", label: "Overview" },
	{ href: "/ads/accounts", label: "Accounts" },
	{ href: "/ads/settings", label: "Settings", minimum: "admin" as const },
];

/** Section tabs as real links, so each view has its own URL and works with back/forward. */
function AdsNav() {
	const pathname = usePathname();
	const { can } = useOrg();
	return (
		<nav aria-label="Ads sections" className="mb-6">
			<ul className="scrollbar-thin inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-muted p-0.5">
				{TABS.filter((t) => !t.minimum || can(t.minimum)).map((t) => {
					const active = pathname === t.href;
					return (
						<li key={t.href}>
							<Link
								href={t.href}
								aria-current={active ? "page" : undefined}
								className={cn(
									"inline-flex h-7 items-center rounded-md px-2.5 font-medium text-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring",
									active
										? "bg-surface-raised text-foreground shadow-xs"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								{t.label}
							</Link>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}

/** Header + section tabs shared by the Ads overview, accounts and settings pages. */
export function AdsLayout({
	description,
	children,
}: {
	description: ReactNode;
	children: ReactNode;
}) {
	const { can } = useOrg();
	const { data: accounts } = useAdAccounts();
	const hasActive = accounts?.some((a) => a.status === "active") ?? false;
	return (
		<>
			<PageHeader
				title="Ads"
				description={description}
				actions={
					can("editor") && hasActive ? (
						<Button asChild>
							<Link href="/ads/campaigns/new">
								<Plus />
								New campaign
							</Link>
						</Button>
					) : null
				}
			/>
			<AdsNav />
			{children}
		</>
	);
}

/** Label/value rows for summaries. */
export function SummaryList({ rows }: { rows: { label: string; value: ReactNode }[] }) {
	return (
		<dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
			{rows.map((r) => (
				<div key={r.label} className="contents">
					<dt className="text-muted-foreground">{r.label}</dt>
					<dd className="min-w-0 break-words">{r.value}</dd>
				</div>
			))}
		</dl>
	);
}
