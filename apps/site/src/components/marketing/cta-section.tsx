import type { ReactNode } from "react";
import { SIGNUP_URL } from "@/components/marketing/app-links";
import { Container, CtaLink } from "./primitives";

/** Closing call-to-action: a black box in both themes (tokens scoped to dark) with the green pill. */
export function CtaSection({
	title = "Ready to grow without the guesswork?",
	description,
	ctaLabel = "Start free",
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
		<section className="relative py-20 text-center sm:py-28">
			<Container size="md" className="relative">
				<div className="dark rounded-3xl border border-border bg-surface px-6 py-14 text-foreground sm:px-12 sm:py-16">
					<h2 className="mx-auto max-w-3xl text-balance font-normal font-pixel text-[32px] text-foreground leading-[1.1] sm:text-[44px]">
						{title}
					</h2>
					{description ? (
						<p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
							{description}
						</p>
					) : null}
					<div className="mt-10 flex flex-col items-center">
						<CtaLink href={ctaHref} className="px-8">
							{ctaLabel}
						</CtaLink>
						{footnote ? (
							<p className="mt-5 font-mono text-muted-foreground text-xs">{footnote}</p>
						) : null}
					</div>
				</div>
			</Container>
		</section>
	);
}
