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
			Invest in <span className="text-primary">Growth,</span> Not Just Tools
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
				<div className="grid gap-8 md:grid-cols-3">
					{plans.map((plan) => {
						const href = plan.href ?? (/sales/i.test(plan.cta) ? "/contact" : SIGNUP_URL);
						return (
							<article
								key={plan.name}
								className={cn(
									"relative flex flex-col justify-between rounded-[32px] p-8 text-left transition-transform duration-300 hover:-translate-y-1",
									plan.highlight
										? "border border-primary/40 bg-primary/5 shadow-[0_0_50px_rgba(11,226,125,0.1)] ring-4 ring-primary/5"
										: "border border-white/10 bg-white/5",
								)}
							>
								{plan.highlight ? (
									<div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-primary px-4 py-1 font-bold text-black text-xs uppercase tracking-widest">
										{highlightLabel}
									</div>
								) : null}
								<div>
									<h3 className="font-bold text-white text-xl">{plan.name}</h3>
									<p className="mt-4 flex items-baseline gap-1">
										<span className="font-bold text-5xl text-white tracking-tight">
											{plan.price}
										</span>
										<span className="font-semibold text-sm text-white/50">/mo</span>
									</p>
									<p className="mt-4 text-sm text-white/60">{plan.description}</p>
									<ul className="mt-10 space-y-4 text-white/80">
										{plan.features.map((feature) => (
											<li key={feature} className="flex items-center gap-3 text-sm">
												<span
													aria-hidden="true"
													className={cn(
														"flex size-5 shrink-0 items-center justify-center rounded-full bg-white/5",
														plan.highlight ? "text-primary" : "text-white/40",
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
										"mt-10 flex h-14 w-full items-center justify-center rounded-2xl font-bold transition-colors",
										plan.highlight
											? "bg-primary text-black hover:bg-primary-hover"
											: "border border-white/10 bg-white/5 text-white hover:bg-white/10",
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
