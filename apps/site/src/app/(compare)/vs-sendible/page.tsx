import { Users } from "lucide-react";
import { CompetitorPage, type CompetitorPageData } from "@/components/marketing/competitor-page";
import { pageMetadata } from "@/components/marketing/metadata";
import { Accent } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "SocialflyAI vs Sendible: Agency-Scale AI, Zero Per-User Fees",
	description:
		"Sendible handles client reports; SocialflyAI handles the content. Scale your agency with AI creation, predictive performance and unlimited team members, no per-user fees.",
	path: "/vs-sendible",
});

const data: CompetitorPageData = {
	name: "Sendible",
	hero: {
		title: (
			<>
				Agency-Scale AI. <br />
				<Accent>Zero Per-User Fees.</Accent>
			</>
		),
		description:
			"Sendible handles client reports, but SocialflyAI handles the content. Use our AI creative partner to scale your agency's output without adding to your headcount or your bill.",
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
			title: "AI Creativity for Agencies",
			description:
				"Sendible's interface can be slow when managing dozens of clients. SocialflyAI is built for speed, combining high-performance analytics with a generative AI engine that creates client content in seconds.",
			bullets: [
				"Ultra-Fast Loads",
				"Native Desktop Experience",
				"Intelligent Search",
				"Command Palette",
			],
			visual: { kind: "chart", title: "Client Performance", caption: "Engagement across clients" },
		},
		{
			title: (
				<>
					AI Tools Sendible <br />
					Doesn&apos;t Have
				</>
			),
			description:
				"SocialflyAI isn't just a scheduler—it's a content engine. Our AI analyzes your audience in real-time to suggest the perfect hooks, imagery, and posting times.",
			cards: [
				{
					title: "Predictive Engagement",
					description: "Forecast your reach and engagement with 98% accuracy.",
				},
				{
					title: "AI Visual Engine",
					description: "Generate stunning, brand-aligned social assets in seconds.",
				},
			],
			visual: { kind: "dashboard" },
		},
		{
			title: "Unlimited Team Collaboration",
			description:
				"Agencies love Sendible, but they hate the per-user pricing. SocialflyAI encourages teamwork. Add your entire squad, set custom permissions, and collaborate without friction.",
			visual: {
				kind: "list",
				title: "Team Activity",
				icon: Users,
				rows: [
					{ title: "Design Team", subtitle: "Reviewing assets", status: "Live", avatar: "DT" },
					{ title: "Content Team", subtitle: "Drafting campaign", status: "Live", avatar: "CT" },
				],
			},
		},
	],
	comparison: {
		rows: [
			{ feature: "Modern Tech Stack", competitor: false, socialfly: true },
			{ feature: "AI Content Optimization", competitor: false, socialfly: true },
			{ feature: "Unified Global Inbox", competitor: true, socialfly: true },
			{ feature: "No Per-User Charging", competitor: false, socialfly: true },
			{ feature: "Automated White-Labeling", competitor: true, socialfly: true },
			{ feature: "Predictive Performance Score", competitor: false, socialfly: true },
		],
	},
	faq: {
		title: "Common Questions",
		items: [
			{
				question: "Is SocialflyAI as powerful as Sendible?",
				answer:
					"More. We've taken everything you love about legacy social tools and rebuilt them on modern tech that's 5x faster.",
			},
			{
				question: "Can I manage multiple client accounts?",
				answer:
					"Yes. Our platform was built with agencies in mind. Tag, categorize, and report on unlimited clients easily.",
			},
			{
				question: "Do you offer white-labeled reporting?",
				answer:
					"Yes. Our white-label suite allows you to present data to your clients under your own brand.",
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

export default function VsSendiblePage() {
	return <CompetitorPage data={data} />;
}
