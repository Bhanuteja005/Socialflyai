import { CompetitorPage, type CompetitorPageData } from "@/components/marketing/competitor-page";
import { pageMetadata } from "@/components/marketing/metadata";
import { Accent } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "SocialflyAI vs Sprout Social: Enterprise Power, Startup Pricing",
	description:
		"Sprout Social costs $249+ per user. SocialflyAI delivers AI content creation, full analytics and an AI-enhanced inbox from $29/mo, with no per-seat fees or lock-in.",
	path: "/vs-sprout-social",
});

const data: CompetitorPageData = {
	name: "Sprout Social",
	hero: {
		title: (
			<>
				Enterprise Power. <br />
				<Accent>Lower Overheads.</Accent>
			</>
		),
		description:
			"Sprout Social costs $249+ per user. SocialflyAI provides the same high-end AI generation and analytics at a price that actually makes sense for your ROI.",
		socialProof: (
			<>
				<span className="block font-bold text-white">4.9/5 Rating</span>
				by 200+ fast-growing teams
			</>
		),
	},
	preview: {
		title: "See SocialflyAI In Action",
		subtitle: "Watch how we deliver enterprise-grade results with a startup-friendly workflow.",
	},
	comparisonFirst: true,
	comparison: {
		eyebrow: "Pricing Comparison",
		title: "Enterprise Power, Startup Pricing",
		subtitle: 'Stop paying for "enterprise" labels and start paying for value.',
		rows: [
			{ feature: "Monthly Base Cost", competitor: "$249 / mo", socialfly: "$29 / mo" },
			{ feature: "Cost per Extra User", competitor: "$199 / user", socialfly: "Included/Generous" },
			{ feature: "AI Content Creation", competitor: "Limited", socialfly: "Unlimited" },
			{ feature: "Standard Analytics", competitor: "Tiered", socialfly: "Full Access" },
			{ feature: "Social Inbox", competitor: "Standard", socialfly: "AI-Enhanced" },
			{ feature: "Listenings Features", competitor: "High Add-on", socialfly: "Native Insights" },
			{ feature: "Contract Lock-in", competitor: "Common", socialfly: "Cancel Anytime" },
		],
	},
	features: [
		{
			title: "AI Creation That Drives ROI",
			description:
				"Enterprise tools focus on management. We focus on growth. SocialflyAI's native AI generator creates content that actually converts, saving you thousands in creative costs.",
			bullets: ["Intuitive UI", "Instant Loads", "Mobile Optimized", "AI Templates"],
			visual: { kind: "dashboard" },
		},
		{
			title: "Everyday Features, Startup Friendly",
			description:
				"We've streamlined the enterprise experience. No complex training needed. Just connect, create, and scale your brand with AI-powered efficiency.",
			bullets: [
				"Unified Content Calendar",
				"Inter-team Approvals",
				"Auto-responding AI",
				"Deep Competitor Insights",
			],
			visual: { kind: "chart", title: "Competitor Insights", caption: "Share of voice" },
		},
	],
	faq: {
		subtitle: "Everything you need to know about switching from Sprout Social.",
		items: [
			{
				question: "Is SocialflyAI as powerful as Sprout Social?",
				answer:
					"In terms of content creation and AI automation, we're significantly more advanced. Sprout excels in enterprise social listening, but SocialflyAI delivers the high-end creation and engagement tools growth teams actually need, at a fraction of the cost.",
			},
			{
				question: "Can we really have unlimited users?",
				answer:
					"Yes. We don't believe in 'per-seat' taxing. As your team grows, your SocialflyAI bill stays predictable, allowing you to scale without budget spikes.",
			},
			{
				question: "How fast is the learning curve?",
				answer:
					"Unlike Sprout's multi-day onboarding, most teams are fully operational on SocialflyAI in under 30 minutes. Our AI handles the heavy lifting of content planning and generation for you.",
			},
			{
				question: "Do you offer custom analytics?",
				answer:
					"Yes, our Pro and Business plans include deep, actionable analytics that focus on what drives growth, rather than just enterprise vanity metrics.",
			},
		],
	},
	cta: { title: "Ready To Grow Without The Guess Work?" },
};

export default function VsSproutSocialPage() {
	return <CompetitorPage data={data} />;
}
