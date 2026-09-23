"use client";

import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { type ComponentProps, type ReactNode, useState } from "react";
import { cn } from "../lib/utils";
import { Button } from "./button";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
	className,
	children,
	hideClose = false,
	...props
}: ComponentProps<typeof DialogPrimitive.Content> & { hideClose?: boolean }) {
	return (
		<DialogPrimitive.Portal>
			<DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
			<DialogPrimitive.Content
				className={cn(
					"fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border border-border bg-surface-raised p-5 shadow-lg data-[state=open]:animate-scale-in sm:p-6",
					className,
				)}
				{...props}
			>
				{children}
				{hideClose ? null : (
					<DialogPrimitive.Close asChild>
						<Button
							variant="ghost"
							size="icon-sm"
							className="absolute top-3 right-3"
							aria-label="Close"
						>
							<X />
						</Button>
					</DialogPrimitive.Close>
				)}
			</DialogPrimitive.Content>
		</DialogPrimitive.Portal>
	);
}

export function DialogHeader({ className, ...props }: ComponentProps<"div">) {
	return <div className={cn("grid gap-1.5 pr-8", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			className={cn("flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end", className)}
			{...props}
		/>
	);
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
	return (
		<DialogPrimitive.Title
			className={cn("font-semibold text-base tracking-tight", className)}
			{...props}
		/>
	);
}

export function DialogDescription({
	className,
	...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
	return (
		<DialogPrimitive.Description
			className={cn("text-muted-foreground text-sm", className)}
			{...props}
		/>
	);
}

type ConfirmDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: ReactNode;
	description?: ReactNode;
	children?: ReactNode;
	confirmLabel?: string;
	cancelLabel?: string;
	tone?: "danger" | "primary";
	loading?: boolean;
	confirmDisabled?: boolean;
	onConfirm: () => void | Promise<void>;
};

/** A small "are you sure?" dialog. The confirm action may be async; the dialog stays open until it settles. */
export function ConfirmDialog({
	open,
	onOpenChange,
	title,
	description,
	children,
	confirmLabel = "Confirm",
	cancelLabel = "Cancel",
	tone = "primary",
	loading,
	confirmDisabled,
	onConfirm,
}: ConfirmDialogProps) {
	const [pending, setPending] = useState(false);
	const busy = loading ?? pending;
	return (
		<Dialog open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
			<DialogContent className="max-w-md" hideClose>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					{description ? <DialogDescription>{description}</DialogDescription> : null}
				</DialogHeader>
				{children}
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
						{cancelLabel}
					</Button>
					<Button
						variant={tone === "danger" ? "danger" : "primary"}
						loading={busy}
						disabled={confirmDisabled}
						onClick={async () => {
							setPending(true);
							try {
								await onConfirm();
							} finally {
								setPending(false);
							}
						}}
					>
						{confirmLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
