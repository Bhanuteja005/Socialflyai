"use client";

import { cn } from "@socialfly/ui/utils";
import { Info } from "lucide-react";
import type { AnalyticsChannelRow } from "@/lib/api-types";
import { formatCompact, formatNumber } from "@/lib/format";
import { providerName } from "@/lib/providers";
import { ProviderIcon } from "../provider-icon";

function Change({ value }: { value: number | null }) {
	if (value === null || value === 0) return null;
	const up = value > 0;
	return (
		<span className={cn("ml-1.5 text-xs", up ? "text-success" : "text-danger")}>
			{up ? "+" : "−"}
			{formatCompact(Math.abs(value))}
		</span>
	);
}

const num = "px-4 py-3 text-right tabular-nums";

export function ChannelTable({ rows }: { rows: AnalyticsChannelRow[] }) {
	return (
		<div className="scrollbar-thin overflow-x-auto">
			<table className="w-full min-w-[560px] text-sm">
				<caption className="sr-only">Results by channel</caption>
				<thead>
					<tr className="border-border border-b text-muted-foreground text-xs">
						<th scope="col" className="px-4 py-2 text-left font-medium">
							Channel
						</th>
						<th scope="col" className="px-4 py-2 text-right font-medium">
							Followers
						</th>
						<th scope="col" className="px-4 py-2 text-right font-medium">
							Posts
						</th>
						<th scope="col" className="px-4 py-2 text-right font-medium">
							Impressions
						</th>
						<th scope="col" className="px-4 py-2 text-right font-medium">
							Engagements
						</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-border">
					{rows.map((c) => (
						<tr key={c.channelId}>
							<th scope="row" className="px-4 py-3 text-left font-normal">
								<span className="flex min-w-0 items-center gap-2.5">
									<ProviderIcon provider={c.provider} />
									<span className="grid min-w-0">
										<span className="truncate font-medium">{c.name}</span>
										<span className="text-muted-foreground text-xs">
											{providerName(c.provider)}
										</span>
										{c.analyticsSupported ? null : (
											<span className="mt-0.5 inline-flex items-center gap-1 text-subtle-foreground text-xs">
												<Info className="size-3 shrink-0" aria-hidden="true" />
												Analytics not available for this platform
											</span>
										)}
									</span>
								</span>
							</th>
							<td className={num}>
								<span title={formatNumber(c.followers)}>{formatCompact(c.followers)}</span>
								<Change value={c.followersChange} />
							</td>
							<td className={num}>{formatNumber(c.posts)}</td>
							<td className={num} title={formatNumber(c.impressions)}>
								{formatCompact(c.impressions)}
							</td>
							<td className={num} title={formatNumber(c.engagements)}>
								{formatCompact(c.engagements)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
