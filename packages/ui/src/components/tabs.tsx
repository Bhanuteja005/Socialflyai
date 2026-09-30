"use client";

import { Tabs as TabsPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "../lib/utils";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
	return (
		<TabsPrimitive.List
			className={cn(
				"scrollbar-thin inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-border bg-surface-raised p-1",
				className,
			)}
			{...props}
		/>
	);
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
	return (
		<TabsPrimitive.Trigger
			className={cn(
				"inline-flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 font-medium text-muted-foreground text-[13px] transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-ink data-[state=active]:text-ink-foreground [&_svg]:size-3.5",
				className,
			)}
			{...props}
		/>
	);
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
	return (
		<TabsPrimitive.Content className={cn("focus-visible:outline-none", className)} {...props} />
	);
}
