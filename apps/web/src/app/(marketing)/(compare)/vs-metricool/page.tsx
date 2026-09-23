import { CompetitorPage, type CompetitorPageData } from "@/components/marketing/competitor-page";
import { pageMetadata } from "@/components/marketing/metadata";
import { Accent } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "SocialflyAI vs Metricool: Actionable Strategy Beyond Analytics",
	description:
		"Metricool shows what happened. SocialflyAI shows what to do next, combining analytics with predictive AI insights, AI ads optimization and AI content creation.",
	path: "/vs-metricool",
});

const data: CompetitorPageData = {
	name: "Metricool",
	hero: {
		title: (
			<>
				Actionable Strategy. <br />
				<Accent>Beyond Analytics.</Accent>
			</>
		),
		description:
			"Metricool shows you what happened. SocialflyAI shows you what to do next. Combine world-class analytics with AI-driven content creation to close the loop on your social strategy.",
	},
	preview: {
		title: "See SocialflyAI In Action",
		subtitle: "Transform your raw data into a social media powerhouse.",
	},
	features: [],
	comparison: {
		rows: [
			{ feature: "Predictive AI Insights", competitor: false, socialfly: true },
			{ feature: "Unified Content Hub", competitor: true, socialfly: true },
			{ feature: "Competitor Benchmarking", competitor: true, socialfly: true },
			{ feature: "AI Ads Optimization", competitor: false, socialfly: true },
			{ feature: "Automated Reporting", competitor: true, socialfly: true },
			{ feature: "Agency White-Labeling", competitor: "Paid", socialfly: true },
		],
	},
	faq: {
		title: "Common Questions",
		items: [
			{
				question: "Is your analytics better than Metricool?",
				answer:
					"Metricool is great for static reports. SocialflyAI is better for active growth, using AI to predict which posts will perform before you publish.",
			},
			{
				question: "Can I manage ad campaigns?",
				answer:
					"Yes, our unified dashboard allows you to monitor and optimize both organic and paid social content in one place.",
			},
			{
				question: "How easy is it to set up?",
				answer:
					"Setup takes less than 60 seconds. Connect your accounts and our AI will immediately start analyzing your past performance.",
			},
		],
	},
};

export default function VsMetricoolPage() {
	return <CompetitorPage data={data} />;
}
