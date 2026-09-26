import { cn } from "@socialfly/ui/utils";
import { ArrowRight, Clock, Sparkles } from "lucide-react";
import Link from "next/link";
import { CtaSection } from "@/components/marketing/cta-section";
import { FREE_TOOLS } from "@/components/marketing/free-tools/tools";
import { pageMetadata } from "@/components/marketing/metadata";
import {
	Accent,
	Container,
	Eyebrow,
	focusRing,
	headingDisplay,
	PixelField,
} from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "Free Social Media Tools",
	description:
		"Free professional tools to create, optimize and manage social media content: UTM generator, Twitter thread maker, LinkedIn text formatter, photo resizers and more.",
	path: "/free-tools",
});

export default function FreeToolsIndexPage() {
	return (
		<>
			<section className="relative overflow-hidden px-4 pt-32 pb-16 text-center sm:pt-40">
				<PixelField className="top-20 opacity-20" />
				<div className="relative mx-auto max-w-4xl">
					<Eyebrow icon={Sparkles} className="mb-6">
						Professional Tools
					</Eyebrow>
					<h1 className={headingDisplay}>
						Supercharge Your <br />
						<Accent>Social Workflow</Accent>
					</h1>
					<p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
						Access our suite of free professional tools designed to help you create, optimize, and
						manage your social media content with ease.
					</p>
				</div>
			</section>

			<Container className="pb-12">
				<ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
					{FREE_TOOLS.map((tool) => {
						const Icon = tool.icon;
						const soon = tool.status === "coming-soon";
						return (
							<li key={tool.slug}>
								<Link
									href={`/free-tools/${tool.slug}`}
									className={cn(
										"group relative flex h-full flex-col justify-between rounded-3xl border border-border bg-surface-raised p-6 transition-colors duration-300 hover:border-border-strong hover:bg-muted",
										focusRing,
									)}
								>
									<div>
										<div className="mb-5 flex items-start justify-between gap-3">
											<div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-foreground">
												<Icon className="size-6" aria-hidden="true" />
											</div>
											{soon ? (
												<span className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface-raised px-3 py-1 font-mono text-[11px] text-muted-foreground">
													<Clock className="size-3" aria-hidden="true" />
													Coming soon
												</span>
											) : (
												<span className="rounded-full bg-muted px-3 py-1 font-mono text-[11px] text-brand-text">
													Free
												</span>
											)}
										</div>
										<h2 className="mb-2 font-medium text-foreground text-xl transition-colors group-hover:text-brand-text">
											{tool.title}
										</h2>
										<p className="text-sm text-muted-foreground leading-relaxed">
											{tool.description}
										</p>
									</div>
									<div className="mt-8 flex items-center gap-2 font-medium text-brand-text text-sm">
										<span>{soon ? "Learn more" : "Try tool"}</span>
										<ArrowRight
											className="size-4 transition-transform group-hover:translate-x-1"
											aria-hidden="true"
										/>
									</div>
								</Link>
							</li>
						);
					})}
				</ul>
			</Container>

			<CtaSection
				title="Take Your Content Further"
				description="Use SocialFly AI's full suite to schedule, analyze, and grow your presence across all social platforms."
				ctaLabel="Sign Up For Free Now"
			/>
		</>
	);
}
