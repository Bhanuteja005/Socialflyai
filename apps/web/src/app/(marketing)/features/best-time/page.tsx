import {
	ChartColumn,
	ChartLine,
	Clock,
	Compass,
	Globe,
	Target,
	TrendingUp,
	Zap,
} from "lucide-react";
import { FeatureSplitSection } from "@/components/marketing/feature-split";
import { FeaturePlanSections } from "@/components/marketing/features-plan-sections";
import { pageMetadata } from "@/components/marketing/metadata";
import {
	BarChartMockup,
	HeatmapMockup,
	ListMockup,
	MockupFrame,
} from "@/components/marketing/mockups";
import { PageHero } from "@/components/marketing/page-hero";
import { Accent } from "@/components/marketing/primitives";
import { faqs, plans, rows } from "./data";

export const metadata = pageMetadata({
	title: "Best Time to Post on Social Media — AI Engagement Forecasting",
	description:
		"Stop posting in the dark. SocialflyAI analyzes your audience's activity to find the best time to post on every platform, with engagement heatmaps and auto-scheduling.",
	path: "/features/best-time",
});

// Deterministic 24-hour activity curve for the hero chart.
const HOURLY = Array.from({ length: 24 }, (_, hour) => Math.round(Math.sin(hour / 3) * 60 + 80));

export default function BestTimeFeaturePage() {
	return (
		<>
			<PageHero
				badge={{ icon: ChartLine, label: "Data-Driven Engagement" }}
				title={
					<>
						Engagement <Accent>Forecasting</Accent> <br />
						Powered by AI Data
					</>
				}
				description="Don't post in the dark. Our AI analyzes your audience's unique activity patterns to tell you exactly when to hit publish for maximum reach."
				actions={[
					{ label: "Get started for free", href: "/signup" },
					{ label: "Analyze My Account", href: "/signup", variant: "secondary", icon: TrendingUp },
				]}
			>
				<MockupFrame title="Heatmap Analytics" icon={Clock}>
					<BarChartMockup values={HOURLY} caption="Peak engagement time" />
				</MockupFrame>
			</PageHero>

			<FeatureSplitSection
				heading={<h2 className="sr-only">Best time to post features</h2>}
				items={[
					{
						title: (
							<>
								Visual <br />
								<Accent>Engagement Heatmaps.</Accent>
							</>
						),
						description:
							"Our proprietary AI engine processes millions of data points across all social platforms to create a custom heatmap for your brand. See exactly when your followers are most active.",
						bullets: [
							"Time-of-day and day-of-week analytics",
							"Engagement forecasting based on past data",
							"Dynamic adjustments for trending hashtags",
							"Multi-platform data aggregation",
						],
						visual: (
							<MockupFrame title="Audience Activity" icon={Clock}>
								<HeatmapMockup />
							</MockupFrame>
						),
					},
					{
						title: (
							<>
								Next-Gen <br />
								<Accent>Scheduling Triggers.</Accent>
							</>
						),
						description:
							"Integrated directly into our scheduling engine. Just select 'Perfect Time' when creating a post, and the AI will automatically slot it into the highest engagement window.",
						chips: [
							{ icon: Zap, label: "Single-Click Perfection" },
							{ icon: Target, label: "Niche-Matched Analytics" },
						],
						visual: (
							<MockupFrame title="Perfect Time" icon={Zap}>
								<ListMockup
									rows={[
										{
											title: "Optimizing for LinkedIn",
											subtitle: "Tue, 9:15 AM",
											status: "Slotted",
											avatar: "in",
										},
										{
											title: "Optimizing for TikTok",
											subtitle: "Mon, 8:30 PM",
											status: "Pending",
											tone: "muted",
											avatar: "TT",
										},
									]}
								/>
							</MockupFrame>
						),
					},
					{
						title: (
							<>
								Reach Audit <br />
								<Accent>Analytics.</Accent>
							</>
						),
						description:
							"See exactly how much reach your content is losing by posting at the wrong times. AI Assistant provides a comprehensive post-audit analysis of every platform interaction.",
						stats: [
							{ icon: Compass, label: "Potential Reach", value: "2.5M" },
							{ icon: TrendingUp, label: "Lift Prediction", value: "+84%" },
							{ icon: Globe, label: "Audience Active", value: "92%" },
							{ icon: ChartColumn, label: "Data Samples", value: "15M+" },
						],
					},
				]}
			/>

			<FeaturePlanSections
				comparisonLabel="Best Time Features"
				pricingDescription="Every viral post starts with a single high-quality measurement. Choose the plan that's right for your volume."
				plans={plans}
				rows={rows}
				faqDescription="Everything you need to know about SocialflyAI Best Time analysis."
				faqs={faqs}
			/>
		</>
	);
}
