import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "../lib/utils";

export const buttonVariants = cva(
	"relative inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-sm transition-[background-color,border-color,color,box-shadow,opacity] duration-150 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				primary: "bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover",
				secondary: "bg-muted text-foreground hover:bg-border",
				outline:
					"border border-border bg-surface-raised text-foreground shadow-xs hover:border-border-strong hover:bg-muted",
				ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
				danger: "bg-danger text-white shadow-xs hover:opacity-90",
				"danger-outline":
					"border border-danger/30 text-danger hover:border-danger/50 hover:bg-danger-soft",
				link: "text-primary-text underline-offset-4 hover:underline",
			},
			size: {
				xs: "h-7 rounded-sm px-2 text-xs [&_svg]:size-3.5",
				sm: "h-8 px-3",
				md: "h-9 px-4",
				lg: "h-11 px-5 text-[15px]",
				icon: "size-9",
				"icon-sm": "size-8",
				"icon-xs": "size-7 rounded-sm [&_svg]:size-3.5",
			},
		},
		compoundVariants: [{ variant: "link", className: "h-auto px-0" }],
		defaultVariants: { variant: "primary", size: "md" },
	},
);

export type ButtonProps = ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
		loading?: boolean;
	};

export function Button({
	className,
	variant,
	size,
	asChild = false,
	loading = false,
	disabled,
	children,
	type,
	...props
}: ButtonProps) {
	if (asChild) {
		return (
			<Slot.Root className={cn(buttonVariants({ variant, size }), className)} {...props}>
				{children}
			</Slot.Root>
		);
	}
	return (
		<button
			type={type ?? "button"}
			className={cn(buttonVariants({ variant, size }), className)}
			disabled={disabled || loading}
			aria-busy={loading || undefined}
			{...props}
		>
			{loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
			{children}
		</button>
	);
}
