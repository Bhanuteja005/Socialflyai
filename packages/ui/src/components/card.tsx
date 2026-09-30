import type { ComponentProps } from "react";
import { cn } from "../lib/utils";

export function Card({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"rounded-2xl border border-border bg-surface-raised text-foreground",
				className,
			)}
			{...props}
		/>
	);
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
	return <div className={cn("flex flex-col gap-1 p-5 pb-0", className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"h2">) {
	return <h2 className={cn("font-medium text-[15px] leading-6", className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<"p">) {
	return <p className={cn("text-muted-foreground text-sm", className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
	return <div className={cn("p-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"flex flex-wrap items-center justify-end gap-2 rounded-b-2xl border-border border-t bg-surface px-5 py-3",
				className,
			)}
			{...props}
		/>
	);
}
