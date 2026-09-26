"use client";

import { cn } from "@socialfly/ui/utils";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import type { AnalyticsTopPost } from "@/lib/api-types";
import { formatCompact, formatDate, formatNumber, formatPercent } from "@/lib/format";
import { providerName } from "@/lib/providers";
import { ProviderIcon } from "../provider-icon";

export function Metric({
	label,
	value,
	title,
	align = "right",
}: {
	label: string;
	value: string;
	title?: string;
	align?: "left" | "right";
}) {
	return (
		<span className={align === "right" ? "grid text-right" : "grid"} title={title}>
			<span className="font-mono text-sm tabular-nums">{value}</span>
			<span className="text-[11px] text-muted-foreground">{label}</span>
		</span>
	);
}

export function LiveLink({
	href,
	provider,
	iconOnly,
}: {
	href: string | null;
	provider: string;
	iconOnly?: boolean;
}) {
	if (!href) return null;
	if (iconOnly) {
		return (
			<a
				href={href}
				target="_blank"
				rel="noreferrer"
				title={`View on ${providerName(provider)}`}
				className="inline-flex items-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
			>
				<ExternalLink className="size-3" aria-hidden="true" />
				<span className="sr-only">View on {providerName(provider)} (opens in a new tab)</span>
			</a>
		);
	}
	return (
		<a
			href={href}
			target="_blank"
			rel="noreferrer"
			className="inline-flex items-center gap-1 rounded-sm text-muted-foreground text-xs hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
		>
			<ExternalLink className="size-3" aria-hidden="true" />
			View on {providerName(provider)}
			<span className="sr-only">(opens in a new tab)</span>
		</a>
	);
}

/** Best-performing posts as ranked rows: rank, channel, excerpt, and a bar scaled to #1. */
export function TopPosts({ posts, timeZone }: { posts: AnalyticsTopPost[]; timeZone: string }) {
	const max = Math.max(1, ...posts.map((p) => p.engagements ?? 0));
	return (
		<ol className="divide-y divide-border">
			{posts.map((p, i) => (
				<li
					key={p.targetId}
					className="group relative flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface"
				>
					<span
						className={cn(
							"flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-xs tabular-nums",
							i === 0 ? "bg-ink text-ink-foreground" : "bg-muted text-muted-foreground",
						)}
					>
						{i + 1}
					</span>
					<ProviderIcon provider={p.channel.provider} size="md" className="max-sm:hidden" />
					<div className="grid min-w-0 flex-1 gap-1">
						<Link
							href={`/posts/${p.postId}`}
							className="line-clamp-1 rounded-sm font-medium text-sm leading-snug hover:underline focus-visible:outline-2 focus-visible:outline-ring"
						>
							{p.excerpt || "Media post"}
						</Link>
						<p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground text-xs">
							<span className="inline-flex min-w-0 items-center gap-1.5">
								<ProviderIcon provider={p.channel.provider} size="xs" className="sm:hidden" />
								<span className="truncate">{p.channel.name}</span>
							</span>
							{p.publishedAt ? (
								<>
									<span aria-hidden="true">·</span>
									<time dateTime={p.publishedAt} className="font-mono">
										{formatDate(p.publishedAt, timeZone)}
									</time>
								</>
							) : null}
							<LiveLink href={p.externalUrl} provider={p.channel.provider} iconOnly />
						</p>
						<span
							className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted"
							aria-hidden="true"
						>
							<span
								className="block h-full rounded-full bg-foreground/70"
								style={{ width: `${Math.max(4, ((p.engagements ?? 0) / max) * 100)}%` }}
							/>
						</span>
					</div>
					<div className="flex shrink-0 gap-4 sm:gap-5">
						<Metric
							label="Impr."
							value={formatCompact(p.impressions)}
							title={`${formatNumber(p.impressions)} impressions`}
						/>
						<Metric
							label="Eng."
							value={formatCompact(p.engagements)}
							title={`${formatNumber(p.engagements)} engagements`}
						/>
						<span className="max-sm:hidden">
							<Metric label="Rate" value={formatPercent(p.engagementRate)} />
						</span>
					</div>
				</li>
			))}
		</ol>
	);
}
