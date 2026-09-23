import { type ComparisonRow, ComparisonTable } from "./comparison-table";
import { type FaqItem, FaqSection } from "./faq-section";
import { type PricingPlan, PricingSection } from "./pricing-section";

export type FeaturePlanSectionsProps = {
	/** Feature name used in headings, e.g. "Agency Features". */
	comparisonLabel: string;
	pricingDescription: string;
	plans: PricingPlan[];
	highlightLabel?: string;
	columns?: string[];
	rows: ComparisonRow[];
	faqDescription: string;
	faqs: FaqItem[];
};

/** Pricing → plan comparison → FAQ tail shared by every feature page. */
export function FeaturePlanSections({
	comparisonLabel,
	pricingDescription,
	plans,
	highlightLabel,
	columns = ["Starter", "Pro", "Agency"],
	rows,
	faqDescription,
	faqs,
}: FeaturePlanSectionsProps) {
	return (
		<>
			<PricingSection
				plans={plans}
				description={pricingDescription}
				highlightLabel={highlightLabel}
			/>
			<ComparisonTable
				title={
					<>
						Compare all <span className="text-primary">{comparisonLabel}</span>
					</>
				}
				caption={`${comparisonLabel} by plan`}
				columns={columns}
				rows={rows}
				highlightColumn={1}
			/>
			<FaqSection
				items={faqs}
				description={faqDescription}
				className="bg-[radial-gradient(ellipse_140%_70%_at_50%_60%,#001a0d_0%,#000_80%)]"
			/>
		</>
	);
}
