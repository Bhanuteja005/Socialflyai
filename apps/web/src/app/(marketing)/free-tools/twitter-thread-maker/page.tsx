import { MessageSquare } from "lucide-react";
import { FaqSection } from "@/components/marketing/faq-section";
import { ThreadMaker } from "@/components/marketing/free-tools/thread-maker";
import { ToolHero, ToolPromo } from "@/components/marketing/free-tools/tool-page-shell";
import { ToolGuide } from "@/components/marketing/free-tools/tool-sections";
import { pageMetadata } from "@/components/marketing/metadata";
import { Accent } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "Free Twitter Thread Maker",
	description:
		"Create engaging Twitter (X) threads in seconds. Split your content into perfectly sized, numbered tweets and preview how your thread will look before you post.",
	path: "/free-tools/twitter-thread-maker",
	keywords: ["twitter thread maker", "x thread generator", "tweet splitter", "thread creator"],
});

const TIPS = [
	{
		title: "Why Use Twitter Threads?",
		description:
			"Twitter threads allow you to connect multiple tweets together, creating a longer narrative that goes beyond the 280-character limit. They're perfect for storytelling, tutorials, and in-depth discussions while maintaining the engagement of the Twitter format.",
	},
	{
		title: "Creating Engaging Threads",
		description:
			"Start with a strong hook in your first tweet to grab attention. Break your content into logical segments, use numbering (1/5, 2/5, etc.) to help readers follow along, and end with a clear call-to-action. Visual content like images or GIFs can make your thread more engaging.",
	},
	{
		title: "Optimal Thread Length",
		description:
			"While you can create threads with dozens of tweets, research suggests that 4-7 tweets is the sweet spot for engagement. Longer threads risk losing reader interest, while shorter ones might not fully develop your ideas.",
	},
	{
		title: "Scheduling Your Threads",
		description:
			"With SocialflyAI, you can create and schedule your Twitter threads in advance, posting them at optimal times for engagement. Our platform helps you manage multiple threads and track their performance to refine your strategy.",
	},
];

const FAQ = [
	{
		question: "How does the thread maker split my text?",
		answer:
			"It packs whole words into tweets of up to 280 characters (leaving room for numbering when enabled). Leave a blank line anywhere to force a new tweet at that point.",
	},
	{
		question: "Is my content stored anywhere?",
		answer:
			"No. The thread maker runs entirely in your browser — nothing you type is sent to our servers.",
	},
	{
		question: "Is the Twitter Thread Maker free?",
		answer: "Yes, it's 100% free with no signup required as part of the SocialFly AI toolkit.",
	},
];

export default function TwitterThreadMakerPage() {
	return (
		<>
			<ToolHero
				badge="Thread builder"
				badgeIcon={MessageSquare}
				title={
					<>
						Free Twitter <Accent>Thread Maker</Accent>
					</>
				}
				description="Create engaging Twitter threads in seconds. Split your content into perfectly sized tweets and preview how your thread will look."
			>
				<ThreadMaker />
			</ToolHero>
			<ToolPromo />
			<ToolGuide
				title={
					<>
						Master the Art of the <Accent>Twitter Thread</Accent>
					</>
				}
				items={TIPS}
			/>
			<FaqSection title="Thread Maker FAQ" items={FAQ} />
		</>
	);
}
