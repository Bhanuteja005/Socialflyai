import { Loader2, type LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/utils";

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			aria-hidden="true"
			className={cn("animate-shimmer rounded-lg bg-muted", className)}
			{...props}
		/>
	);
}

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
	return (
		<span role="status" className="inline-flex">
			<Loader2
				className={cn("size-4 animate-spin text-muted-foreground", className)}
				aria-hidden="true"
			/>
			<span className="sr-only">{label}</span>
		</span>
	);
}

type EmptyStateProps = {
	icon?: LucideIcon;
	title: string;
	description?: ReactNode;
	action?: ReactNode;
	className?: string;
	compact?: boolean;
};

export function EmptyState({
	icon: Icon,
	title,
	description,
	action,
	className,
	compact,
}: EmptyStateProps) {
	return (
		<div
			className={cn(
				"relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-border border-dashed bg-surface-raised text-center",
				compact ? "gap-2.5 px-4 py-8" : "gap-3.5 px-6 py-16",
				className,
			)}
		>
			{Icon ? (
				<div
					className={cn(
						"relative flex items-center justify-center rounded-full border border-border bg-surface-raised",
						compact ? "size-10" : "size-12",
					)}
				>
					<Icon
						className={cn("text-muted-foreground", compact ? "size-[18px]" : "size-5")}
						aria-hidden="true"
					/>
				</div>
			) : null}
			<div className="relative grid max-w-sm gap-1">
				<p className={cn("font-medium text-foreground", compact ? "text-sm" : "text-[15px]")}>
					{title}
				</p>
				{description ? <div className="text-muted-foreground text-sm">{description}</div> : null}
			</div>
			{action ? (
				<div className="relative mt-1 flex flex-wrap justify-center gap-2">{action}</div>
			) : null}
		</div>
	);
}

type AlertProps = {
	tone?: "info" | "warning" | "danger" | "success";
	icon?: LucideIcon;
	title?: ReactNode;
	children?: ReactNode;
	className?: string;
	action?: ReactNode;
};

const alertTone = {
	info: "border-info/25 bg-info-soft text-info",
	warning: "border-warning/30 bg-warning-soft text-warning",
	danger: "border-danger/25 bg-danger-soft text-danger",
	success: "border-success/25 bg-success-soft text-success",
};

export function Alert({
	tone = "info",
	icon: Icon,
	title,
	children,
	className,
	action,
}: AlertProps) {
	return (
		<div
			role={tone === "danger" ? "alert" : "status"}
			className={cn("flex gap-3 rounded-2xl border px-4 py-3 text-sm", alertTone[tone], className)}
		>
			{Icon ? <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : null}
			<div className="grid min-w-0 flex-1 gap-0.5">
				{title ? <p className="font-medium">{title}</p> : null}
				{children ? <div className="text-foreground/80">{children}</div> : null}
			</div>
			{action ? <div className="shrink-0 self-center">{action}</div> : null}
		</div>
	);
}
