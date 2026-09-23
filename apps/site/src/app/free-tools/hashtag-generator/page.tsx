import {
	Globe,
	Hash,
	LayoutPanelTop,
	MousePointer2,
	Search,
	ShieldCheck,
	Star,
	TrendingUp,
	Zap,
} from "lucide-react";
import { FaqSection } from "@/components/marketing/faq-section";
import { ComingSoonPanel } from "@/components/marketing/free-tools/coming-soon-panel";
import { ToolHero, ToolPromo } from "@/components/marketing/free-tools/tool-page-shell";
import { ToolFeatureGrid, ToolGuide } from "@/components/marketing/free-tools/tool-sections";
import { pageMetadata } from "@/components/marketing/metadata";
import { Accent } from "@/components/marketing/primitives";
import { StepsSection } from "@/components/marketing/steps-section";

export const metadata = pageMetadata({
	title: "Free AI Hashtag Generator",
	description:
		"Generate trending and relevant hashtags for Instagram, TikTok, Twitter, and YouTube in seconds. Reach more users with AI-powered discovery.",
	path: "/free-tools/hashtag-generator",
	keywords: ["hashtag generator", "instagram hashtags", "tiktok hashtags", "ai hashtag tool"],
});

const STEPS = [
	{
		icon: Search,
		title: "Input Details",
		description: "Paste your post caption or main keywords into the AI generator field.",
	},
	{
		icon: MousePointer2,
		title: "Set Parameters",
		description:
			"Choose your target platform, hashtag count, and preferred tone for the best results.",
	},
	{
		icon: TrendingUp,
		title: "Copy & Grow",
		description: "One-click copy all generated hashtags directly into your social media scheduler.",
	},
];

const FEATURES = [
	{
		icon: TrendingUp,
		title: "Trending Index",
		description: "Our AI tracks viral trends across Instagram, TikTok, and X in real-time.",
	},
	{
		icon: Zap,
		title: "Niche Precision",
		description: "Get tags specifically tailored to your industry, from SaaS to Fashion.",
	},
	{
		icon: Globe,
		title: "Cross-Platform",
		description: "Optimized formatting for all major social networks in one click.",
	},
	{
		icon: ShieldCheck,
		title: "No Cap Limits",
		description: "We ensure your hashtag count fits platform-specific character limits.",
	},
	{
		icon: LayoutPanelTop,
		title: "Smart Grouping",
		description: "Tags are automatically ordered by impact and reach potential.",
	},
	{
		icon: Star,
		title: "Free Always",
		description: "Use the power of SocialflyAI's hashtag engine for free, forever.",
	},
];

const PRACTICES = [
	{
		title: "Avoid Banned Hashtags",
		description:
			"Instagram and TikTok shadowban certain tags. Always use an AI generator like ours to ensure you're using 'safe' metadata.",
	},
	{
		title: "Mix Broad & Niche Tags",
		description:
			"Use a mix of high-volume hashtags and hyper-specific niche ones to maximize both reach and targeted discovery.",
	},
	{
		title: "Limit Use on X/Twitter",
		description:
			"While Instagram thrives on 15+ tags, X (Twitter) performs best with only 1-2 highly relevant hashtags per post.",
	},
	{
		title: "Hide Your Tags",
		description:
			"On Instagram, keep your caption clean by placing your hashtags in the first comment or far below your main copy.",
	},
];

const FAQ = [
	{
		question: "Is a hashtag generator useful for SEO?",
		answer:
			"Yes. Hashtags are search metadata. Using correct, high-volume tags helps your content appear in explore feeds and search results.",
	},
	{
		question: "What are the best hashtags for Instagram?",
		answer:
			"The 'best' tags change daily. Our AI uses real-time trending data to ensure you're always using the most effective ones for the current moment.",
	},
	{
		question: "How many hashtags should I use on TikTok?",
		answer:
			"TikTok is most effective with 3-5 highly descriptive hashtags that explain the video theme and target niche.",
	},
	{
		question: "Can I use hashtags on YouTube?",
		answer:
			"Yes! YouTube displays the first three hashtags above your video title. They help immensely with categorization and search snippets.",
	},
	{
		question: "Is SocialflyAI's hashtag tool free?",
		answer: "Yes. Our core hashtag generation engine is completely free to use for all creators.",
	},
];

export default function HashtagGeneratorPage() {
	return (
		<>
			<ToolHero
				badge="AI Hashtag Optimizer"
				badgeIcon={Hash}
				title={
					<>
						Hashtag <Accent>Generator</Accent>
					</>
				}
				description="Generate trending and relevant hashtags for Instagram, TikTok, Twitter, and YouTube in seconds. Reach more users with AI-powered discovery."
			>
				<ComingSoonPanel icon={Hash} toolName="Hashtag Generator" />
			</ToolHero>
			<ToolPromo />
			<StepsSection
				title={
					<>
						Generate Hashtags in <Accent>3 Easy Steps</Accent>
					</>
				}
				steps={STEPS}
			/>
			<ToolFeatureGrid title="Main Features" items={FEATURES} />
			<ToolGuide title="Hashtag Best Practices" items={PRACTICES} />
			<FaqSection title="Hashtag Generator FAQ" items={FAQ} />
		</>
	);
}
