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
			className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary font-medium font-mono text-[12px] text-primary-foreground"
			aria-hidden="true"
		>
			{name.slice(0, 1).toUpperCase()}
		</span>
	);
}

export function OrgSwitcher({ collapsed = false }: { collapsed?: boolean }) {
	const { org, organizations, switchOrg } = useOrg();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className={
						collapsed
							? "flex cursor-pointer items-center justify-center self-center rounded-[10px] p-1.5 transition-colors hover:bg-black/[0.04] focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-black/[0.04] dark:hover:bg-white/[0.05]"
							: "flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] p-1.5 text-left transition-colors hover:bg-black/[0.04] focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-black/[0.04] dark:hover:bg-white/[0.05]"
					}
				>
					<OrgMark name={org.name} />
					{collapsed ? null : (
						<>
							<span className="grid min-w-0 flex-1 leading-tight">
								<span className="truncate font-medium text-sm">{org.name}</span>
								<span className="truncate font-mono text-[10px] text-muted-foreground uppercase">
									{ROLE_LABEL[org.role]}
								</span>
							</span>
							<ChevronsUpDown
								className="size-4 shrink-0 text-muted-foreground"
								aria-hidden="true"
							/>
						</>
					)}
					<span className="sr-only">Switch organization</span>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-64">
				<DropdownMenuLabel>Organizations</DropdownMenuLabel>
				{organizations.map((o) => (
					<DropdownMenuItem key={o.id} onSelect={() => o.id !== org.id && switchOrg(o.id)}>
						<OrgMark name={o.name} />
						<span className="min-w-0 flex-1 truncate">{o.name}</span>
						{o.id === org.id ? <Check aria-label="Current" /> : null}
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
