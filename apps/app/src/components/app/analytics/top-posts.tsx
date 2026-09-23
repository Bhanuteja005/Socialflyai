"use client";

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
			<span className="font-medium text-sm tabular-nums">{value}</span>
			<span className="text-[11px] text-muted-foreground">{label}</span>
		</span>
	);
}

export function LiveLink({ href, provider }: { href: string | null; provider: string }) {
	if (!href) return null;
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

export function TopPosts({ posts, timeZone }: { posts: AnalyticsTopPost[]; timeZone: string }) {
	return (
		<ol className="divide-y divide-border">
			{posts.map((p, i) => (
				<li key={p.targetId} className="flex items-start gap-3 px-5 py-3.5">
					<span className="mt-0.5 w-4 shrink-0 text-right font-medium text-subtle-foreground text-xs tabular-nums">
						{i + 1}
					</span>
					<div className="grid min-w-0 flex-1 gap-1.5">
						<Link
							href={`/posts/${p.postId}`}
							className="line-clamp-2 rounded-sm text-sm leading-snug hover:underline focus-visible:outline-2 focus-visible:outline-ring"
						>
							{p.excerpt || "Media post"}
						</Link>
						<p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
							<span className="inline-flex min-w-0 items-center gap-1.5">
								<ProviderIcon provider={p.channel.provider} size="xs" />
								<span className="truncate">{p.channel.name}</span>
							</span>
							{p.publishedAt ? (
								<time dateTime={p.publishedAt}>{formatDate(p.publishedAt, timeZone)}</time>
							) : null}
							<LiveLink href={p.externalUrl} provider={p.channel.provider} />
						</p>
					</div>
					<div className="flex shrink-0 gap-4">
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
						<Metric label="Rate" value={formatPercent(p.engagementRate)} />
					</div>
				</li>
			))}
		</ol>
	);
}
