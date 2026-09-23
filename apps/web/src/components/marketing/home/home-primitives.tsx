import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const STRIP_POSITIONS = ["10%", "20%", "30%", "40%", "50%", "60%", "70%", "80%", "90%"];

/** Evenly spaced faint vertical lines used as the landing page backdrop. */
export function GridLines({ className }: { className?: string }) {
	return (
		<div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 z-0", className)}>
			{STRIP_POSITIONS.map((left) => (
				<div
					key={left}
					className="absolute inset-y-0 w-px -translate-x-1/2 bg-white/[0.08]"
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
				"mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm text-white/90",
				variant === "green"
					? "border-primary/30 bg-primary/5 font-medium"
					: "border-white/15 bg-black/40",
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
	"text-balance font-medium text-4xl text-white leading-[1.05] tracking-[-0.03em] sm:text-5xl lg:text-[56px]";
