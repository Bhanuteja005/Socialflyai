"use client";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@socialfly/ui/components/dropdown-menu";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";
import { ROLE_LABEL } from "@/lib/status";
import { useOrg } from "../org-provider";

function OrgMark({ name }: { name: string }) {
	return (
		<span
			className="flex size-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary to-emerald-600 font-semibold text-[12px] text-primary-foreground"
			aria-hidden="true"
		>
			{name.slice(0, 1).toUpperCase()}
		</span>
	);
}

export function OrgSwitcher() {
	const { org, organizations, switchOrg } = useOrg();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="flex w-full cursor-pointer items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-muted"
				>
					<OrgMark name={org.name} />
					<span className="grid min-w-0 flex-1 leading-tight">
						<span className="truncate font-semibold text-sm">{org.name}</span>
						<span className="truncate text-muted-foreground text-xs">{ROLE_LABEL[org.role]}</span>
					</span>
					<ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
					<span className="sr-only">Switch organization</span>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-64">
				<DropdownMenuLabel>Organizations</DropdownMenuLabel>
				{organizations.map((o) => (
					<DropdownMenuItem key={o.id} onSelect={() => o.id !== org.id && switchOrg(o.id)}>
						<OrgMark name={o.name} />
						<span className="min-w-0 flex-1 truncate">{o.name}</span>
						{o.id === org.id ? <Check className="!text-primary-text" aria-label="Current" /> : null}
					</DropdownMenuItem>
				))}
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<Link href="/onboarding?new=1">
						<Plus />
						New organization
					</Link>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
