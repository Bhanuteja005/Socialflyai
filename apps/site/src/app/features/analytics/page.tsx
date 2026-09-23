import {
	ChartColumn,
	ChartLine,
	ChartPie,
	MousePointer2,
	Sparkles,
	TrendingUp,
	Zap,
} from "lucide-react";
import { SIGNUP_URL } from "@/components/marketing/app-links";
import { FeatureSplitSection } from "@/components/marketing/feature-split";
import { FeaturePlanSections } from "@/components/marketing/features-plan-sections";
import { pageMetadata } from "@/components/marketing/metadata";
import { BarChartMockup, MetricTiles, MockupFrame } from "@/components/marketing/mockups";
import { PageHero } from "@/components/marketing/page-hero";
import { Accent } from "@/components/marketing/primitives";
import { faqs, plans, rows } from "./data";

export const metadata = pageMetadata({
	title: "Social Media Analytics & ROI Reporting",
	description:
		"Impact reporting at scale. Unified cross-platform analytics, engagement ROI tracking and AI-discovered insights for creators, brands and agencies.",
	path: "/features/analytics",
});

const FUNNEL = [
	{ label: "Profile Visits", value: "124,500", width: "w-full" },
	{ label: "Website Clicks", value: "18,240", width: "w-[65%]" },
	{ label: "Leads Generated", value: "1,540", width: "w-1/4" },
];

export default function AnalyticsFeaturePage() {
	return (
		<>
			<PageHero
				badge={{ icon: ChartColumn, label: "Advanced Content Intelligence" }}
				title={
					<>
						Impact Reporting <br />
						at <Accent>Scale.</Accent>
					</>
				}
				description="Data that drives ROI for creators and brands. Visualize your growth journey with deep-dive performance metrics."
				actions={[
					{ label: "Get started for free", href: SIGNUP_URL },
					{ label: "View Demo Report", href: "/contact", variant: "secondary", icon: TrendingUp },
				]}
			>
				<div className="space-y-6">
					<MetricTiles
						className="lg:grid-cols-3"
						tiles={[
							{ label: "Revenue ROI", value: "$42.5K", note: "+14.2%", icon: Zap },
							{ label: "Content Reach", value: "2.4M", note: "+22.4%", icon: ChartLine },
							{ label: "Conversion Rate", value: "8.1%", note: "+2.1%", icon: TrendingUp },
						]}
					/>
					<MockupFrame
						title="Performance Trajectory"
						icon={ChartLine}
						aside={
							<span className="font-bold text-[10px] text-primary uppercase tracking-widest">
								Instagram +18.5% WoW
							</span>
						}
					>
						<BarChartMockup
							values={[65, 45, 85, 35, 95, 55, 75, 40, 80, 60, 90, 50, 70, 85, 45]}
							caption="Viral opportunity detected — post AI reels at 8PM for 3x reach"
						/>
					</MockupFrame>
				</div>
			</PageHero>

			<FeatureSplitSection
				heading={<h2 className="sr-only">Analytics features</h2>}
				items={[
					{
						title: (
							<>
								Unified <br />
								<Accent>Cross-Platform Reporting.</Accent>
							</>
						),
						description:
							"Stop jumping between apps to see your performance. SocialflyAI aggregates data from Instagram, TikTok, LinkedIn, Twitter/X, and more into a single, premium dashboard for a complete view of your social presence.",
						bullets: [
							"Multi-platform data aggregation",
							"Real-time performance tracking",
							"Custom date range comparisons",
							"Simplified audience demographics",
						],
						visual: (
							<MockupFrame title="Aggregated Reach" icon={TrendingUp}>
								<MetricTiles
									tiles={[
										{ label: "Total Impressions", value: "12.8M" },
										{ label: "Growth", value: "+32.4%" },
									]}
								/>
							</MockupFrame>
						),
					},
					{
						title: (
							<>
								Engagement <br />
								<Accent>ROI Tracking.</Accent>
							</>
						),
						description:
							"Not all engagement is created equal. Our analytics prioritize the interactions that matter—leads, website clicks, and conversion triggers—giving you a clear path to social ROI.",
						chips: [
							{ icon: MousePointer2, label: "Conversion Analytics" },
							{ icon: Sparkles, label: "AI Engagement Scoring" },
						],
						visual: (
							<MockupFrame title="ROI Conversion Funnel" icon={ChartColumn}>
								<ul className="space-y-4">
									{FUNNEL.map((step) => (
										<li key={step.label}>
											<div className="mb-1.5 flex justify-between text-sm">
												<span className="text-white/70">{step.label}</span>
												<span className="font-bold text-white">{step.value}</span>
											</div>
											<div className="h-2 rounded-full bg-white/5">
												<div className={`h-2 rounded-full bg-primary/70 ${step.width}`} />
											</div>
										</li>
									))}
								</ul>
								<div className="mt-6 flex items-center justify-between border-white/5 border-t pt-4">
									<span className="font-bold text-white/50 text-xs uppercase tracking-widest">
										Total ROI Impact
									</span>
									<span className="font-bold text-2xl text-primary">$84,200</span>
								</div>
							</MockupFrame>
						),
					},
					{
						title: (
							<>
								AI Automatic <br />
								<Accent>Insight Discovery.</Accent>
							</>
						),
						description:
							"SocialflyAI doesn't just show you data; it tells you what it means. Our AI-Native intelligence automatically identifies your best-performing patterns and suggests actionable steps to keep your momentum growing.",
						stats: [
							{ icon: ChartPie, label: "Best Post Type", value: "Video Reels" },
							{ icon: Sparkles, label: "Top Topic", value: "AI Strategy" },
							{ icon: ChartColumn, label: "Viral Potential", value: "94%" },
							{ icon: Zap, label: "Next Action", value: "Post at 8:00 PM" },
						],
					},
				]}
			/>

			<FeaturePlanSections
				comparisonLabel="Analytics Features"
				pricingDescription="Every viral post starts with a single high-quality measurement. Choose the plan that's right for your volume."
				plans={plans}
				highlightLabel="Recommended"
				columns={["Starter", "Professional (Pro)", "Agency Elite"]}
				rows={rows}
				faqDescription="Everything you need to know about SocialflyAI Analytics."
				faqs={faqs}
			/>
		</>
	);
}
