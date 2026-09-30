import { CompetitorPage, type CompetitorPageData } from "@/components/marketing/competitor-page";
import { pageMetadata } from "@/components/marketing/metadata";
import { Accent } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "SocialflyAI vs MeetEdgar: Fresh AI Content, Not Recycled Loops",
	description:
		"MeetEdgar recycles old posts. SocialflyAI generates fresh, on-trend content daily with AI variations, real-time insights and AI best-time prediction.",
	path: "/vs-meetedgar",
});

const data: CompetitorPageData = {
	name: "MeetEdgar",
	hero: {
		title: (
			<>
				Break the Loop. <br />
				<Accent>Scale with AI.</Accent>
			</>
		),
		description:
			"MeetEdgar automates your queue by recycling old posts. SocialflyAI uses AI to generate new, relevant content daily, ensuring your brand always has something fresh and high-performing to say.",
		socialProof: (
			<>
				<span className="block font-medium text-foreground">Next-Gen Automation</span>
				Loved by 1,200+ creators
			</>
		),
	},
	preview: {
		title: "See SocialflyAI In Action",
		subtitle:
			"Watch how our AI creates fresh, high-performing content that beats repetitive loops.",
	},
	comparisonFirst: true,
	comparison: {
		eyebrow: "The Evolution",
		title: "Static Queues vs AI Insights",
		subtitle: "MeetEdgar recycles. SocialflyAI innovates.",
		rows: [
			{
				feature: "Content Generation",
				competitor: "Manual/Limited",
				socialfly: "AI-Powered Studio",
			},
			{
				feature: "Evergreen Strategy",
				competitor: "Repeat Loops",
				socialfly: "AI-Optimized Variation",
			},
			{
				feature: "Trend Awareness",
				competitor: "Static Rules",
				socialfly: "Real-time AI Insights",
			},
			{ feature: "Team Features", competitor: "Expensive", socialfly: "Built-in Collaboration" },
			{ feature: "Visual Design Tools", competitor: "Basic", socialfly: "Advanced AI Graphics" },
			{ feature: "Account Limits", competitor: "Restricted", socialfly: "Generous Tiers" },
			{
				feature: "Smart Scheduling",
				competitor: "Time Slots",
				socialfly: "AI Best-Time Prediction",
			},
		],
	},
	features: [
		{
			title: "A Modern Interface Built For Speed",
			description:
				"Legacy software is slow. SocialflyAI is built on modern tech to ensure your workflow stays fluid. Spend less time clicking and more time creating.",
			bullets: ["Intuitive UI", "Instant Loads", "Mobile Optimized", "AI Templates"],
			visual: { kind: "dashboard" },
		},
		{
			title: "More Than Just a Queue",
			description:
				"We don't just schedule; we strategize. Our AI analyzes what's working for your brand and suggests new directions, instead of just filling empty time slots.",
			chips: ["AI Suggestions", "Smart Workflows", "Autopilot Mode", "Team Approvals"],
			visual: { kind: "dashboard" },
		},
	],
	faq: {
		subtitle: "Everything you need to know about switching from MeetEdgar.",
		items: [
			{
				question: "Does SocialflyAI have an evergreen feature?",
				answer:
					"Yes, but it's smarter. Instead of just re-posting the exact same content, our AI can generate fresh variations of your best-performing posts to maintain engagement.",
			},
			{
				question: "Is the setup complex like MeetEdgar's categories?",
				answer:
					"Not at all. Our onboarding is fully automated—connect your accounts and our AI will suggest categories and strategies based on your brand niche.",
			},
			{
				question: "Can I use it for more than just Twitter?",
				answer:
					"Absolutely. SocialflyAI supports Instagram, TikTok, LinkedIn, Facebook, and more with platform-specific AI optimization for each.",
			},
			{
				question: "What's the pricing advantage?",
				answer:
					"You get advanced AI generation, trend analysis, and team collaboration features that MeetEdgar doesn't offer, often at a more affordable monthly rate.",
			},
		],
	},
	cta: { title: "Ready To Grow Without The Guess Work?" },
};

export default function VsMeetEdgarPage() {
	return <CompetitorPage data={data} />;
}
