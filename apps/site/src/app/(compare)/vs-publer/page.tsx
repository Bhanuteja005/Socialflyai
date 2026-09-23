import { CompetitorPage, type CompetitorPageData } from "@/components/marketing/competitor-page";
import { pageMetadata } from "@/components/marketing/metadata";
import { Accent } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "SocialflyAI vs Publer: Beyond Scheduling, Pure AI Growth",
	description:
		"Publer schedules posts. SocialflyAI creates them with a true AI content engine, brand voice tuning, unlimited workspaces and team approvals included.",
	path: "/vs-publer",
});

const data: CompetitorPageData = {
	name: "Publer",
	hero: {
		title: (
			<>
				Beyond Scheduling. <br />
				<Accent>Pure AI Growth.</Accent>
			</>
		),
		description:
			"Publer is great for scheduling posts. SocialflyAI is built to help you create those posts using state-of-the-art AI. Don't just fill a calendar—grow your brand with unique content.",
	},
	preview: {
		title: "See SocialflyAI In Action",
		subtitle: "The ultimate social media management suite for modern brands.",
	},
	features: [
		{
			title: "AI Creation Engines",
			description:
				"While Publer provides basic scheduling features, SocialflyAI features a deep generative AI engine that learns your brand and creates content that actually converts, saving you hours of creative work per week.",
			bullets: [
				"Brand Voice Tuning",
				"Smart Media Library",
				"Auto-Hashtagging",
				"AI Reply Generation",
			],
			visual: { kind: "dashboard" },
		},
	],
	comparison: {
		rows: [
			{ feature: "True AI Content Engine", competitor: false, socialfly: true },
			{ feature: "Unlimited Workspaces", competitor: "Paid", socialfly: true },
			{ feature: "Multi-Platform Calendar", competitor: true, socialfly: true },
			{ feature: "Team Approval Flow", competitor: "Paid", socialfly: true },
			{ feature: "Detailed Analytics", competitor: true, socialfly: true },
			{ feature: "24/7 Priority Support", competitor: false, socialfly: true },
		],
	},
	faq: {
		title: "Common Questions",
		items: [
			{
				question: "Is SocialflyAI as affordable as Publer?",
				answer:
					"We offer better value by including all premium AI features and unlimited members in our core plans, no hidden per-seat costs.",
			},
			{
				question: "Can I manage Instagram Reels and TikToks?",
				answer:
					"Yes, fully supported. You can even use our AI to generate viral-ready captions for all short-form video platforms.",
			},
			{
				question: "Do you have a mobile app?",
				answer:
					"We have a high-performance web-app that works perfectly on any device, ensuring you can manage your brand on the go.",
			},
		],
	},
};

export default function VsPublerPage() {
	return <CompetitorPage data={data} />;
}
