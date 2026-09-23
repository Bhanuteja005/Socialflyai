"use client";

import { Avatar as AvatarPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "../lib/utils";

const sizes = {
	xs: "size-5 text-[9px]",
	sm: "size-7 text-[11px]",
	md: "size-9 text-xs",
	lg: "size-12 text-sm",
} as const;

type AvatarProps = {
	src?: string | null;
	name?: string | null;
	size?: keyof typeof sizes;
	className?: string;
	/** Small badge in the bottom-right corner (e.g. the platform icon). */
	badge?: ReactNode;
	square?: boolean;
};

export function initials(name?: string | null) {
	const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	return (
		(parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")
	).toUpperCase();
}

export function Avatar({ src, name, size = "md", className, badge, square }: AvatarProps) {
	return (
		<span className={cn("relative inline-flex shrink-0", className)}>
			<AvatarPrimitive.Root
				className={cn(
					"inline-flex select-none items-center justify-center overflow-hidden bg-muted align-middle",
					square ? "rounded-md" : "rounded-full",
					sizes[size],
				)}
			>
				{src ? (
					<AvatarPrimitive.Image
						src={src}
						alt={name ?? ""}
						className="size-full object-cover"
						referrerPolicy="no-referrer"
					/>
				) : null}
				<AvatarPrimitive.Fallback
					className="flex size-full items-center justify-center font-semibold text-muted-foreground"
					delayMs={src ? 400 : 0}
				>
					{initials(name)}
				</AvatarPrimitive.Fallback>
			</AvatarPrimitive.Root>
			{badge ? (
				<span className="absolute -right-1 -bottom-1 flex rounded-full ring-2 ring-surface-raised">
					{badge}
				</span>
			) : null}
		</span>
	);
}
