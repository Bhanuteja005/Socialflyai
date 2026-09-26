import { Clock, type LucideIcon } from "lucide-react";
import { SIGNUP_URL } from "@/components/marketing/app-links";
import { CtaLink } from "../primitives";

/** Placeholder shown in place of tools that depended on the retired backend services. */
export function ComingSoonPanel({
	icon: Icon,
	toolName,
	description = "We're rebuilding this tool on our new platform. It will be back soon — in the meantime, explore our other free tools or start scheduling with SocialFly AI.",
}: {
	icon: LucideIcon;
	toolName: string;
	description?: string;
}) {
	return (
		<div className="relative overflow-hidden rounded-3xl border border-border bg-surface-raised p-8 text-center sm:p-12">
			<div className="relative">
				<div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl border border-border bg-surface text-foreground">
					<Icon className="size-5" aria-hidden="true" />
				</div>
				<p className="mb-4 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 font-mono text-muted-foreground text-xs">
					<Clock className="size-3.5" aria-hidden="true" />
					Coming soon
				</p>
				<h2 className="font-normal font-pixel text-[28px] text-foreground leading-tight sm:text-[32px]">
					The {toolName} is on its way
				</h2>
				<p className="mx-auto mt-4 max-w-xl text-muted-foreground leading-relaxed">{description}</p>
				<div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
					<CtaLink href={SIGNUP_URL} size="md">
						Start for free
					</CtaLink>
					<CtaLink href="/free-tools" variant="secondary" size="md">
						Browse free tools
					</CtaLink>
				</div>
			</div>
		</div>
	);
}
