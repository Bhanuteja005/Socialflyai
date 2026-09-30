"use client";

import { Tooltip } from "@socialfly/ui/components/controls";
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
		<span
			className={cn("block font-mono text-[11px] leading-4", up ? "text-success" : "text-danger")}
		>
			{up ? "+" : "−"}
			{formatCompact(Math.abs(value))}
		</span>
	);
}

const th = "h-10 px-3 text-right font-medium";
const num = "px-3 py-3 text-right align-middle font-mono tabular-nums";

export function ChannelTable({
	rows,
	onSelect,
}: {
	rows: AnalyticsChannelRow[];
	/** Opens a channel's account history; the name becomes a button when set. */
	onSelect?: (row: AnalyticsChannelRow) => void;
}) {
	return (
		<div className="scrollbar-thin relative overflow-x-auto [contain:inline-size]">
			<table className="w-full min-w-[460px] text-sm">
				<caption className="sr-only">Results by channel</caption>
				<thead>
					<tr className="border-border border-b bg-surface text-muted-foreground text-xs">
						<th scope="col" className={cn(th, "pl-5 text-left")}>
							Channel
						</th>
						<th scope="col" className={th}>
							Followers
						</th>
						<th scope="col" className={th}>
							Posts
						</th>
						<th scope="col" className={th}>
							<abbr title="Impressions" className="no-underline">
								Impr.
							</abbr>
						</th>
						<th scope="col" className={cn(th, "pr-5")}>
							<abbr title="Engagements" className="no-underline">
								Eng.
							</abbr>
						</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-border">
					{rows.map((c) => (
						<tr key={c.channelId} className="transition-colors hover:bg-surface">
							<th scope="row" className="py-3 pr-3 pl-5 text-left font-normal">
								<span className="flex min-w-0 items-center gap-2.5">
									<ProviderIcon provider={c.provider} size="md" />
									<span className="grid min-w-0">
										<span className="flex min-w-0 items-center gap-1.5">
											{onSelect ? (
												<button
													type="button"
													onClick={() => onSelect(c)}
													className="truncate rounded-sm text-left font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
												>
													{c.name}
												</button>
											) : (
												<span className="truncate font-medium">{c.name}</span>
											)}
											{c.analyticsSupported ? null : (
												<Tooltip content="This platform doesn't share post analytics, so its posts aren't counted.">
													<button
														type="button"
														className="inline-flex shrink-0 cursor-help rounded-sm text-subtle-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
													>
														<Info className="size-3.5" aria-hidden="true" />
														<span className="sr-only">
															Analytics not available for this platform
														</span>
													</button>
												</Tooltip>
											)}
										</span>
										<span className="truncate text-muted-foreground text-xs">
											{providerName(c.provider)}
										</span>
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
							<td className={cn(num, "pr-5 font-medium")} title={formatNumber(c.engagements)}>
								{formatCompact(c.engagements)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
