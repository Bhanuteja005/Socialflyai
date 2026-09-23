import { CompetitorPage, type CompetitorPageData } from "@/components/marketing/competitor-page";
import { pageMetadata } from "@/components/marketing/metadata";
import { Accent } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "SocialflyAI vs HeyOrca: The AI Creative Partner for Agencies",
	description:
		"HeyOrca is a great calendar, but it doesn't write your posts. SocialflyAI pairs approval workflows with a native AI engine and unlimited team members.",
	path: "/vs-heyorca",
});

const data: CompetitorPageData = {
	name: "HeyOrca",
	hero: {
		title: (
			<>
				The AI Creative <br />
				<Accent>Partner for Agencies.</Accent>
			</>
		),
		description:
			"HeyOrca is a great calendar, but it doesn't help you write the posts. SocialflyAI combines an intuitive approval workflow with a native AI engine that does the creative heavy lifting for your team.",
		socialProof: (
			<>
				<span className="font-bold text-white">4.9/5</span> rated by 2k+ creators
			</>
		),
	},
	preview: {
		title: "See SocialflyAI In Action",
		subtitle: "The most intuitive collaboration engine for teams.",
	},
	features: [
		{
			title: "Creativity Meets Approvals",
			description:
				"HeyOrca excels at getting clients to say 'Yes'. SocialflyAI excels at giving them something worth saying 'Yes' to. Our AI helps your team generate high-performance content that clients will love, instantly.",
			bullets: [
				"Real-time AI Feedback",
				"Unified Asset Library",
				"Smart Approval Routing",
				"Unlimited Team Members",
			],
			visual: { kind: "dashboard" },
		},
	],
	comparison: {
		rows: [
			{ feature: "Unlimited Team Members", competitor: false, socialfly: true },
			{ feature: "AI Content Engine", competitor: "Limited", socialfly: true },
			{ feature: "Unified Calendar", competitor: true, socialfly: true },
			{ feature: "White-Label Approvals", competitor: true, socialfly: true },
			{ feature: "Automated Posting", competitor: true, socialfly: true },
			{ feature: "Predictive Analytics", competitor: false, socialfly: true },
		],
	},
	faq: {
		title: "Common Questions",
		items: [
			{
				question: "Can we transition from HeyOrca easily?",
				answer:
					"Absolutely. Our platform is built for speed. You can import your assets and team in minutes, not days.",
			},
			{
				question: "Is the AI tool really better than manual drafting?",
				answer:
					"Yes. Our AI doesn't just draft; it optimizes for engagement based on real-time platform trends.",
			},
			{
				question: "How many team members can we have?",
				answer:
					"Unlike competitors who charge per seat, SocialflyAI offers unlimited team members on all premium plans.",
			},
		],
	},
};

export default function VsHeyOrcaPage() {
	return <CompetitorPage data={data} />;
}
