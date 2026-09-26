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
									className="absolute top-7 left-[calc(50%+2.5rem)] hidden w-[calc(100%-5rem)] border-border-strong border-t border-dashed md:block"
								/>
							) : null}
							<div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl border border-border bg-surface-raised text-foreground">
								<Icon className="size-6" aria-hidden="true" />
							</div>
							<p aria-hidden="true" className="mb-1 font-mono text-subtle-foreground text-xs">
								{String(index + 1).padStart(2, "0")}
							</p>
							<h3 className="font-medium text-foreground text-lg">
								<span className="sr-only">Step {index + 1}: </span>
								{stepTitle}
							</h3>
							<p className="mx-auto mt-3 max-w-xs text-muted-foreground text-sm leading-relaxed">
								{stepDescription}
							</p>
						</li>
					))}
				</ol>
			</Container>
		</section>
	);
}
