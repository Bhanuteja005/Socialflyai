import { cn } from "@socialfly/ui/utils";
import { Check, Minus, X } from "lucide-react";
import type { ReactNode } from "react";
import { Container, SectionHeading } from "./primitives";

/** `true` renders a check, `false` a dash (or cross for competitors), strings render as text. */
export type ComparisonCell = string | boolean;
export type ComparisonRow = { feature: string; values: ComparisonCell[] };

function Cell({
	value,
	highlighted,
	falseStyle,
}: {
	value: ComparisonCell;
	highlighted: boolean;
	falseStyle: "dash" | "cross";
}) {
	if (value === true) {
		return (
			<>
				<Check
					className={cn(
						"mx-auto size-5",
						highlighted ? "text-brand-text" : "text-muted-foreground",
					)}
					aria-hidden="true"
				/>
				<span className="sr-only">Included</span>
			</>
		);
	}
	if (value === false) {
		const Icon = falseStyle === "cross" ? X : Minus;
		return (
			<>
				<Icon
					className={cn(
						"mx-auto size-5",
						falseStyle === "cross" ? "text-danger" : "text-subtle-foreground",
					)}
					aria-hidden="true"
				/>
				<span className="sr-only">Not included</span>
			</>
		);
	}
	return <span className={highlighted ? "font-medium text-foreground" : undefined}>{value}</span>;
}

/**
 * Feature comparison table. Used for plan tiers on feature/solution pages and for
 * SocialFly-vs-competitor tables (pass `highlightColumn` for the SocialFly column).
 */
export function ComparisonTable({
	columns,
	rows,
	title,
	description,
	caption,
	highlightColumn,
	falseStyle = "dash",
	className,
}: {
	columns: string[];
	rows: ComparisonRow[];
	title?: ReactNode;
	description?: ReactNode;
	/** Accessible caption (visually hidden). */
	caption: string;
	highlightColumn?: number;
	falseStyle?: "dash" | "cross";
	className?: string;
}) {
	return (
		<section className={cn("py-20 sm:py-28", className)}>
			<Container size="lg">
				{title ? (
					<SectionHeading title={title} description={description} className="mb-12 sm:mb-16" />
				) : null}
				<div className="overflow-x-auto rounded-3xl border border-border bg-surface-raised">
					<table className="w-full min-w-[560px] text-left text-sm">
						<caption className="sr-only">{caption}</caption>
						<thead className="border-border border-b font-mono text-muted-foreground text-xs">
							<tr>
								<th scope="col" className="px-5 py-5 sm:px-8">
									Feature
								</th>
								{columns.map((column, index) => (
									<th
										key={column}
										scope="col"
										className={cn(
											"px-5 py-5 text-center sm:px-8",
											index === highlightColumn && "bg-surface text-brand-text",
										)}
									>
										{column}
									</th>
								))}
							</tr>
						</thead>
						<tbody className="divide-y divide-border">
							{rows.map((row) => (
								<tr key={row.feature} className="transition-colors hover:bg-muted">
									<th scope="row" className="px-5 py-4 font-medium text-foreground sm:px-8">
										{row.feature}
									</th>
									{row.values.map((value, index) => (
										<td
											// biome-ignore lint/suspicious/noArrayIndexKey: cells are positional and aligned with the column headers
											key={index}
											className={cn(
												"px-5 py-4 text-center text-muted-foreground sm:px-8",
												index === highlightColumn && "bg-surface",
											)}
										>
											<Cell
												value={value}
												highlighted={index === highlightColumn}
												falseStyle={falseStyle}
											/>
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</Container>
		</section>
	);
}
