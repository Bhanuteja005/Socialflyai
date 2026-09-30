import { cn } from "@socialfly/ui/utils";
import Image from "next/image";
import type { ReactNode } from "react";

/*
 * The landing page was designed dark (black, green glow). Every `dark:` class below is the
 * original design, value for value; the unprefixed classes are its light counterpart.
 */

const STRIP_POSITIONS = ["10%", "20%", "30%", "40%", "50%", "60%", "70%", "80%", "90%"];

/** Evenly spaced faint vertical lines used as the landing page backdrop. */
export function GridLines({ className }: { className?: string }) {
	return (
		<div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 z-0", className)}>
			{STRIP_POSITIONS.map((left) => (
				<div
					key={left}
					className="absolute inset-y-0 w-px -translate-x-1/2 bg-black/[0.05] dark:bg-white/[0.08]"
					style={{ left }}
				/>
			))}
		</div>
	);
}

/** Pill label with the brand sparkle used above landing headings. */
export function HomeEyebrow({
	children,
	variant = "neutral",
	className,
}: {
	children: ReactNode;
	variant?: "neutral" | "green";
	className?: string;
}) {
	return (
		<div
			className={cn(
				"mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-foreground text-sm dark:text-white/90",
				variant === "green"
					? "border-brand/40 bg-brand/[0.08] font-medium dark:border-primary/30 dark:bg-primary/5"
					: "border-black/10 bg-white dark:border-white/15 dark:bg-black/40",
				className,
			)}
		>
			<Image
				src="/assets/landingpage/Vector.svg"
				alt=""
				width={24}
				height={24}
				className="size-4 shrink-0"
			/>
			<span>{children}</span>
		</div>
	);
}

export const homeHeading =
	"text-balance font-medium text-4xl text-foreground leading-[1.05] tracking-[-0.03em] sm:text-5xl lg:text-[56px] dark:text-white";

/**
 * Filter for the landing artwork, which is dark UI exported from the original design. In light
 * mode, invert + a 180° hue turn flips it to a light UI while keeping hues (the green stays
 * green); dark mode shows it untouched.
 */
export const lightArt = "invert hue-rotate-180 dark:invert-0 dark:hue-rotate-0";
