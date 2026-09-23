import { CircleCheck, Search, SquarePlay, Tag, Zap } from "lucide-react";
import { FaqSection } from "@/components/marketing/faq-section";
import { ComingSoonPanel } from "@/components/marketing/free-tools/coming-soon-panel";
import { ToolHero, ToolPromo } from "@/components/marketing/free-tools/tool-page-shell";
import { ToolFeatureGrid, ToolGuide } from "@/components/marketing/free-tools/tool-sections";
import { pageMetadata } from "@/components/marketing/metadata";
import { Accent } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "Free YouTube Tags Generator",
	description:
		"Generate optimized, high-ranking tags for your YouTube videos to improve discoverability and reach more viewers in seconds.",
	path: "/free-tools/youtube-tags-generator",
	keywords: ["youtube tags generator", "youtube seo tags", "video tags", "youtube keyword tool"],
});

const WHY = [
	{
		icon: Search,
		title: "Search SEO",
		description: "Appear in targeted search queries for your niche.",
	},
	{
		icon: SquarePlay,
		title: "Suggested Grid",
		description: "Get recommended next to high-performing similar videos.",
	},
	{
		icon: CircleCheck,
		title: "Categorization",
		description: "Help the algorithm place you in the right content category.",
	},
	{
		icon: Zap,
		title: "Competitor Analysis",
		description: "Outrank competitors by using smarter, more relevant meta-data.",
	},
];

const PRACTICES = [
	{
		title: "Focus on Relevance",
		description:
			"Don't use misleading tags. Always ensure your tags directly describe what's happening in your video to maintain viewer retention.",
	},
	{
		title: "Mix Specific & Broad",
		description:
			"Use unique long-tail keywords for your specific topic, but also include broader tags for your general niche.",
	},
	{
		title: "Stay Within Limits",
		description:
			"YouTube allows up to 500 characters in the tags field. Don't hit the limit just for the sake of it; focus on the top 10-15 most impactful ones.",
	},
	{
		title: "Periodic Research",
		description:
			"Trends change. Use SocialflyAI to re-generate tags for your evergreen content every few months to stay relevant.",
	},
	{
		title: "Lead With Your Main Keyword",
		description:
			"The first tag in your list is the most important. Always use your main targeted keyword as your #1 tag for maximum algorithmic weight.",
	},
];

const FAQ = [
	{
		question: "Are YouTube tags still important in 2026?",
		answer:
			"While titles and thumbnails are primary factors, tags remain essential for categorization and helping the algorithm understand content nuances, especially for less-established channels.",
	},
	{
		question: "How many tags should I use?",
		answer:
			"Most experts recommend using between 10 to 15 highly relevant tags. Quality and precision always outperform quantity.",
	},
	{
		question: "Should I include my brand name in tags?",
		answer:
			"Absolutely. Including your unique brand or channel name as a tag helps YouTube link all your videos together in the 'Suggested' sidebar.",
	},
	{
		question: "Is the YouTube Tags Generator free?",
		answer:
			"Yes, our tag generator is 100% free and powered by the same SocialflyAI technology used in our premium scheduler.",
	},
	{
		question: "What's the difference between keywords and tags?",
		answer:
			"Keywords are usually used in your title and description for human readability. Tags are meta-data primarily used for the backend algorithmic indexing.",
	},
	{
		question: "How does SocialflyAI pick these tags?",
		answer:
			"Our AI analyzes your video description and topic, crosses it with current trending search patterns, and suggests the highest probability tags for your specific niche.",
	},
];

export default function YouTubeTagsGeneratorPage() {
	return (
		<>
			<ToolHero
				badge="AI Powered SEO Tool"
				badgeIcon={Tag}
				title={
					<>
						YouTube <Accent>Tags Generator</Accent>
					</>
				}
				description="Generate optimized, high-ranking tags for your YouTube videos to improve discoverability and reach more viewers in seconds."
			>
				<ComingSoonPanel icon={Tag} toolName="YouTube Tags Generator" />
			</ToolHero>
			<ToolPromo />
			<ToolFeatureGrid
				title="Why YouTube Tags Matter"
				description="Tags help YouTube's algorithm understand your content and categorize it correctly in search results and suggestions."
				items={WHY}
				columns={4}
			/>
			<ToolGuide title="YouTube Tags Best Practices" items={PRACTICES} />
			<FaqSection title="YouTube Tags FAQ" items={FAQ} />
		</>
	);
}
