import { Check, Minus, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
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
					className={cn("mx-auto size-5", highlighted ? "text-primary" : "text-white/50")}
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
						falseStyle === "cross" ? "text-red-500/60" : "text-white/25",
					)}
					aria-hidden="true"
				/>
				<span className="sr-only">Not included</span>
			</>
		);
	}
	return <span className={highlighted ? "font-semibold text-white" : undefined}>{value}</span>;
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
				<div className="overflow-x-auto rounded-[28px] border border-white/10 bg-white/5 shadow-2xl backdrop-blur-md">
					<table className="w-full min-w-[560px] text-left text-sm">
						<caption className="sr-only">{caption}</caption>
						<thead className="bg-white/5 font-bold text-white/50 text-xs uppercase tracking-wider">
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
											index === highlightColumn && "bg-primary/5 text-primary",
										)}
									>
										{column}
									</th>
								))}
							</tr>
						</thead>
						<tbody className="divide-y divide-white/5">
							{rows.map((row) => (
								<tr key={row.feature} className="transition-colors hover:bg-white/[0.03]">
									<th scope="row" className="px-5 py-4 font-medium text-white sm:px-8">
										{row.feature}
									</th>
									{row.values.map((value, index) => (
										<td
											// biome-ignore lint/suspicious/noArrayIndexKey: cells are positional and aligned with the column headers
											key={index}
											className={cn(
												"px-5 py-4 text-center text-white/60 sm:px-8",
												index === highlightColumn && "bg-primary/5",
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
