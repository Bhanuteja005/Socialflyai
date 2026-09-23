import { CompetitorPage, type CompetitorPageData } from "@/components/marketing/competitor-page";
import { pageMetadata } from "@/components/marketing/metadata";
import { Accent } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "SocialflyAI vs Hypefury: Scale Beyond One Platform",
	description:
		"Hypefury is built for X. SocialflyAI brings the same high-performing automation, viral hooks and threads to LinkedIn, Instagram and every channel you use.",
	path: "/vs-hypefury",
});

const data: CompetitorPageData = {
	name: "Hypefury",
	hero: {
		title: (
			<>
				Scale Beyond <br />
				<Accent>One Platform.</Accent>
			</>
		),
		description:
			"Hypefury is built for X. SocialflyAI is built for your entire brand. Take the same high-performing automation and apply it to LinkedIn, Instagram, and more.",
	},
	features: [
		{
			title: (
				<>
					Beyond Twitter <br />
					Automation
				</>
			),
			description:
				"Hypefury is built for creator X. SocialflyAI is built for creator brands. Take the same high-performing Twitter strategies and apply them automatically to LinkedIn, Instagram, and more.",
			bullets: ["Cross-Platform Threads", "Auto-Retweets", "Smart Timelines", "AI Hook Generator"],
			visual: { kind: "dashboard" },
		},
	],
	comparison: {
		rows: [
			{ feature: "All Social Platforms", competitor: "Partial", socialfly: true },
			{ feature: "AI Viral Hook Engine", competitor: true, socialfly: true },
			{ feature: "Automated DM Sequences", competitor: true, socialfly: true },
			{ feature: "Visual Content Hub", competitor: false, socialfly: true },
			{ feature: "Team Collaboration", competitor: "Limited", socialfly: true },
			{ feature: "Deep Analytics", competitor: true, socialfly: true },
		],
	},
};

export default function VsHypefuryPage() {
	return <CompetitorPage data={data} />;
}
