import { Cpu } from "lucide-react";
import { CompetitorPage, type CompetitorPageData } from "@/components/marketing/competitor-page";
import { pageMetadata } from "@/components/marketing/metadata";
import { Accent } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "SocialflyAI vs ContentStudio: Original AI Content, Not Curation",
	description:
		"ContentStudio curates what's popular. SocialflyAI generates original, on-brand content with predictive performance, brand context and unlimited team members.",
	path: "/vs-contentstudio",
});

const data: CompetitorPageData = {
	name: "ContentStudio",
	hero: {
		title: (
			<>
				Original AI Content. <br />
				<Accent>Beyond Curation.</Accent>
			</>
		),
		description:
			"ContentStudio focused on what was popular. SocialflyAI focuses on what makes your brand unique. Experience an AI-first workspace that generates original content instead of just curating the web.",
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
			title: "Originality At Scale",
			description:
				"ContentStudio's automation can feel repetitive. SocialflyAI's AI creative engine learns your unique brand personality, generating original content that actually resonates with your audience.",
			bullets: [
				"Contextual AI Captions",
				"Sentiment Analysis",
				"Auto-Visual Generation",
				"Trend Prediction",
			],
			visual: { kind: "chart", title: "AI Creative Engine", caption: "Original posts generated" },
		},
		{
			title: "Unified Control Center",
			description:
				"Stop jumping between tabs. SocialflyAI brings your entire marketing stack into a single, high-performance dashboard that's actually a joy to use.",
			cards: [
				{
					title: "Predictive Analytics",
					description: "Know exactly how your posts will perform before you hit publish.",
				},
				{
					title: "Dynamic Content Calendar",
					description: "Drag and drop with real-time AI suggestions for peak timing.",
				},
			],
			visual: { kind: "dashboard" },
		},
		{
			title: "Built for Agencies & Teams",
			description:
				"ContentStudio's team management is complex. SocialflyAI makes it simple. Unlimited members, granular roles, and frictionless client approvals.",
			visual: {
				kind: "list",
				title: "Team Activity",
				icon: Cpu,
				rows: [
					{
						title: "Content Team",
						subtitle: "AI optimizing captions",
						status: "Live",
						avatar: "CT",
					},
					{
						title: "Client Approvals",
						subtitle: "2 pending reviews",
						status: "Pending",
						tone: "warning",
						avatar: "CA",
					},
				],
			},
		},
	],
	comparison: {
		rows: [
			{ feature: "Next-Gen AI Writing", competitor: true, socialfly: true },
			{ feature: "Predictive Performance", competitor: false, socialfly: true },
			{ feature: "Automated Brand Context", competitor: false, socialfly: true },
			{ feature: "Unlimited Team Members", competitor: false, socialfly: true },
			{ feature: "Premium Dark UI", competitor: false, socialfly: true },
			{ feature: "Real-time Trend Engine", competitor: true, socialfly: true },
		],
	},
	faq: {
		title: "Common Questions",
		items: [
			{
				question: "How is SocialflyAI different from ContentStudio?",
				answer:
					"While ContentStudio focuses on discovery and basic automation, SocialflyAI uses advanced AI to actually create and optimize content within your specific brand voice.",
			},
			{
				question: "Is it easy to migrate?",
				answer:
					"Extremely. You can connect your socials and import your data in less than 2 minutes. Our onboarding is designed to be seamless.",
			},
			{
				question: "Does it support team collaboration?",
				answer:
					"Yes, we offer unlimited team slots on our pro plans, allowing your entire agency to collaborate without extra costs.",
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

export default function VsContentStudioPage() {
	return <CompetitorPage data={data} />;
}
