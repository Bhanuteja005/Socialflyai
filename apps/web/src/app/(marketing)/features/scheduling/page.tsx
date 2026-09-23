import {
	Calendar,
	CircleCheck,
	Clock,
	Globe,
	Image as ImageIcon,
	LayoutGrid,
	Plus,
	Shield,
	Sparkles,
	Zap,
} from "lucide-react";
import { FeatureSplitSection } from "@/components/marketing/feature-split";
import { FeaturePlanSections } from "@/components/marketing/features-plan-sections";
import { pageMetadata } from "@/components/marketing/metadata";
import {
	BarChartMockup,
	CalendarMockup,
	DashboardMockup,
	MockupFrame,
} from "@/components/marketing/mockups";
import { PageHero } from "@/components/marketing/page-hero";
import { PlatformStrip } from "@/components/marketing/platform-strip";
import { Accent, Container, GlassCard, SectionHeading } from "@/components/marketing/primitives";
import { faqs, plans, rows } from "./data";

export const metadata = pageMetadata({
	title: "Social Media Scheduling — Schedule Posts in Minutes",
	description:
		"Plan, collaborate and schedule your content across Instagram, TikTok, LinkedIn, X, Facebook and YouTube from one dashboard with direct publishing and AI timing.",
	path: "/features/scheduling",
});

export default function SchedulingFeaturePage() {
	return (
		<>
			<PageHero
				badge={{ icon: Calendar, label: "High-Precision Scheduling" }}
				title={
					<>
						Schedule Your <Accent>Social Media</Accent> <br />
						Posts in Minutes
					</>
				}
				description="Plan, collaborate, and schedule your content across all major platforms from a single, intuitive dashboard."
				actions={[
					{ label: "Start scheduling for free", href: "/signup" },
					{ label: "Watch workflow", href: "/contact", variant: "secondary", icon: Clock },
				]}
			>
				<MockupFrame title="New Post" icon={Plus}>
					<div className="space-y-5 text-sm">
						<div>
							<p className="mb-2 font-bold text-[10px] text-white/40 uppercase tracking-widest">
								Caption
							</p>
							<p className="rounded-xl border border-white/10 bg-white/5 p-4 text-white/80">
								Excited to share our latest project update! 🚀 #innovation #socialfly
							</p>
						</div>
						<div className="grid gap-4 sm:grid-cols-3">
							<div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-3 text-white/60">
								<ImageIcon className="size-4" />
								Media
							</div>
							<div className="rounded-xl border border-white/10 bg-white/5 p-3 text-white/60">
								Platforms: 4 selected
							</div>
							<div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-primary">
								<Zap className="size-4" />
								Tomorrow, 10:00 AM
							</div>
						</div>
						<div className="flex h-11 items-center justify-center rounded-xl bg-primary font-bold text-black">
							Schedule Post
						</div>
					</div>
				</MockupFrame>
			</PageHero>

			<PlatformStrip label="Seamless Scheduling for every social network" />

			<FeatureSplitSection
				heading={
					<SectionHeading
						title={
							<>
								Smarter Tool, <br />
								<Accent>Simpler Workflow.</Accent>
							</>
						}
						description="Build your entire week of content in under an hour. Our scheduling engine handles the complexity so you can focus on creativity."
						className="mb-16 lg:mb-20"
					/>
				}
				items={[
					{
						title: "Post & Schedule",
						description:
							"Our advanced composer allows you to preview exactly how your post will look on every platform. Schedule videos, carousels, and reels with specialized formatting for each.",
						chips: [
							{ icon: LayoutGrid, label: "Live Previews" },
							{ icon: Globe, label: "Cross-Posting" },
							{ icon: Shield, label: "Direct Publishing" },
							{ icon: Zap, label: "Bulk Upload" },
						],
						visual: <DashboardMockup />,
					},
					{
						title: "Calendar Planner",
						description:
							"Visualize your content strategy with our drag-and-drop calendar. Identify content gaps, spot upcoming holidays, and keep your team aligned on the publishing schedule.",
						visual: (
							<MockupFrame title="Drag to reschedule" icon={Calendar}>
								<CalendarMockup />
							</MockupFrame>
						),
					},
				]}
			/>

			<section className="pb-20 sm:pb-28">
				<Container>
					<div className="grid gap-6 md:grid-cols-2">
						<GlassCard>
							<span className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
								<Sparkles className="size-6" aria-hidden="true" />
							</span>
							<h3 className="font-bold text-2xl text-white">AI Content Assist</h3>
							<p className="mt-4 text-white/60">
								Never stare at a blank screen again. Generate hooks, captions, and hashtag clusters
								tailored to your niche.
							</p>
							<ul className="mt-6 space-y-3">
								{["Instant Hook Generator", "Smart Hashtag Batches", "Tone Selection"].map(
									(item) => (
										<li key={item} className="flex items-center gap-3 text-white/80">
											<CircleCheck className="size-5 text-primary" aria-hidden="true" />
											{item}
										</li>
									),
								)}
							</ul>
						</GlassCard>
						<GlassCard>
							<span className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
								<Clock className="size-6" aria-hidden="true" />
							</span>
							<h3 className="font-bold text-2xl text-white">Perfect Post Time</h3>
							<p className="mt-4 text-white/60">
								Data-driven insights telling you exactly when your audience is most likely to see
								and engage with your posts.
							</p>
							<div className="mt-6" aria-hidden="true">
								<BarChartMockup
									values={[3, 6, 9, 12, 15, 10, 5]}
									caption="92% Engagement Lift Opportunity"
								/>
							</div>
						</GlassCard>
					</div>
				</Container>
			</section>

			<FeaturePlanSections
				comparisonLabel="Scheduling Features"
				pricingDescription="Scale your content strategy without the manual effort. Select the plan that fits your social volume."
				plans={plans}
				rows={rows}
				faqDescription="Everything you need to know about SocialflyAI smart scheduling."
				faqs={faqs}
			/>
		</>
	);
}
