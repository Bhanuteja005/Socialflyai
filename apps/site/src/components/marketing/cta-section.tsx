import type { ReactNode } from "react";
import { SIGNUP_URL } from "@/components/marketing/app-links";
import { Container, CtaLink, Glow } from "./primitives";

/** Closing call-to-action band. */
export function CtaSection({
	title = "Ready To Grow Without The Guess Work?",
	description,
	ctaLabel = "Get Started For Free",
	ctaHref = SIGNUP_URL,
	footnote,
}: {
	title?: ReactNode;
	description?: ReactNode;
	ctaLabel?: string;
	ctaHref?: string;
	footnote?: ReactNode;
}) {
	return (
		<section className="relative overflow-hidden pt-24 pb-20 text-center sm:pt-32">
			<Glow className="top-1/2 -translate-y-1/2 opacity-20" />
			<Container size="md" className="relative">
				<h2 className="mx-auto max-w-3xl text-balance font-medium text-4xl text-white tracking-[-0.05em] sm:text-6xl lg:text-7xl">
					{title}
				</h2>
				{description ? (
					<p className="mx-auto mt-6 max-w-2xl text-lg text-white/60">{description}</p>
				) : null}
				<div className="mt-10 flex flex-col items-center">
					<CtaLink href={ctaHref} className="px-10">
						{ctaLabel}
					</CtaLink>
					{footnote ? <p className="mt-6 text-sm text-white/50 italic">{footnote}</p> : null}
				</div>
			</Container>
		</section>
	);
}
