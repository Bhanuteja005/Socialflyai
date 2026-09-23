import type { ComponentProps } from "react";
import { cn } from "../lib/utils";

export const controlClass =
	"w-full min-w-0 rounded-md border border-input bg-surface-raised text-foreground text-sm shadow-xs transition-[border-color,box-shadow] placeholder:text-subtle-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/20";

export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
	return <input type={type} className={cn(controlClass, "flex h-9 px-3", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
	return <textarea className={cn(controlClass, "flex min-h-24 px-3 py-2", className)} {...props} />;
}
