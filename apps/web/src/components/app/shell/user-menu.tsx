"use client";

import { LogOut, Monitor, Moon, Sun, UserRound } from "lucide-react";
import Link from "next/link";
import { useTheme } from "@/components/providers/theme-provider";
import { Avatar } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentUser, useSignOut } from "@/hooks/use-session";
import type { Theme } from "@/lib/theme";

export function UserMenu() {
	const user = useCurrentUser();
	const signOut = useSignOut();
	const { theme, setTheme } = useTheme();
	const label = user?.name || user?.email || "Account";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="flex w-full cursor-pointer items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-muted"
				>
					<Avatar src={user?.avatarUrl} name={label} size="sm" />
					<span className="grid min-w-0 flex-1 leading-tight">
						<span className="truncate font-medium text-sm">{user?.name || "Your account"}</span>
						<span className="truncate text-muted-foreground text-xs">{user?.email}</span>
					</span>
					<span className="sr-only">Open account menu</span>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" side="top" className="w-60">
				<DropdownMenuLabel className="truncate">{user?.email}</DropdownMenuLabel>
				<DropdownMenuItem asChild>
					<Link href="/settings/account">
						<UserRound />
						Account settings
					</Link>
				</DropdownMenuItem>
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
