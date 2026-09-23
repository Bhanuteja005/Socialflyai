import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Container, CtaLink, type CtaLinkProps, Eyebrow, Glow, headingDisplay } from "./primitives";

export type HeroAction = Omit<CtaLinkProps, "children"> & { label: string };

export type PageHeroProps = {
	badge?: { icon?: LucideIcon; label: string };
	/** Heading content; wrap highlighted words in <Accent>. */
	title: ReactNode;
	description?: ReactNode;
	actions?: HeroAction[];
	/** Optional visual rendered below the copy (mockup, stats…). */
	children?: ReactNode;
	align?: "center" | "left";
};

/** Top-of-page hero used by feature, solution and company pages. */
export function PageHero({
	badge,
	title,
	description,
	actions,
	children,
	align = "center",
}: PageHeroProps) {
	const centered = align === "center";
	return (
		<section className="relative overflow-hidden pt-32 pb-16 lg:pt-44 lg:pb-24">
			<Glow />
			<Container className={centered ? "relative text-center" : "relative"}>
				<div className={centered ? "mx-auto max-w-4xl" : "max-w-3xl"}>
					{badge ? (
						<Eyebrow icon={badge.icon} className="mb-8">
							{badge.label}
						</Eyebrow>
					) : null}
					<h1 className={`${headingDisplay} lg:text-7xl`}>{title}</h1>
					{description ? (
						<p className="mt-6 text-lg text-white/60 leading-8 sm:mt-8 sm:text-xl">{description}</p>
					) : null}
					{actions && actions.length > 0 ? (
						<div
							className={`mt-10 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center ${centered ? "sm:justify-center" : ""}`}
						>
							{actions.map(({ label, ...action }) => (
								<CtaLink key={label} {...action}>
									{label}
								</CtaLink>
							))}
						</div>
					) : null}
				</div>
				{children ? (
					<div className="relative mx-auto mt-16 max-w-5xl lg:mt-20">{children}</div>
				) : null}
			</Container>
		</section>
	);
}
