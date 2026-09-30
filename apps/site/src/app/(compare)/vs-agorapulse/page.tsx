import { CompetitorPage, type CompetitorPageData } from "@/components/marketing/competitor-page";
import { pageMetadata } from "@/components/marketing/metadata";
import { Accent } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "SocialflyAI vs Agorapulse: AI Growth Beyond the Inbox",
	description:
		"Compare SocialflyAI and Agorapulse. Get unified inbox control plus AI content generation, predictive scoring and unlimited team members at a fraction of the price.",
	path: "/vs-agorapulse",
});

const data: CompetitorPageData = {
	name: "Agorapulse",
	hero: {
		title: (
			<>
				Don&apos;t Just <Accent>Manage Inboxes</Accent>. <br />
				Drive Growth with AI.
			</>
		),
		description:
			"Agorapulse is built for responding to the past. SocialflyAI is built for creating the future. Transition from manual community management to AI-driven content generation and growth.",
		socialProof: (
			<>
				<span className="font-mono text-foreground tabular-nums">4.9/5</span> from 1.2k+ teams
			</>
		),
	},
	preview: {
		title: "See SocialflyAI In Action",
		subtitle: "The most intuitive workflow you've ever experienced.",
	},
	features: [
		{
			title: "From Response to Creation",
			description:
				"Agorapulse excels at managing what's already happened. SocialflyAI excels at making things happen. Get the same inbox control but with an AI creative partner that generates your next viral post.",
			bullets: [
				"All channels included",
				"No per-user fees",
				"Advanced AI native",
				"Real-time sync",
			],
			visual: {
				kind: "price",
				competitorPlan: "Agorapulse Pro",
				competitorPrice: "$149/mo",
				socialflyPrice: "$49/mo",
				note: "Unlimited Profiles Included",
			},
		},
		{
			title: "Advanced AI That Agorapulse Doesn't Have",
			description:
				"While others are tacking on AI tools, SocialflyAI is built on them. Predictive engagement, automated variations, and intelligent content sync are at our core.",
			cards: [
				{
					title: "AI Content Sync",
					description: "Automatically adapts your content for every platform.",
				},
				{
					title: "Predictive Scoring",
					description: "Know which posts will perform before you hit publish.",
				},
			],
			visual: { kind: "dashboard" },
		},
		{
			title: "Unified Inbox with AI Superpowers",
			description:
				"Manage all your comments, DMs, and mentions in one place. Our AI helps you prioritize and even suggests high-impact replies so you never miss an interaction.",
			chips: ["Instagram", "Twitter/X", "LinkedIn", "Facebook", "YouTube"],
			visual: {
				kind: "inbox",
				badge: "AI REPLY SUGGESTED",
				messages: [
					{ author: "Sarah J.", text: "Love the new update!", time: "2m" },
					{ author: "Mike R.", text: "When is the next drop?", time: "15m" },
					{ author: "TechCorp", text: "Sent you a partnership proposal.", time: "1h" },
				],
			},
		},
	],
	comparison: {
		rows: [
			{ feature: "AI Content Generation", competitor: false, socialfly: true },
			{ feature: "Predictive Performance Score", competitor: false, socialfly: true },
			{ feature: "Automated Inbox Sorting", competitor: true, socialfly: true },
			{ feature: "Unlimited Team Members", competitor: false, socialfly: true },
			{ feature: "Real-time Optimization", competitor: false, socialfly: true },
			{ feature: "Cost-per-User", competitor: true, socialfly: false },
		],
	},
	faq: {
		title: "Common Questions",
		items: [
			{
				question: "How easy is it to migrate from Agorapulse?",
				answer: "Very. We have a 1-click import for all your scheduled posts and historical data.",
			},
			{
				question: "Is the AI reply really human-like?",
				answer:
					"Yes, our models are trained on your brand voice to ensure consistency and authenticity.",
			},
			{
				question: "Can I try it before switching?",
				answer: "ABSOLUTELY. We offer a 14-day free trial with all features included.",
			},
		],
	},
	cta: {
		title: (
			<>
				Ready To Grow Without <br />
				The Guesswork?
			</>
		),
		label: "Start for free",
	},
};

export default function VsAgorapulsePage() {
	return <CompetitorPage data={data} />;
}
