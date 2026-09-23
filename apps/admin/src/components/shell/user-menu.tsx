"use client";

import { Avatar } from "@socialfly/ui/components/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@socialfly/ui/components/dropdown-menu";
import type { Theme } from "@socialfly/ui/theme";
import { useTheme } from "@socialfly/ui/theme-provider";
import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import { useSignOut } from "@/hooks/use-session";
import { useMe } from "../admin-guard";

export function UserMenu() {
	const me = useMe();
	const signOut = useSignOut();
	const { theme, setTheme } = useTheme();
	const label = me.name || me.email;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="flex w-full cursor-pointer items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-muted"
				>
					<Avatar name={label} size="sm" />
					<span className="grid min-w-0 flex-1 leading-tight">
						<span className="truncate font-medium text-sm">{me.name || "Staff account"}</span>
						<span className="truncate text-muted-foreground text-xs">{me.email}</span>
					</span>
					<span className="sr-only">Open account menu</span>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" side="top" className="w-60">
				<DropdownMenuLabel className="truncate">
					{me.email}
					<span className="block font-normal text-muted-foreground text-xs">Platform admin</span>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuLabel>Theme</DropdownMenuLabel>
				<DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
					<DropdownMenuRadioItem value="light" onSelect={(e) => e.preventDefault()}>
						<Sun />
						Light
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="dark" onSelect={(e) => e.preventDefault()}>
						<Moon />
						Dark
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="system" onSelect={(e) => e.preventDefault()}>
						<Monitor />
						System
					</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
				<DropdownMenuSeparator />
				<DropdownMenuItem onSelect={() => void signOut()}>
					<LogOut />
					Sign out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
