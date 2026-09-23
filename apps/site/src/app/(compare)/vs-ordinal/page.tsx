import { CompetitorPage, type CompetitorPageData } from "@/components/marketing/competitor-page";
import { pageMetadata } from "@/components/marketing/metadata";
import { Accent } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "SocialflyAI vs Ordinal: Fresh AI Content Every Time",
	description:
		"Ordinal loops your old content. SocialflyAI's self-learning AI generates fresh takes on your best ideas with predictive performance and a 24/7 AI creative studio.",
	path: "/vs-ordinal",
});

const data: CompetitorPageData = {
	name: "Ordinal",
	hero: {
		title: (
			<>
				Fresh Content. <br />
				<Accent>Every Time.</Accent>
			</>
		),
		description:
			"Ordinal loops your old content. SocialflyAI's AI generates fresh new takes on your best ideas, keeping your feed alive and your audience engaged without recycling the past.",
	},
	features: [
		{
			title: (
				<>
					Intelligence <br />
					In Every Post
				</>
			),
			description:
				"Ordinal focuses on the 'how'. SocialflyAI focuses on the 'why'. Our AI analyzes your audience behavior to ensure every post serves a strategic purpose.",
			bullets: [
				"Behavioral AI Analysis",
				"Dynamic Content Scheduling",
				"Unified Brand Hub",
				"Real-time Trend Adaptation",
			],
			visual: { kind: "dashboard" },
		},
	],
	comparison: {
		rows: [
			{ feature: "Self-Learning AI Engine", competitor: false, socialfly: true },
			{ feature: "Cross-Network Growth", competitor: true, socialfly: true },
			{ feature: "Predictive Performance", competitor: false, socialfly: true },
			{ feature: "Automated Brand Scaling", competitor: true, socialfly: true },
			{ feature: "Collaborative Workflows", competitor: true, socialfly: true },
			{ feature: "24/7 AI Creative Studio", competitor: false, socialfly: true },
		],
	},
};

export default function VsOrdinalPage() {
	return <CompetitorPage data={data} />;
}
