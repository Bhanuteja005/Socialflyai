import { cn } from "@socialfly/ui/utils";
import { Check } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SIGNUP_URL } from "@/components/marketing/app-links";
import { Container, focusRing, SectionHeading } from "./primitives";

export type PricingPlan = {
	name: string;
	price: string;
	description: string;
	features: string[];
	cta: string;
	/** Defaults to the app's sign-up page, or /contact when the CTA mentions sales. */
	href?: string;
	highlight?: boolean;
};

export function PricingSection({
	plans,
	title = (
		<>
			Invest in <span className="text-brand-text">Growth,</span> Not Just Tools
		</>
	),
	description = "Every viral post starts with a single high-quality measurement. Choose the plan that's right for your volume.",
	highlightLabel = "Best Value",
}: {
	plans: PricingPlan[];
	title?: ReactNode;
	description?: ReactNode;
	highlightLabel?: string;
}) {
	return (
		<section className="py-20 sm:py-28">
			<Container>
				<SectionHeading title={title} description={description} className="mb-16" />
				<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
					{plans.map((plan) => {
						const href = plan.href ?? (/sales/i.test(plan.cta) ? "/contact" : SIGNUP_URL);
						return (
							<article
								key={plan.name}
								className={cn(
									"relative flex flex-col justify-between rounded-3xl border bg-surface-raised p-7 text-left",
									plan.highlight ? "border-brand" : "border-border",
								)}
							>
								{plan.highlight ? (
									<div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-brand px-3 py-1 font-mono text-brand-foreground text-xs">
										{highlightLabel}
									</div>
								) : null}
								<div>
									<h3 className="font-medium text-base text-foreground">{plan.name}</h3>
									<p className="mt-4 flex items-baseline gap-1">
										<span className="font-mono text-5xl text-foreground tabular-nums tracking-tight">
											{plan.price}
										</span>
										<span className="font-mono text-sm text-muted-foreground">/mo</span>
									</p>
									<p className="mt-4 text-sm text-muted-foreground">{plan.description}</p>
									<ul className="mt-8 space-y-3 text-foreground">
										{plan.features.map((feature) => (
											<li key={feature} className="flex items-center gap-3 text-sm">
												<span
													aria-hidden="true"
													className={cn(
														"flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-soft",
														"text-brand-text",
													)}
												>
													<Check className="size-3.5" />
												</span>
												<span>{feature}</span>
											</li>
										))}
									</ul>
								</div>
								<Link
									href={href}
									className={cn(
										"mt-8 flex h-11 w-full items-center justify-center rounded-full font-medium text-sm transition-colors",
										plan.highlight
											? "bg-brand text-brand-foreground hover:bg-brand-hover"
											: "border border-border bg-surface-raised text-foreground hover:bg-muted",
										focusRing,
									)}
								>
									{plan.cta}
								</Link>
							</article>
						);
					})}
				</div>
			</Container>
		</section>
	);
}
