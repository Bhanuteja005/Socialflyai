"use client";

import { Button } from "@socialfly/ui/components/button";
import { Card } from "@socialfly/ui/components/card";
import { cn } from "@socialfly/ui/utils";
import {
	Check,
	ChevronRight,
	MessageSquareQuote,
	PenSquare,
	Radio,
	UserPlus,
	X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useChannels, useMembers, usePosts } from "@/hooks/queries";
import { useBrandProfile } from "@/hooks/use-ai";
import { useOrg } from "../org-provider";

const DISMISS_KEY = "sf.setup.dismissed";

/**
 * Getting-started steps for a new workspace. Each step's state is derived from real data,
 * so it completes itself; the card disappears once everything is done or it is dismissed.
 */
export function SetupChecklist() {
	const { orgId, can } = useOrg();
	const channels = useChannels();
	const posts = usePosts({ limit: "1" });
	const brand = useBrandProfile();
	const members = useMembers();
	const [dismissed, setDismissed] = useState(true);

	useEffect(() => {
		try {
			setDismissed(localStorage.getItem(`${DISMISS_KEY}.${orgId}`) === "1");
		} catch {
			setDismissed(false);
		}
	}, [orgId]);

	const ready = channels.isSuccess && posts.isSuccess && brand.isSuccess && members.isSuccess;
	if (!ready || dismissed) return null;

	const steps = [
		{
			done: channels.data.length > 0,
			title: "Connect a channel",
			body: "Link Instagram, LinkedIn, X and more.",
			href: "/channels#connect",
			icon: Radio,
			allowed: can("admin"),
		},
		{
			done: Boolean(brand.data?.updatedAt),
			title: "Describe your brand voice",
			body: "So AI drafts sound like you.",
			href: "/settings/brand",
			icon: MessageSquareQuote,
			allowed: can("admin"),
		},
		{
			done: posts.data.length > 0,
			title: "Schedule your first post",
			body: "Write once, publish everywhere.",
			href: "/compose",
			icon: PenSquare,
			allowed: can("editor"),
		},
		{
			done: members.data.length > 1,
			title: "Invite your team",
			body: "Editors, approvers and viewers.",
			href: "/settings/team",
			icon: UserPlus,
			allowed: can("admin"),
		},
	].filter((s) => s.allowed);
	const doneCount = steps.filter((s) => s.done).length;
	if (steps.length === 0 || doneCount === steps.length) return null;

	const dismiss = () => {
		setDismissed(true);
		try {
			localStorage.setItem(`${DISMISS_KEY}.${orgId}`, "1");
		} catch {
			// Hidden for this visit only.
		}
	};

	return (
		<Card className="relative mb-8 overflow-hidden">
			<div className="relative flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
				<div className="grid gap-0.5">
					<h2 className="font-medium text-[15px]">Get set up</h2>
					<p className="text-muted-foreground text-sm">
						{doneCount} of {steps.length} done — a few minutes to a fully running workspace.
					</p>
				</div>
				<div className="flex items-center gap-3">
					<div
						className="h-1.5 w-32 overflow-hidden rounded-full bg-muted"
						role="progressbar"
						aria-label="Setup progress"
						aria-valuemin={0}
						aria-valuemax={steps.length}
						aria-valuenow={doneCount}
					>
						<div
							className="h-full rounded-full bg-primary transition-[width]"
							style={{ width: `${(doneCount / steps.length) * 100}%` }}
						/>
					</div>
					<Button variant="ghost" size="icon-xs" onClick={dismiss} aria-label="Hide setup steps">
						<X />
					</Button>
				</div>
			</div>
			<ol className="relative grid gap-2 p-5 sm:grid-cols-2 xl:grid-cols-4">
				{steps.map((s) => {
					const Icon = s.icon;
					return (
						<li key={s.title}>
							<Link
								href={s.href}
								className={cn(
									"group flex h-full items-start gap-3 rounded-xl border p-3 transition-colors focus-visible:outline-2 focus-visible:outline-ring",
									s.done
										? "border-transparent bg-muted/60"
										: "border-border bg-surface-raised hover:border-border-strong",
								)}
							>
								<span
									className={cn(
										"flex size-8 shrink-0 items-center justify-center rounded-full",
										s.done
											? "bg-primary text-primary-foreground"
											: "bg-muted text-muted-foreground",
									)}
								>
									{s.done ? (
										<Check className="size-4" strokeWidth={3} aria-hidden="true" />
									) : (
										<Icon className="size-4" aria-hidden="true" />
									)}
								</span>
								<span className="grid min-w-0 flex-1 gap-0.5">
									<span
										className={cn(
											"font-medium text-[13px]",
											s.done && "text-muted-foreground line-through decoration-border-strong",
										)}
									>
										{s.title}
										<span className="sr-only">{s.done ? " (done)" : ""}</span>
									</span>
									<span className="text-muted-foreground text-xs">{s.body}</span>
								</span>
								{s.done ? null : (
									<ChevronRight
										className="mt-2 size-4 shrink-0 text-subtle-foreground transition-transform group-hover:translate-x-0.5"
										aria-hidden="true"
									/>
								)}
							</Link>
						</li>
					);
				})}
			</ol>
		</Card>
	);
}
