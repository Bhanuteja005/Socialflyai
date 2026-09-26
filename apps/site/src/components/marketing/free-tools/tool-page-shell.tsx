import { ArrowLeft, ArrowRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SIGNUP_URL } from "@/components/marketing/app-links";
import { Container, CtaLink, Eyebrow, focusRing, headingDisplay, PixelField } from "../primitives";

/** Hero for a single free-tool page: back link, badge, title, lead copy and the tool itself. */
export function ToolHero({
	badge,
	badgeIcon,
	title,
	description,
	children,
}: {
	badge: string;
	badgeIcon?: LucideIcon;
	title: ReactNode;
	description: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="relative overflow-hidden pt-28 pb-16 sm:pt-32 lg:pt-40 lg:pb-20">
			<PixelField className="top-24" />
			<Container size="lg" className="relative">
				<Link
					href="/free-tools"
					className={`group mb-10 inline-flex items-center gap-2 rounded font-medium text-sm text-muted-foreground transition-colors hover:text-foreground ${focusRing}`}
				>
					<ArrowLeft
						className="size-4 transition-transform group-hover:-translate-x-1"
						aria-hidden="true"
					/>
					Back to all tools
				</Link>
				<div className="mx-auto max-w-4xl text-center">
					<Eyebrow icon={badgeIcon} className="mb-8">
						{badge}
					</Eyebrow>
					<h1 className={headingDisplay}>{title}</h1>
					<p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground leading-relaxed sm:text-lg">
						{description}
					</p>
				</div>
				<div className="mx-auto mt-12 max-w-5xl">{children}</div>
			</Container>
		</section>
	);
}

/** Row nudging visitors towards the other tools and the full product. */
export function ToolPromo() {
	return (
		<section aria-label="More from SocialFly AI" className="border-border border-y py-10">
			<Container
				size="lg"
				className="flex flex-col items-center justify-between gap-6 text-center md:flex-row md:text-left"
			>
				<p className="max-w-xl text-muted-foreground">
					Like this tool? SocialFly AI schedules, publishes and analyses your content across every
					network from one calendar.
				</p>
				<div className="flex flex-col gap-3 sm:flex-row">
					<CtaLink href="/free-tools" variant="secondary" size="md">
						Check out our other tools
					</CtaLink>
					<CtaLink href={SIGNUP_URL} size="md" icon={ArrowRight}>
						Get started for free
					</CtaLink>
				</div>
			</Container>
		</section>
	);
}
