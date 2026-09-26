"use client";

import { Badge } from "@socialfly/ui/components/badge";
import { Button } from "@socialfly/ui/components/button";
import { EmptyState } from "@socialfly/ui/components/feedback";
import { NativeSelect } from "@socialfly/ui/components/select";
import { Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useGenerations } from "@/hooks/use-admin";
import type { GenerationKind, GenerationStatus } from "@/lib/api-types";
import { formatDateTime, formatRelative, formatUsdPrecise } from "@/lib/format";
import { GENERATION_STATUS, statusMeta } from "@/lib/status";
import {
	LoadMore,
	None,
	PageHeader,
	QueryError,
	TableCard,
	TableSkeleton,
	tableClass,
	tdClass,
	thClass,
} from "../common";
import { Monogram, Toolbar } from "./parts";

// Typed against the API's enum: adding a kind server-side fails typecheck here until labelled.
const KIND_LABEL: Record<GenerationKind, string> = {
	post: "Post",
	rewrite: "Rewrite",
	hashtags: "Hashtags",
	carousel_outline: "Carousel outline",
	image: "Image",
	carousel: "Carousel",
	video_script: "Video script",
	video: "Video",
	research: "Website research",
	visibility: "AI visibility",
	seo: "SEO data",
	triage: "Inbox triage",
	reply_draft: "Reply draft",
	ad_copy: "Ad copy",
};
const KINDS = Object.keys(KIND_LABEL) as GenerationKind[];
const STATUSES = Object.keys(GENERATION_STATUS) as GenerationStatus[];

export function AiView() {
	const [status, setStatus] = useState<GenerationStatus | "all">("all");
	const [kind, setKind] = useState<GenerationKind | "all">("all");
	const query = useGenerations(status, kind);
	const items = query.data?.pages.flatMap((p) => p.items) ?? [];
	const shownCost = items.reduce((sum, g) => sum + g.costUsd, 0);
	const filtered = status !== "all" || kind !== "all";

	return (
		<>
			<PageHeader
				title="AI usage"
				description="Every AI generation across all organizations, with its cost."
			/>
			<Toolbar
				aside={
					items.length ? (
						<span>
							<span className="text-foreground">{formatUsdPrecise(shownCost)}</span> across the{" "}
							{items.length} shown
						</span>
					) : null
				}
			>
				<div className="flex items-center gap-2">
					<label htmlFor="ai-status" className="text-muted-foreground text-xs">
						Status
					</label>
					<NativeSelect
						id="ai-status"
						className="w-40"
						value={status}
						onChange={(e) => setStatus(e.target.value as GenerationStatus | "all")}
					>
						<option value="all">All statuses</option>
						{STATUSES.map((s) => (
							<option key={s} value={s}>
								{GENERATION_STATUS[s].label}
							</option>
						))}
					</NativeSelect>
				</div>
				<div className="flex items-center gap-2">
					<label htmlFor="ai-kind" className="text-muted-foreground text-xs">
						Kind
					</label>
					<NativeSelect
						id="ai-kind"
						className="w-44"
						value={kind}
						onChange={(e) => setKind(e.target.value as GenerationKind | "all")}
					>
						<option value="all">All kinds</option>
						{KINDS.map((k) => (
							<option key={k} value={k}>
								{KIND_LABEL[k]}
							</option>
						))}
					</NativeSelect>
				</div>
				{filtered ? (
					<Button
						variant="ghost"
						size="sm"
						onClick={() => {
							setStatus("all");
							setKind("all");
						}}
					>
						<X />
						Clear
					</Button>
				) : null}
			</Toolbar>
			{query.isError && !query.data ? (
				<QueryError error={query.error} onRetry={() => void query.refetch()} />
			) : query.isPending ? (
				<TableCard>
					<TableSkeleton />
				</TableCard>
			) : items.length === 0 ? (
				<EmptyState
					icon={Sparkles}
					title={filtered ? "No generations match these filters" : "No AI generations yet"}
				/>
			) : (
				<TableCard>
					<table className={`${tableClass} relative`}>
						<caption className="sr-only">AI generations</caption>
						<thead>
							<tr>
								<th scope="col" className={thClass}>
									Organization
								</th>
								<th scope="col" className={thClass}>
									Kind
								</th>
								<th scope="col" className={thClass}>
									Status
								</th>
								<th scope="col" className={thClass}>
									Model
								</th>
								<th scope="col" className={`${thClass} text-right`}>
									Cost
								</th>
								<th scope="col" className={thClass}>
									Created
								</th>
							</tr>
						</thead>
						<tbody>
							{items.map((g) => {
								const s = statusMeta(GENERATION_STATUS, g.status);
								return (
									<tr key={g.id} className="transition-colors hover:bg-surface">
										<td className={tdClass}>
											<div className="flex items-center gap-3">
												<Monogram name={g.organization.name} />
												<div className="grid min-w-0 gap-0.5">
													<Link
														href={`/organizations/${g.organization.id}`}
														className="truncate font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
													>
														{g.organization.name}
													</Link>
													<div className="truncate text-muted-foreground text-xs">
														{g.userEmail ?? <None label="Unknown user" />}
													</div>
												</div>
											</div>
										</td>
										<td className={tdClass}>
											<Badge tone="outline">{KIND_LABEL[g.kind] ?? g.kind}</Badge>
										</td>
										<td className={tdClass}>
											<Badge tone={s.tone} dot>
												{s.label}
											</Badge>
											{g.errorCode ? (
												<code className="mt-1 block font-mono text-danger text-xs">
													{g.errorCode}
												</code>
											) : null}
										</td>
										<td className={tdClass}>
											{g.model ? (
												<code className="font-mono text-muted-foreground text-xs">{g.model}</code>
											) : (
												<None />
											)}
										</td>
										<td className={`${tdClass} text-right font-mono tabular-nums`}>
											{formatUsdPrecise(g.costUsd)}
										</td>
										<td
											className={`${tdClass} whitespace-nowrap font-mono text-muted-foreground text-xs`}
										>
											<span title={formatDateTime(g.createdAt)}>{formatRelative(g.createdAt)}</span>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
					<LoadMore
						hasNextPage={query.hasNextPage}
						isFetchingNextPage={query.isFetchingNextPage}
						fetchNextPage={() => void query.fetchNextPage()}
						shown={items.length}
					/>
				</TableCard>
			)}
		</>
	);
}
