import { Globe } from "lucide-react";
import { CompetitorPage, type CompetitorPageData } from "@/components/marketing/competitor-page";
import { pageMetadata } from "@/components/marketing/metadata";
import { Accent } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "SocialflyAI vs SocialPilot: Better Value, Smarter AI Growth",
	description:
		"Get SocialPilot's affordability plus AI-powered batching, real-time sentiment AI, predictive performance scores, premium white-labeling and unlimited team members.",
	path: "/vs-socialpilot",
});

const data: CompetitorPageData = {
	name: "SocialPilot",
	hero: {
		title: (
			<>
				Better Value. <br />
				<Accent>Smarter Growth.</Accent>
			</>
		),
		description:
			"SocialPilot is a great budget tool, but the social landscape has changed. SocialflyAI gives you the same affordability with the advanced AI features you need to stay competitive in 2024 and beyond.",
		socialProof: (
			<>
				<span className="font-mono text-foreground tabular-nums">4.9/5</span> rated by 2k+ creators
			</>
		),
	},
	preview: {
		title: "See SocialflyAI In Action",
		subtitle: "The only social suite you'll ever need.",
	},
	features: [
		{
			title: "AI-Native Efficiency",
			description:
				"SocialPilot's bulk scheduling is a great time-saver, but SocialflyAI takes it further. Our integrated AI helps you generate that content first, ensuring every post in your queue is optimized for engagement.",
			bullets: [
				"AI Batch Generation",
				"Automated Approval Flows",
				"Native Design Tools",
				"Multi-Org Management",
			],
			visual: { kind: "calendar", title: "Bulk Queue" },
		},
		{
			title: "Data-Driven Growth",
			description:
				"SocialflyAI's analytics go beyond basic metrics. We tell you WHY a post worked and exactly how to replicate that success.",
			cards: [
				{
					title: "Deep Audience Insights",
					description: "Track demographics, sentiment, and behavior patterns in real-time.",
				},
				{
					title: "Competitor Benchmarking",
					description: "See how you stack up against the best in your industry.",
				},
			],
			visual: { kind: "dashboard" },
		},
		{
			title: "Advanced White-Labeling",
			description:
				"Client reporting should be beautiful. SocialflyAI's white-label suite allows you to present data that looks like it cost thousands to produce.",
			visual: {
				kind: "list",
				title: "White-Label Suite",
				icon: Globe,
				rows: [
					{ title: "Brand Portal", subtitle: "Custom domain active", status: "Live", avatar: "BP" },
					{
						title: "Client Reports",
						subtitle: "Auto-generated monthly",
						status: "Scheduled",
						avatar: "CR",
					},
				],
			},
		},
	],
	comparison: {
		rows: [
			{ feature: "Modern Tech Infrastructure", competitor: true, socialfly: true },
			{ feature: "AI-Powered Batching", competitor: false, socialfly: true },
			{ feature: "Unlimited Team Members", competitor: false, socialfly: true },
			{ feature: "Real-time Sentiment AI", competitor: false, socialfly: true },
			{ feature: "Premium White-labeling", competitor: true, socialfly: true },
			{ feature: "Predictive Performance Score", competitor: false, socialfly: true },
		],
	},
	faq: {
		title: "Common Questions",
		items: [
			{
				question: "How is SocialflyAI different from SocialPilot?",
				answer:
					"While SocialPilot was built for scale, SocialflyAI was built for intelligence. We don't just schedule; we optimize and create.",
			},
			{
				question: "Is SocialflyAI as scalable as SocialPilot?",
				answer:
					"Even more so. Our microservices architecture ensures 99.99% uptime, even with hundreds of social accounts and thousands of scheduled posts.",
			},
			{
				question: "Do you have bulk scheduling?",
				answer:
					"Yes, and we take it further with bulk AI generation that creates the content for you, not just handles the uploads.",
			},
			{
				question: "Can I use my own domain for client portals?",
				answer:
					"Yes, our white-label feature allows you to fully customize the client experience under your own brand and domain.",
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

export default function VsSocialPilotPage() {
	return <CompetitorPage data={data} />;
}
