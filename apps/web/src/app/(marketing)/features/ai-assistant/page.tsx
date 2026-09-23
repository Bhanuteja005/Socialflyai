import { Bot, Brain, Globe, Hash, PenTool, Sparkles, Zap } from "lucide-react";
import { FeatureSplitSection } from "@/components/marketing/feature-split";
import { FeaturePlanSections } from "@/components/marketing/features-plan-sections";
import { pageMetadata } from "@/components/marketing/metadata";
import { ListMockup, MockupFrame } from "@/components/marketing/mockups";
import { PageHero } from "@/components/marketing/page-hero";
import { Accent } from "@/components/marketing/primitives";
import { faqs, plans, rows } from "./data";

export const metadata = pageMetadata({
	title: "AI Social Media Assistant — Hooks, Captions & Hashtags",
	description:
		"Your personal AI social media strategist. Generate viral-ready hooks, captions and hashtag clusters in seconds, adapted to every platform and your brand voice.",
	path: "/features/ai-assistant",
});

export default function AIAssistantFeaturePage() {
	return (
		<>
			<PageHero
				badge={{ icon: Brain, label: "Next-Gen Content Intelligence" }}
				title={
					<>
						Your Personal <Accent>AI Social Media</Accent> <br />
						Strategist
					</>
				}
				description="Generate viral-ready hooks, captions, and hashtag strategies in seconds. The smartest way to scale your social output without burnout."
				actions={[
					{ label: "Get started for free", href: "/signup" },
					{ label: "Upgrade to Pro", href: "/signup", variant: "secondary", icon: Zap },
				]}
			>
				<MockupFrame title="AI Writer" icon={PenTool}>
					<div className="space-y-4">
						<div className="h-4 w-3/4 rounded bg-white/5" />
						<div className="h-4 w-full rounded bg-white/5" />
						<div className="relative overflow-hidden rounded-xl border border-primary/20 bg-primary/5 p-4">
							<Sparkles className="absolute -right-2 -bottom-2 size-12 text-primary opacity-10" />
							<p className="text-sm text-white/80">
								"The secret to consistent growth isn't working harder—it's working smarter with the
								right tools. Here's how we helped 25k+ creators..."
							</p>
						</div>
					</div>
				</MockupFrame>
			</PageHero>

			<FeatureSplitSection
				heading={<h2 className="sr-only">AI Assistant features</h2>}
				items={[
					{
						title: (
							<>
								Stop the Scroll <br />
								<Accent>With AI Hooks.</Accent>
							</>
						),
						description:
							"The first 3 seconds are everything. Our AI analyzes top-performing content to generate hooks that grab attention and drive engagement.",
						bullets: [
							"Psychology-backed attention grabbers",
							"Niche-specific viral patterns",
							"Multiple variations for A/B testing",
							"Instant platform-specific formatting",
						],
						visual: (
							<MockupFrame title="Viral Hook Idea" icon={Sparkles}>
								<p className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-white">
									"99% of creators are missing this one simple trick to double their reach..."
								</p>
								<p className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/50">
									Generating variation 2...
								</p>
							</MockupFrame>
						),
					},
					{
						title: (
							<>
								Smart Hashtag <br />
								<Accent>Optimization</Accent>
							</>
						),
						description:
							"Don't just guess which hashtags work. Our AI creates balanced clusters of high, medium, and low competition tags to maximize your discovery.",
						chips: [
							{ label: "#marketingtips" },
							{ label: "#creatoreconomy" },
							{ label: "#socialflyai" },
							{ label: "#branding" },
						],
						visual: (
							<MockupFrame title="Hashtag Clusters" icon={Hash}>
								<ListMockup
									rows={[
										{ title: "Cluster 1", subtitle: "High competition", status: "98% relevant" },
										{
											title: "Cluster 2",
											subtitle: "Medium competition",
											status: "98% relevant",
											tone: "muted",
										},
										{
											title: "Cluster 3",
											subtitle: "Low competition",
											status: "98% relevant",
											tone: "muted",
										},
									]}
								/>
							</MockupFrame>
						),
					},
					{
						title: (
							<>
								One Message, <br />
								<Accent>All Platforms.</Accent>
							</>
						),
						description:
							"The way people talk on LinkedIn isn't the way they talk on TikTok. AI Assistant automatically adjusts your tone and format for every major social network.",
						stats: [
							{ icon: Globe, label: "Professional", value: "LinkedIn" },
							{ icon: Zap, label: "Punchy & Bold", value: "Twitter/X" },
							{ icon: Sparkles, label: "Visual & Emoji", value: "Instagram" },
							{ icon: Bot, label: "Relatable & Fun", value: "Threads" },
						],
					},
				]}
			/>

			<FeaturePlanSections
				comparisonLabel="AI Assistant Features"
				pricingDescription="Every viral post starts with a single high-quality hook. Choose the plan that's right for your volume."
				plans={plans}
				rows={rows}
				faqDescription="Everything you need to know about SocialflyAI Assistant."
				faqs={faqs}
			/>
		</>
	);
}
