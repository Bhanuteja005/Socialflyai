"use client";

import { Check } from "lucide-react";
import { DropdownMenu as Menu } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "../lib/utils";

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;
export const DropdownMenuRadioGroup = Menu.RadioGroup;

export function DropdownMenuContent({
	className,
	sideOffset = 6,
	...props
}: ComponentProps<typeof Menu.Content>) {
	return (
		<Menu.Portal>
			<Menu.Content
				sideOffset={sideOffset}
				className={cn(
					"z-50 min-w-48 overflow-hidden rounded-lg border border-border bg-surface-raised p-1 text-foreground shadow-lg data-[state=open]:animate-scale-in",
					className,
				)}
				{...props}
			/>
		</Menu.Portal>
	);
}

const itemClass =
	"relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[highlighted]:bg-muted data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

export function DropdownMenuItem({
	className,
	destructive,
	...props
}: ComponentProps<typeof Menu.Item> & { destructive?: boolean }) {
	return (
		<Menu.Item
			className={cn(
				itemClass,
				destructive && "text-danger data-[highlighted]:bg-danger-soft [&_svg]:text-danger",
				className,
			)}
			{...props}
		/>
	);
}

export function DropdownMenuRadioItem({
	className,
	children,
	...props
}: ComponentProps<typeof Menu.RadioItem>) {
	return (
		<Menu.RadioItem className={cn(itemClass, "pr-8", className)} {...props}>
			{children}
			<Menu.ItemIndicator className="absolute right-2 inline-flex">
				<Check className="!text-primary-text" aria-hidden="true" />
			</Menu.ItemIndicator>
		</Menu.RadioItem>
	);
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Menu.Label>) {
	return (
		<Menu.Label
			className={cn("px-2 py-1.5 font-medium text-muted-foreground text-xs", className)}
			{...props}
		/>
	);
}

export function DropdownMenuSeparator({
	className,
	...props
}: ComponentProps<typeof Menu.Separator>) {
	return <Menu.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}
