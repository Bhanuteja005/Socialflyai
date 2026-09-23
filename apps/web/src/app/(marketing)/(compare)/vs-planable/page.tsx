import { CompetitorPage, type CompetitorPageData } from "@/components/marketing/competitor-page";
import { pageMetadata } from "@/components/marketing/metadata";
import { Accent } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "SocialflyAI vs Planable: Beyond Simple Approval Workflows",
	description:
		"Planable helps you approve content. SocialflyAI helps you create it, with AI captioning, real-time ROI analytics, multi-platform sync and client review links.",
	path: "/vs-planable",
});

const data: CompetitorPageData = {
	name: "Planable",
	hero: {
		title: (
			<>
				Beyond Simple <br />
				<Accent>Approval Workflows.</Accent>
			</>
		),
		description:
			"Planable helps you approve content. SocialflyAI helps you create it. Experience the perfect blend of world-class collaboration and native AI creation in one seamless workspace.",
		socialProof: (
			<>
				<span className="font-bold text-white">4.8/5</span> trusted by 800+ agencies
			</>
		),
	},
	preview: {
		title: "See SocialflyAI In Action",
		subtitle: "The future of social media collaboration is here.",
	},
	features: [
		{
			title: "AI-Powered Creation & Approvals",
			description:
				"Planable focuses on the visual grid, but SocialflyAI adds a high-performance AI engine underneath. Automate your variations and sync across platforms without leaving the collaboration loop.",
			bullets: ["Multi-grid Views", "Advanced Analytics", "AI Content Sync", "Unlimited Storage"],
			visual: { kind: "calendar", title: "Content Calendar" },
		},
		{
			title: "Approval Workflows Without Limits",
			description:
				"SocialflyAI streamlines agency-client collaboration. Get instant feedback, track version history, and push to live with absolute confidence.",
			cards: [
				{
					title: "Multi-level Approvals",
					description: "Custom chains for internal teams and external clients.",
				},
				{
					title: "Version Control",
					description: "Never lose a draft again. Compare every iteration instantly.",
				},
			],
			visual: { kind: "dashboard" },
		},
		{
			title: "Complete Social Media Management",
			description:
				"While Planable lives in the approval phase, SocialflyAI lives in the entire lifecycle. From AI-powered brainstorming to deep-dive ROI analytics, we've got you covered.",
			chips: ["Zero Latency", "Multi-Org Support", "Instant Shared Links", "Auto-Scheduling"],
			visual: {
				kind: "chat",
				title: "Active in Draft #4",
				action: "APPROVE POST",
				messages: [
					{
						author: "Alex (Content Director)",
						text: "Looks perfect! Ready for client approval.",
					},
				],
			},
		},
	],
	comparison: {
		title: "Switch to the AI-Native Alternative",
		rows: [
			{ feature: "Visual Grid Approvals", competitor: true, socialfly: true },
			{ feature: "AI-Powered Captioning", competitor: false, socialfly: true },
			{ feature: "Real-time ROI Analytics", competitor: false, socialfly: true },
			{ feature: "Client Review Links", competitor: true, socialfly: true },
			{ feature: "Multi-Platform Content Sync", competitor: false, socialfly: true },
			{ feature: "Automatic Best Time to Post", competitor: false, socialfly: true },
		],
	},
	faq: {
		title: "Planable Users Love Us",
		items: [
			{
				question: "Can my clients approve posts without a SocialflyAI account?",
				answer:
					"YES. You can send secure, custom-branded shareable links where they can review and approve in one click.",
			},
			{
				question: "Does SocialflyAI support custom approval roles?",
				answer:
					"Absolutely. You can define specific permissions for content creators, managers, and stakeholders.",
			},
			{
				question: "Is there a limit on how many posts we can plan?",
				answer: "Zero limits. We want you to create as much high-impact content as possible.",
			},
		],
	},
	cta: {
		title: (
			<>
				Get Approval. <br />
				Get Results.
			</>
		),
		label: "Take Control",
	},
};

export default function VsPlanablePage() {
	return <CompetitorPage data={data} />;
}
