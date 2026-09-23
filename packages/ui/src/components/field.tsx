"use client";

import { Label as LabelPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/utils";

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
	return (
		<LabelPrimitive.Root
			className={cn("font-medium text-foreground text-sm leading-none", className)}
			{...props}
		/>
	);
}

type FieldProps = {
	label: ReactNode;
	htmlFor: string;
	error?: string | null;
	hint?: ReactNode;
	/** Rendered on the label row, right-aligned (e.g. a "Forgot password?" link). */
	action?: ReactNode;
	className?: string;
	children: ReactNode;
};

/** Label + control + hint/error, with ids wired for screen readers (see `fieldAria`). */
export function Field({ label, htmlFor, error, hint, action, className, children }: FieldProps) {
	return (
		<div className={cn("grid gap-1.5", className)}>
			<div className="flex min-h-4 items-center justify-between gap-2">
				<Label htmlFor={htmlFor}>{label}</Label>
				{action}
			</div>
			{children}
			{error ? (
				<p id={`${htmlFor}-error`} className="text-danger text-xs">
					{error}
				</p>
			) : hint ? (
				<p id={`${htmlFor}-hint`} className="text-muted-foreground text-xs">
					{hint}
				</p>
			) : null}
		</div>
	);
}

/** aria props for a control rendered inside <Field>. */
export function fieldAria(id: string, error?: string | null, hasHint = false) {
	if (error) return { "aria-invalid": true as const, "aria-describedby": `${id}-error` };
	return hasHint ? { "aria-describedby": `${id}-hint` } : {};
}
