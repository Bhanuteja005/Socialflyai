import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { CtaSection } from "./cta-section";
import { type FeatureSplitProps, FeatureSplitSection } from "./feature-split";
import { type MetricTile, MetricTiles, MockupFrame } from "./mockups";
import { type HeroAction, PageHero } from "./page-hero";
import { type PricingPlan, PricingSection } from "./pricing-section";

export type SolutionPageData = {
	hero: {
		badge: { icon: LucideIcon; label: string };
		title: ReactNode;
		description: string;
		actions: HeroAction[];
		metrics: MetricTile[];
	};
	features: FeatureSplitProps[];
	pricing: { title: ReactNode; description: string; plans: PricingPlan[] };
	cta: { title: ReactNode; description?: string; ctaLabel?: string };
};

/** Template shared by every /solutions/* page: hero, feature blocks, pricing, closing CTA. */
export function SolutionPage({ data }: { data: SolutionPageData }) {
	const { hero, features, pricing, cta } = data;
	return (
		<>
			<PageHero
				badge={hero.badge}
				title={hero.title}
				description={hero.description}
				actions={hero.actions}
			>
				<MetricTiles
					tiles={hero.metrics}
					className={
						hero.metrics.length === 3
							? "rounded-[32px] border border-white/10 bg-white/5 p-4 lg:grid-cols-3 lg:p-8"
							: "rounded-[32px] border border-white/10 bg-white/5 p-4 lg:p-8"
					}
				/>
			</PageHero>
			<FeatureSplitSection items={features} />
			<PricingSection
				title={pricing.title}
				description={pricing.description}
				plans={pricing.plans}
			/>
			<CtaSection title={cta.title} description={cta.description} ctaLabel={cta.ctaLabel} />
		</>
	);
}

/** Status panel with a header line and a row of hashtag chips. */
export function TagPanel({
	icon,
	title,
	tags,
}: {
	icon: LucideIcon;
	title: string;
	tags: string[];
}) {
	return (
		<MockupFrame title={title} icon={icon}>
			<ul className="flex flex-wrap gap-2">
				{tags.map((tag) => (
					<li key={tag} className="rounded-full bg-white/5 px-3 py-1 text-white/60 text-xs">
						{tag}
					</li>
				))}
			</ul>
		</MockupFrame>
	);
}

/** Campaign progress panel. */
export function ProgressPanel({
	icon,
	title,
	percent,
	caption,
}: {
	icon: LucideIcon;
	title: string;
	percent: number;
	caption: string;
}) {
	return (
		<MockupFrame title={title} icon={icon}>
			<div className="h-2 w-full overflow-hidden rounded bg-white/5">
				<div className="h-full bg-primary" style={{ width: `${percent}%` }} />
			</div>
			<p className="mt-3 text-right font-black text-[10px] text-white/50 uppercase">{caption}</p>
		</MockupFrame>
	);
}
