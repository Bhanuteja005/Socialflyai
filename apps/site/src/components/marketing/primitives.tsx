import { cn } from "@socialfly/ui/utils";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Low-level building blocks for the dark marketing theme. Brand accent is the `primary`
 * token (#0BE27D); the marketing layout forces the `.dark` token set so tokens resolve to
 * their dark values regardless of the visitor's app theme.
 */

export const focusRing =
	"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/** Soft radial brand glow placed behind hero content. */
export function Glow({ className }: { className?: string }) {
	return (
		<div
			aria-hidden="true"
			className={cn(
				"pointer-events-none absolute top-40 left-1/2 h-[420px] w-[min(800px,100%)] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,#0BE27D_0%,transparent_70%)] opacity-15 blur-[120px]",
				className,
			)}
		/>
	);
}

/** Small pill label above headings. */
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
				"mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 font-medium text-primary text-sm backdrop-blur-sm",
				className,
			)}
		>
			{Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
			<span>{children}</span>
		</div>
	);
}

/** Highlighted words inside a heading. */
export function Accent({ children }: { children: ReactNode }) {
	return <span className="text-primary">{children}</span>;
}

export const headingDisplay =
	"font-medium text-4xl text-white tracking-[-0.04em] sm:text-5xl lg:text-6xl text-balance";
export const headingSection =
	"font-medium text-3xl text-white tracking-[-0.04em] sm:text-4xl lg:text-5xl text-balance";
export const headingSub = "font-medium text-2xl text-white tracking-[-0.03em] sm:text-4xl";

/** Centered section heading block (eyebrow + h2 + lead paragraph). */
export function SectionHeading({
	eyebrow,
	eyebrowIcon,
	title,
	description,
	className,
	as: Tag = "h2",
}: {
	eyebrow?: string;
	eyebrowIcon?: LucideIcon;
	title: ReactNode;
	description?: ReactNode;
	className?: string;
	as?: "h1" | "h2";
}) {
	return (
		<div className={cn("mx-auto max-w-3xl text-center", className)}>
			{eyebrow ? (
				<Eyebrow icon={eyebrowIcon} className="mb-6">
					{eyebrow}
				</Eyebrow>
			) : null}
			<Tag className={Tag === "h1" ? headingDisplay : headingSection}>{title}</Tag>
			{description ? (
				<p className="mt-5 text-base text-white/60 leading-relaxed sm:text-lg">{description}</p>
			) : null}
		</div>
	);
}

type CtaVariant = "primary" | "secondary" | "ghost";

const ctaVariants: Record<CtaVariant, string> = {
	primary:
		"bg-primary text-primary-foreground shadow-[0_0_25px_rgba(11,226,125,0.3)] hover:bg-primary-hover",
	secondary: "border border-white/10 bg-white/5 text-white backdrop-blur-md hover:bg-white/10",
	ghost: "text-white/80 hover:text-white",
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
				"inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-[transform,background-color] duration-200 hover:scale-[1.03] active:scale-[0.98]",
				size === "lg" ? "h-14 px-8 text-base sm:text-lg" : "h-11 px-6 text-sm",
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

/** Glassy rounded panel used for cards and mockups. */
export function GlassCard({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<div
			className={cn(
				"rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm sm:p-8",
				className,
			)}
		>
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
