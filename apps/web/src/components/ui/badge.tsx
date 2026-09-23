import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
	"inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 font-medium text-xs leading-4 [&_svg]:size-3",
	{
		variants: {
			tone: {
				neutral: "bg-muted text-muted-foreground",
				primary: "bg-primary-soft text-primary-text",
				success: "bg-success-soft text-success",
				warning: "bg-warning-soft text-warning",
				danger: "bg-danger-soft text-danger",
				info: "bg-info-soft text-info",
				violet: "bg-violet-soft text-violet",
				outline: "border border-border text-muted-foreground",
			},
		},
		defaultVariants: { tone: "neutral" },
	},
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

export function Badge({
	className,
	tone,
	dot = false,
	children,
	...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { dot?: boolean }) {
	return (
		<span className={cn(badgeVariants({ tone }), className)} {...props}>
			{dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden="true" /> : null}
			{children}
		</span>
	);
}
