import { CompetitorPage, type CompetitorPageData } from "@/components/marketing/competitor-page";
import { pageMetadata } from "@/components/marketing/metadata";
import { Accent } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "SocialflyAI vs TweetHunter: Ghostwriting AI for Every Platform",
	description:
		"TweetHunter is a power tool for X. SocialflyAI brings high-end AI ghostwriting, viral pattern recognition and collaborative workspaces to every platform you care about.",
	path: "/vs-tweethunter",
});

const data: CompetitorPageData = {
	name: "TweetHunter",
	hero: {
		title: (
			<>
				Ghostwriting AI, <br />
				<Accent>For Every Platform.</Accent>
			</>
		),
		description:
			"TweetHunter is a power tool for X. SocialflyAI is a power tool for your entire brand. Get the same high-end ghostly writing and growth features, but for every platform you care about.",
	},
	features: [
		{
			title: (
				<>
					AI Content <br />
					Scaling
				</>
			),
			description:
				"TweetHunter has great AI for tweets. SocialflyAI has great AI for everything. Scale your brand's voice across Instagram, LinkedIn, and TikTok using the same high-converting patterns.",
			bullets: [
				"Multi-Niche AI Training",
				"Viral Pattern Recognition",
				"Auto-Thread Carousel",
				"Smart DM Pipelines",
			],
			visual: { kind: "dashboard" },
		},
	],
	comparison: {
		rows: [
			{ feature: "All Platforms Supported", competitor: false, socialfly: true },
			{ feature: "AI Viral Detection", competitor: true, socialfly: true },
			{ feature: "Automated Lead Gen", competitor: true, socialfly: true },
			{ feature: "Dynamic Visual Editor", competitor: false, socialfly: true },
			{ feature: "Collaborative Workspaces", competitor: false, socialfly: true },
			{ feature: "24/7 Priority AI Chat", competitor: false, socialfly: true },
		],
	},
};

export default function VsTweetHunterPage() {
	return <CompetitorPage data={data} />;
}
