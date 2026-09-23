import { cn } from "@socialfly/ui/utils";
import type { ReactNode } from "react";

export function PageHeader({
	title,
	description,
	actions,
	className,
	eyebrow,
}: {
	title: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
	className?: string;
	eyebrow?: ReactNode;
}) {
	return (
		<div className={cn("mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
			<div className="grid min-w-0 gap-1">
				{eyebrow ? <div className="text-muted-foreground text-sm">{eyebrow}</div> : null}
				<h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
				{description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
			</div>
			{actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
		</div>
	);
}
