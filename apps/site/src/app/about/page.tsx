import { Globe, Heart, Sparkles, Target, Zap } from "lucide-react";
import { CtaSection } from "@/components/marketing/cta-section";
import { pageMetadata } from "@/components/marketing/metadata";
import { PageHero } from "@/components/marketing/page-hero";
import {
	Accent,
	Container,
	Eyebrow,
	GlassCard,
	headingDisplay,
	headingSub,
} from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "About Us",
	description:
		"SocialflyAI is on a mission to empower every brand, creator and business with autonomous social media tools that actually understand human engagement.",
	path: "/about",
});

const VALUES = [
	{
		title: "Transparency",
		description: "No black boxes. Our AI insights are clear, actionable, and driven by real data.",
		icon: Globe,
	},
	{
		title: "Empathy",
		description:
			"We build for humans. Every automation is designed to enhance, not replace, genuine connection.",
		icon: Heart,
	},
	{
		title: "Excellence",
		description:
			"Continuous innovation. We pride ourselves on setting the standard for AI-native performance.",
		icon: Sparkles,
	},
];

const STATS = [
	{ label: "Founded", value: "2024", icon: Globe },
	{ label: "Target Growth", value: "10x", icon: Target },
];

const MILESTONES = [
	{
		year: "2024",
		event: "SocialflyAI Launch",
		description: "First AI native social engine released for early adopters.",
	},
	{
		year: "2025",
		event: "Global Platform Sync",
		description: "Reached 1M+ automated interactions across 4 continents.",
	},
	{
		year: "2026",
		event: "The Unified Era",
		description: "Launched full solution vertical for agencies and creators.",
	},
	{
		year: "Future",
		event: "Autonomous Excellence",
		description: "Building the next generation of social intelligence.",
	},
];

export default function AboutPage() {
	return (
		<>
			<PageHero
				badge={{ icon: Sparkles, label: "The Future of AI-Native Social Media" }}
				title={
					<>
						Redefining <Accent>Social</Accent> <br />
						Intelligence.
					</>
				}
				description="We're on a mission to empower every brand, creator, and business with autonomous social media tools that actually understand human engagement."
			>
				<ul className="grid grid-cols-1 gap-6 text-left md:grid-cols-3">
					{VALUES.map(({ title, description, icon: Icon }) => (
						<li key={title}>
							<GlassCard className="h-full">
								<Icon className="mb-6 size-8 text-brand-text" aria-hidden="true" />
								<h2 className="mb-3 font-medium text-foreground text-xl">{title}</h2>
								<p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
							</GlassCard>
						</li>
					))}
				</ul>
			</PageHero>

			<section className="py-16 sm:py-24">
				<Container>
					<div className="flex flex-col items-center gap-12 lg:flex-row lg:gap-16">
						<div className="max-w-xl">
							<h2 className={headingSub}>
								Empowering Human Connection with <br />
								<Accent>Autonomous Insights.</Accent>
							</h2>
							<p className="mt-6 text-lg text-muted-foreground leading-relaxed">
								Technology should bring us closer, not just keep us busy. SocialflyAI was founded to
								solve the burnout endemic in social media marketing. We&apos;ve built an AI that
								doesn&apos;t just post—it predicts, interacts, and grows with your community.
							</p>
							<dl className="mt-10 grid grid-cols-2 gap-4 sm:gap-6">
								{STATS.map(({ label, value, icon: Icon }) => (
									<div
										key={label}
										className="rounded-2xl border border-border bg-surface-raised p-5 sm:p-6"
									>
										<Icon className="mb-4 size-5 text-brand-text" aria-hidden="true" />
										<dt className="font-medium text-sm text-muted-foreground font-mono">{label}</dt>
										<dd className="mt-1 font-mono text-2xl text-foreground tabular-nums">
											{value}
										</dd>
									</div>
								))}
							</dl>
						</div>

						<figure className="w-full max-w-2xl rounded-3xl border border-border bg-surface-raised p-4 xl:p-8">
							<div className="flex flex-col justify-center rounded-2xl border border-border bg-surface p-6 sm:aspect-video sm:p-8">
								<div className="mb-4 flex items-center gap-4 border-border border-b pb-4">
									<Zap className="size-6 text-brand-text" aria-hidden="true" />
									<span className="font-medium text-foreground text-xs font-mono">
										Our Core Vision
									</span>
								</div>
								<blockquote className="font-medium text-lg text-foreground italic leading-relaxed">
									&ldquo;To enable every brand to reach its full potential globally through AI that
									acts as a proactive creative partner, not just a scheduling tool.&rdquo;
								</blockquote>
							</div>
						</figure>
					</div>
				</Container>
			</section>

			<section className="py-16 sm:py-24">
				<Container>
					<h2 className={`${headingSub} mb-12`}>
						Our <Accent>Journey.</Accent>
					</h2>
					<ol className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
						{MILESTONES.map((milestone) => (
							<li
								key={milestone.year}
								className="rounded-3xl border border-border bg-surface-raised p-6"
							>
								<p className="mb-2 font-medium text-brand-text text-xs font-mono">
									{milestone.year}
								</p>
								<h3 className="mb-2 font-medium text-lg text-foreground">{milestone.event}</h3>
								<p className="text-sm text-muted-foreground leading-relaxed">
									{milestone.description}
								</p>
							</li>
						))}
					</ol>
				</Container>
			</section>

			<section className="py-16 text-center sm:py-24">
				<Container size="md">
					<Eyebrow icon={Zap} className="mb-8 border-border-strong bg-surface">
						Atyuttama Experience
					</Eyebrow>
					<h2 className={`${headingDisplay} mb-10`}>
						An <Accent>Atyuttama</Accent> Product <br />
						for Supreme Growth.
					</h2>
					<p className="mx-auto max-w-3xl text-lg text-muted-foreground leading-relaxed">
						Derived from the Sanskrit for &ldquo;Superior,&rdquo; our Atyuttama engine represents
						the absolute peak of social media intelligence. We don&apos;t just build tools; we build
						the most excellent version of them.
					</p>
				</Container>
			</section>

			<CtaSection />
		</>
	);
}
