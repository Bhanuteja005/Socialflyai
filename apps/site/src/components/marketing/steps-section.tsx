import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Container, SectionHeading } from "./primitives";

export type Step = { icon: LucideIcon; title: string; description: string };

/** Numbered "how it works" row. */
export function StepsSection({
	title,
	description,
	steps,
}: {
	title: ReactNode;
	description?: ReactNode;
	steps: Step[];
}) {
	return (
		<section className="py-20 sm:py-28">
			<Container>
				<SectionHeading title={title} description={description} className="mb-16" />
				<ol className="grid gap-12 md:grid-cols-3">
					{steps.map(({ icon: Icon, title: stepTitle, description: stepDescription }, index) => (
						<li key={stepTitle} className="group relative text-center">
							{index < steps.length - 1 ? (
								<div
									aria-hidden="true"
									className="absolute top-10 left-[calc(50%+3rem)] hidden w-[calc(100%-6rem)] border-white/10 border-t-2 border-dashed md:block"
								/>
							) : null}
							<div className="mx-auto mb-8 flex size-20 items-center justify-center rounded-3xl border border-white/10 bg-primary/10 text-primary shadow-[0_0_30px_rgba(11,226,125,0.05)] transition-transform group-hover:scale-105">
								<Icon className="size-10" aria-hidden="true" />
							</div>
							<h3 className="font-bold text-white text-xl">
								<span className="sr-only">Step {index + 1}: </span>
								{stepTitle}
							</h3>
							<p className="mt-4 text-white/60 leading-relaxed">{stepDescription}</p>
						</li>
					))}
				</ol>
			</Container>
		</section>
	);
}
