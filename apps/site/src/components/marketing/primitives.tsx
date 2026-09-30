import { cn } from "@socialfly/ui/utils";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Low-level building blocks for the marketing site. Monochrome by design (docs/design.md):
 * ink pills for actions, white soft panels, Geist Pixel for headlines, DM Mono for numbers.
 * Everything resolves through theme tokens, so the light and dark themes both work.
 */

export const focusRing =
	"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * Soft green glow that fades out below the top of a hero. Decorative only; no texture. (The name
 * predates the removal of the pixel texture.)
 */
export function PixelField({ className }: { className?: string }) {
	return (
		<div
			aria-hidden="true"
			className={cn(
				"pointer-events-none absolute inset-x-0 top-0 h-[560px] [mask-image:linear-gradient(to_bottom,black,transparent)]",
				className,
			)}
		>
			<div className="bg-glow size-full" />
		</div>
	);
}

/** Small mono pill label above headings. */
export function Eyebrow({
	icon: Icon,
	children,
	className,
}: {
	icon?: LucideIcon;
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-surface-raised px-3.5 py-1 font-mono text-muted-foreground text-xs",
				className,
			)}
		>
			{Icon ? <Icon className="size-3.5 shrink-0" aria-hidden="true" /> : null}
			<span>{children}</span>
		</div>
	);
}

/** Highlighted words inside a heading, in the brand green. */
export function Accent({ children }: { children: ReactNode }) {
	return <span className="text-brand-text">{children}</span>;
}

export const headingDisplay =
	"font-pixel font-normal text-[40px] text-foreground leading-[1.05] sm:text-[56px] lg:text-[64px] text-balance";
export const headingSection =
	"font-pixel font-normal text-[32px] text-foreground leading-[1.1] sm:text-[40px] lg:text-[44px] text-balance";
export const headingSub = "font-medium text-2xl text-foreground tracking-[-0.02em] sm:text-3xl";

/** Centered section heading block (eyebrow + h2 + lead paragraph). */
export function SectionHeading({
	eyebrow,
	eyebrowIcon,
	title,
	description,
	className,
	titleClassName,
	as: Tag = "h2",
}: {
	eyebrow?: string;
	eyebrowIcon?: LucideIcon;
	title: ReactNode;
	description?: ReactNode;
	className?: string;
	/** Replaces the default heading style. */
	titleClassName?: string;
	as?: "h1" | "h2";
}) {
	return (
		<div className={cn("mx-auto max-w-3xl text-center", className)}>
			{eyebrow ? (
				<Eyebrow icon={eyebrowIcon} className="mb-6">
					{eyebrow}
				</Eyebrow>
			) : null}
			<Tag className={titleClassName ?? (Tag === "h1" ? headingDisplay : headingSection)}>
				{title}
			</Tag>
			{description ? (
				<p className="mt-5 text-base text-muted-foreground leading-relaxed sm:text-lg">
					{description}
				</p>
			) : null}
		</div>
	);
}

type CtaVariant = "primary" | "secondary" | "ghost";

const ctaVariants: Record<CtaVariant, string> = {
	primary: "bg-brand text-brand-foreground hover:bg-brand-hover",
	secondary: "border border-border bg-surface-raised text-foreground hover:bg-muted",
	ghost: "text-muted-foreground hover:text-foreground",
};

export type CtaLinkProps = {
	href: string;
	children: ReactNode;
	variant?: CtaVariant;
	size?: "md" | "lg";
	icon?: LucideIcon;
	className?: string;
};

/** Pill-shaped call-to-action link. */
export function CtaLink({
	href,
	children,
	variant = "primary",
	size = "lg",
	icon: Icon,
	className,
}: CtaLinkProps) {
	return (
		<Link
			href={href}
			className={cn(
				"inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors duration-150 active:scale-[0.98]",
				size === "lg" ? "h-12 px-6 text-[15px]" : "h-10 px-5 text-sm",
				ctaVariants[variant],
				focusRing,
				className,
			)}
		>
			{Icon ? <Icon className="size-5" aria-hidden="true" /> : null}
			{children}
		</Link>
	);
}

/** Soft white panel used for cards and mockups. */
export function GlassCard({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<div className={cn("rounded-3xl border border-border bg-surface-raised p-6 sm:p-8", className)}>
			{children}
		</div>
	);
}

/** Standard horizontal page container. */
export function Container({
	children,
	className,
	size = "xl",
}: {
	children: ReactNode;
	className?: string;
	size?: "md" | "lg" | "xl";
}) {
	const max = { md: "max-w-4xl", lg: "max-w-6xl", xl: "max-w-7xl" }[size];
	return (
		<div className={cn("mx-auto w-full px-4 sm:px-6 lg:px-10", max, className)}>{children}</div>
	);
}
