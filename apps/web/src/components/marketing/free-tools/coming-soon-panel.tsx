import { Clock, type LucideIcon } from "lucide-react";
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
		<div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/5 p-8 text-center shadow-2xl backdrop-blur-md sm:p-12">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -top-24 left-1/2 h-48 w-80 -translate-x-1/2 rounded-full bg-primary/20 blur-[80px]"
			/>
			<div className="relative">
				<div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-3xl border border-primary/30 bg-primary/10 text-primary">
					<Icon className="size-8" aria-hidden="true" />
				</div>
				<p className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1 font-bold text-primary text-xs uppercase tracking-widest">
					<Clock className="size-3.5" aria-hidden="true" />
					Coming soon
				</p>
				<h2 className="font-medium text-2xl text-white tracking-tight sm:text-3xl">
					The {toolName} is on its way
				</h2>
				<p className="mx-auto mt-4 max-w-xl text-white/60 leading-relaxed">{description}</p>
				<div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
					<CtaLink href="/signup" size="md">
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
