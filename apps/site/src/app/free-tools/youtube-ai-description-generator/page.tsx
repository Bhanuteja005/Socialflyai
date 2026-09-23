import { CircleCheck, FilePlay, MessageSquareText, Search, Zap } from "lucide-react";
import { FaqSection } from "@/components/marketing/faq-section";
import { ComingSoonPanel } from "@/components/marketing/free-tools/coming-soon-panel";
import { ToolHero, ToolPromo } from "@/components/marketing/free-tools/tool-page-shell";
import { ToolFeatureGrid, ToolGuide } from "@/components/marketing/free-tools/tool-sections";
import { pageMetadata } from "@/components/marketing/metadata";
import { Accent } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "Free YouTube AI Description Generator",
	description:
		"Craft compelling, high-converting descriptions for your YouTube videos in seconds. Optimized for search and viewer engagement using native AI.",
	path: "/free-tools/youtube-ai-description-generator",
	keywords: ["youtube description generator", "ai video description", "youtube seo description"],
});

const WHY = [
	{
		title: "Boost Search Visibility",
		description:
			"YouTube is the world's second-largest search engine. Well-crafted descriptions help you show up in more search results.",
	},
	{
		title: "Improve Click-Through Rate",
		description:
			"The first two lines of your description appear in search results. Catchy hooks lead to more clicks.",
	},
	{
		title: "Drive Targeted Actions",
		description:
			"Perfectly placed CTAs and links help convert viewers into subscribers, customers, or newsletter members.",
	},
	{
		title: "Algorithmic Indexing",
		description:
			"Detailed text provides the algorithm with rich context, helping categorize your videos correctly for 'Suggested' sidebar placement.",
	},
];

const PRACTICES = [
	{
		icon: Zap,
		title: "Hook in the First 150 Characters",
		description:
			"The 'Above the Fold' text is crucial. Place your main keyword and strongest hook in the very first sentence.",
	},
	{
		icon: CircleCheck,
		title: "Include Multiple CTAs",
		description:
			"Tell your viewers exactly what to do next. Link your newsletter, products, and subscribe buttons clearly.",
	},
	{
		icon: Search,
		title: "Use High-Value Keywords",
		description:
			"Don't just write. Research relevant keywords and weave them naturally into the narrative of the description.",
	},
	{
		icon: FilePlay,
		title: "Timestamps & Chapters",
		description:
			"Adding timestamps helps viewers navigate to the best parts and creates Google search fragments for specific queries.",
	},
];

const FAQ = [
	{
		question: "How long should a YouTube description be?",
		answer:
			"YouTube allows up to 5,000 characters, but 2,000 to 3,000 is often the 'sweet spot' for providing enough value and SEO context without being overwhelming.",
	},
	{
		question: "Is the generator free to use?",
		answer:
			"Yes, our YouTube AI Description Generator is free for all creators as part of the SocialflyAI free toolkit.",
	},
	{
		question: "Will AI-generated descriptions hurt my SEO?",
		answer:
			"No. In fact, high-quality, relevant AI content helps your SEO by providing clear structure and consistent keyword density that algorithms prefer.",
	},
	{
		question: "How many hashtags should I include?",
		answer:
			"We recommend including 3 to 5 highly relevant hashtags. YouTube only displays the first three above the video title.",
	},
	{
		question: "Can I generate descriptions in other languages?",
		answer:
			"Yes! Our AI supports English, Spanish, French, German, and Hindi, allowing you to reach a global audience.",
	},
];

export default function YouTubeDescriptionGeneratorPage() {
	return (
		<>
			<ToolHero
				badge="AI Content Studio"
				badgeIcon={MessageSquareText}
				title={
					<>
						YouTube AI <Accent>Description Generator</Accent>
					</>
				}
				description="Craft compelling, high-converting descriptions for your YouTube videos in seconds. Optimized for search and viewer engagement using native AI."
			>
				<ComingSoonPanel icon={MessageSquareText} toolName="YouTube AI Description Generator" />
			</ToolHero>
			<ToolPromo />
			<ToolGuide
				title={
					<>
						Why YouTube <Accent>Descriptions</Accent> Matter
					</>
				}
				description="Descriptions are your invisible salesperson. Most creators neglect the description field, but it's the most powerful tool for SEO and lead generation on the platform."
				items={WHY}
			/>
			<ToolFeatureGrid
				title="Description Best Practices"
				description="Maximize your discovery."
				items={PRACTICES}
				columns={4}
			/>
			<FaqSection title="YouTube Description FAQ" items={FAQ} />
		</>
	);
}
