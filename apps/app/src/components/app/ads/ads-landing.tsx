"use client";

import { Badge } from "@socialfly/ui/components/badge";
import { Button } from "@socialfly/ui/components/button";
import { ArrowRight, Gauge, type LucideIcon, PauseCircle, Plus, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { ADS_PROVIDERS } from "@/lib/ads";
import type { AdsProviderId } from "@/lib/api-types";
import { useOrg } from "../org-provider";
import { ProviderIcon } from "../provider-icon";

const TRUST: { icon: LucideIcon; title: string; body: string }[] = [
	{
		icon: PauseCircle,
		title: "Paused by default",
		body: "Every campaign is created paused on the platform. Connecting an account never spends money.",
	},
	{
		icon: ShieldCheck,
		title: "Admin approval",
		body: "Editors draft and submit. Only an admin can activate — after typing the exact budget.",
	},
	{
		icon: Gauge,
		title: "Daily budget ceiling",
		body: "A per-organization cap catches typos like 5000 instead of 50 before they reach a platform.",
	},
];

const STEPS = [
	"Connect an ad account",
	"Draft a campaign or boost a post",
	"An admin approves and activates",
];

/** The Ads overview before any ad account exists: what you get, which platforms, why it's safe. */
export function AdsLanding() {
	const { can } = useOrg();
	const admin = can("admin");
	const providers = Object.keys(ADS_PROVIDERS) as AdsProviderId[];

	return (
		<div className="grid gap-6">
			<section
				aria-labelledby="ads-landing-title"
				className="relative overflow-hidden rounded-3xl border border-border bg-surface-raised"
			>
				<div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center lg:gap-10 lg:p-10">
					<div className="grid content-start gap-5">
						<Badge tone="outline" className="w-fit">
							Paid campaigns
						</Badge>
						<div className="grid gap-2">
							<h2
								id="ads-landing-title"
								className="text-balance font-medium text-2xl tracking-[-0.02em] sm:text-[28px] sm:leading-9"
							>
								Run ads on six platforms, without the risk of a surprise bill
							</h2>
							<p className="max-w-lg text-pretty text-muted-foreground text-sm leading-relaxed">
								Connect your ad accounts to draft campaigns, boost published posts and see spend,
								clicks and conversions side by side — per currency, never mixed.
							</p>
						</div>
						<ol className="grid gap-2.5">
							{STEPS.map((s, i) => (
								<li key={s} className="flex items-center gap-3 text-sm">
									<span
										aria-hidden="true"
										className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface font-mono text-muted-foreground text-xs tabular-nums"
									>
										{i + 1}
									</span>
									{s}
								</li>
							))}
						</ol>
						<div className="flex flex-wrap items-center gap-2 pt-1">
							<Button size="lg" asChild>
								<Link href="/ads/accounts">
									{admin ? <Plus /> : null}
									{admin ? "Connect an ad account" : "See ad accounts"}
									{admin ? null : <ArrowRight />}
								</Link>
							</Button>
							{admin ? (
								<Button variant="ghost" size="lg" asChild>
									<Link href="/ads/settings">Set a budget ceiling</Link>
								</Button>
							) : null}
						</div>
						{admin ? null : (
							<p className="text-muted-foreground text-xs">
								An admin needs to connect an ad account first.
							</p>
						)}
					</div>

					<ul aria-label="Supported ad platforms" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
						{providers.map((id) => (
							<li
								key={id}
								className="flex flex-col items-start gap-3 rounded-xl border border-border bg-surface p-4"
							>
								<ProviderIcon provider={id} size="lg" />
								<span className="font-medium text-sm">{ADS_PROVIDERS[id].name}</span>
							</li>
						))}
					</ul>
				</div>
			</section>

			<section aria-label="How money is protected" className="grid gap-4 md:grid-cols-3">
				{TRUST.map((t) => (
					<div
						key={t.title}
						className="flex gap-3 rounded-2xl border border-border bg-surface-raised p-5"
					>
						<t.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
						<div className="grid content-start gap-1">
							<h3 className="font-medium text-sm">{t.title}</h3>
							<p className="text-muted-foreground text-[13px] leading-relaxed">{t.body}</p>
						</div>
					</div>
				))}
			</section>
		</div>
	);
}

/** The same three guarantees as a compact side card (Ads settings). */
export function AdsSafetyCard() {
	return (
		<aside
			aria-labelledby="ads-safety-title"
			className="grid gap-4 rounded-2xl border border-border bg-surface-raised p-5"
		>
			<h2 id="ads-safety-title" className="font-medium text-sm">
				How money is protected
			</h2>
			<ul className="grid gap-4">
				{TRUST.map((t) => (
					<li key={t.title} className="flex gap-3">
						<t.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
						<div className="grid gap-0.5">
							<p className="font-medium text-[13px]">{t.title}</p>
							<p className="text-muted-foreground text-xs leading-relaxed">{t.body}</p>
						</div>
					</li>
				))}
			</ul>
		</aside>
	);
}
