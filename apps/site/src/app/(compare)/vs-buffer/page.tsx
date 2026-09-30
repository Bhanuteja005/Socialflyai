import { Users, Zap } from "lucide-react";
import { CompetitorPage, type CompetitorPageData } from "@/components/marketing/competitor-page";
import { pageMetadata } from "@/components/marketing/metadata";
import { Accent } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "SocialflyAI vs Buffer: Unlimited Channels, Native AI",
	description:
		"Buffer charges per channel and per user. SocialflyAI gives you flat-rate pricing, unlimited channels, unlimited team collaboration and a full AI content studio.",
	path: "/vs-buffer",
});

const data: CompetitorPageData = {
	name: "Buffer",
	hero: {
		title: (
			<>
				Stop Paying <Accent>Per Channel</Accent>. <br />
				Scale with SocialflyAI
			</>
		),
		description:
			"Buffer charges you for every social profile you add. SocialflyAI gives you the freedom of unlimited channels and the power of native AI content generation in one unified workflow.",
		socialProof: (
			<>
				<span className="font-mono text-foreground tabular-nums">4.8/5</span> from 500+ users
			</>
		),
	},
	preview: {
		title: "See SocialflyAI In Action",
		subtitle: "Experience the future of social media management in under 2 minutes.",
		tags: ["AI Assistant", "Scheduler", "Analytics", "Planner"],
	},
	comparisonFirst: true,
	comparison: {
		eyebrow: "Comparison",
		subtitle: "Better features, better pricing, better results.",
		rows: [
			{ feature: "Pricing Model", competitor: "Pay per channel", socialfly: "Flat Rate" },
			{ feature: "AI Content Studio", competitor: "Limited", socialfly: "Full Suite" },
			{ feature: "Multi-channel Posts", competitor: "Extra Fees", socialfly: "Included" },
			{ feature: "Visual AI Planner", competitor: "Basic", socialfly: "Advanced AI-Driven" },
			{ feature: "Team Collaboration", competitor: "Per-user fees", socialfly: "Unlimited" },
			{ feature: "Best Time to Post", competitor: "Premium only", socialfly: "AI-Generated" },
			{ feature: "AI Reply Assistant", competitor: "No", socialfly: "Yes" },
			{ feature: "Custom Reports", competitor: "Separate Tier", socialfly: "Standard" },
		],
	},
	features: [
		{
			title: "The AI Content Engine Buffer Misses",
			description:
				"While Buffer is a great scheduler, SocialflyAI is a content creator. Our native AI doesn't just wait for you to upload—it helps you ideate, write, and design every post from scratch.",
			bullets: ["Intuitive UI", "Instant Loads", "Mobile Optimized", "AI Templates"],
			visual: { kind: "dashboard" },
		},
		{
			title: "Unlimited Team Collaboration",
			description:
				"Stop counting seats. Whether you're a team of 2 or 200, SocialflyAI lets you collaborate without any extra costs per user. Manage your content together seamlessly.",
			cards: [
				{
					icon: Users,
					title: "Shared Workspace",
					description: "Invite your entire team to one unified creative space.",
				},
				{
					icon: Zap,
					title: "Real-time Approval",
					description: "Streamline workflows with instant feedback and approvals.",
				},
			],
			visual: {
				kind: "list",
				title: "Team Workspace",
				icon: Users,
				rows: [
					{ title: "Sarah Miller", subtitle: "Editor", status: "Active" },
					{ title: "John Doe", subtitle: "Manager", status: "Active" },
					{ title: "Client X", subtitle: "Approver", status: "Pending", tone: "warning" },
				],
			},
		},
		{
			title: "AI-Powered Content Creation",
			description:
				"SocialflyAI isn't just a scheduler. It's your AI creative partner. Generate captions, ideate posts, and design creative content all in one flow.",
			bullets: ["AI Caption Creator", "AI Image Generator", "Auto-scheduling", "Trend Analysis"],
			visual: {
				kind: "chart",
				title: "AI Analytics",
				caption: "Engagement growth · last 12 weeks",
			},
		},
	],
	faq: {
		subtitle: "Everything you need to know about switching from Buffer.",
		showAllLink: true,
		items: [
			{
				question: "Is it easy to migrate from Buffer?",
				answer:
					"Yes! You can connect your social accounts in minutes and start scheduling immediately. Our interface is intuitive and designed for those used to modern, AI-first workflows.",
			},
			{
				question: "How much can I really save compared to Buffer?",
				answer:
					"On average, teams managing 10+ social accounts save over $100/month by switching to our flat-rate plans compared to Buffer's per-channel and per-user pricing model.",
			},
			{
				question: "Does SocialflyAI support all my social channels?",
				answer:
					"We support Instagram, X (Twitter), LinkedIn, Facebook, Pinterest, Youtube, and TikTok—matching every platform Buffer supports with deeper AI integration.",
			},
			{
				question: "Can I manage everything with AI?",
				answer:
					"Absolutely. While Buffer is primarily a scheduler, SocialflyAI is an AI creative partner. From caption generation to trend analysis, AI is baked into every step.",
			},
		],
	},
	cta: {
		title: "Ready To Grow Without The Guess Work?",
		footnote: "Join 500+ professionals switching this month",
	},
};

export default function VsBufferPage() {
	return <CompetitorPage data={data} />;
}
