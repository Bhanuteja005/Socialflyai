import { CompetitorPage, type CompetitorPageData } from "@/components/marketing/competitor-page";
import { pageMetadata } from "@/components/marketing/metadata";
import { Accent } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "SocialflyAI vs Hootsuite: Enterprise Features Without the Bloat",
	description:
		"Hootsuite starts at $99/mo with a legacy interface. SocialflyAI starts at $29/mo with unlimited AI post generation, included team collaboration and a modern, fast UI.",
	path: "/vs-hootsuite",
});

const data: CompetitorPageData = {
	name: "Hootsuite",
	hero: {
		title: (
			<>
				Stop Paying for <br />
				<Accent>Enterprise Bloat</Accent>
			</>
		),
		description:
			"Hootsuite's legacy interface and enterprise pricing can slow your team down. SocialflyAI offers a faster, AI-native experience with better results at a fraction of the cost.",
		socialProof: (
			<>
				Trusted by <span className="font-bold text-white">1,000+</span> teams
			</>
		),
	},
	preview: {
		title: "Modern Interface Built for Speed",
		subtitle: "Stop digging through menus. Start creating content that converts.",
	},
	comparisonFirst: true,
	comparison: {
		eyebrow: "The Comparison",
		subtitle: "Powerful Enterprise features without the Enterprise pricing.",
		rows: [
			{ feature: "Starting Price", competitor: "$99 / mo", socialfly: "$29 / mo" },
			{ feature: "AI Post Generation", competitor: "Limited", socialfly: "Unlimited" },
			{ feature: "Team Collaboration", competitor: "Extra Fees", socialfly: "Included" },
			{ feature: "Interface Response", competitor: "Legacy/Slow", socialfly: "Modern/Native" },
			{ feature: "Native AI Assistant", competitor: "Tiered", socialfly: "Standard" },
			{ feature: "Auto Post-Ideas", competitor: "No", socialfly: "Unlimited AI" },
			{ feature: "Social Accounts", competitor: "Restricted", socialfly: "Generous Limits" },
		],
	},
	features: [
		{
			title: "Better Results, Higher ROI",
			description:
				"Don't let complex menus get in the way of your growth. SocialflyAI streamlines your entire social strategy with AI, letting you achieve more in 15 minutes than a legacy tool does in an hour.",
			bullets: ["Intuitive UI", "Instant Loads", "Mobile Optimized", "AI Templates"],
			visual: { kind: "dashboard" },
		},
		{
			title: "Enterprise Features Without Enterprise Pricing",
			description:
				"Don't pay for bloat. We provide the same powerful analytics and scheduling capabilities as Hootsuite, but at a fraction of the cost.",
			bullets: [
				"Detailed Post Analytics",
				"Best Time to Post AI",
				"Bulk Scheduling",
				"Unified Inbox",
			],
			visual: { kind: "chart", title: "Post Analytics", caption: "Reach per week" },
		},
	],
	faq: {
		subtitle: "Everything you need to know about switching from Hootsuite.",
		items: [
			{
				question: "Can I import my data from Hootsuite?",
				answer:
					"While we don't have a direct import yet, connecting your social handles takes less than 2 minutes. Our onboarding will have you setup and ready to post in the same afternoon.",
			},
			{
				question: "Is SocialflyAI as powerful as Hootsuite?",
				answer:
					"More so. While Hootsuite has legacy features, SocialflyAI is built with native AI that can generate ideas, captions, and analyze trends in one click—something Hootsuite charges extra for.",
			},
			{
				question: "Do you offer enterprise-level support?",
				answer:
					"Absolutely. Even at our lower price points, our support team is available via chat and email to ensure your team is successful.",
			},
			{
				question: "What is the biggest advantage of switching?",
				answer:
					"Value and Speed. You get a faster, AI-driven experience for a fraction of what you're currently paying Hootsuite.",
			},
		],
	},
	cta: { title: "Ready To Grow Without The Guess Work?" },
};

export default function VsHootsuitePage() {
	return <CompetitorPage data={data} />;
}
