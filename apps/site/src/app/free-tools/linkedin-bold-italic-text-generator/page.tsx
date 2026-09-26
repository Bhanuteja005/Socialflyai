import { CircleCheck, Type } from "lucide-react";
import { FaqSection } from "@/components/marketing/faq-section";
import { TextStyler } from "@/components/marketing/free-tools/text-styler";
import { ToolHero, ToolPromo } from "@/components/marketing/free-tools/tool-page-shell";
import { ToolProse } from "@/components/marketing/free-tools/tool-sections";
import { pageMetadata } from "@/components/marketing/metadata";
import { Accent } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "LinkedIn Bold & Italic Text Generator",
	description:
		"Format your LinkedIn posts with bold and italic text to make them stand out in the feed. Type your text and copy the Unicode-formatted version — free, no signup.",
	path: "/free-tools/linkedin-bold-italic-text-generator",
	keywords: [
		"linkedin bold text",
		"linkedin italic text",
		"unicode bold generator",
		"linkedin formatter",
	],
});

const PRACTICES = [
	"Use bold text for headlines, key points, and important announcements",
	"Apply italic formatting for emphasis on specific words or phrases",
	"Don't overuse formatting — less is more for professional content",
	"Ensure your formatted text is still readable and professional",
	"Test how your formatted text appears on different devices",
];

const FAQ = [
	{
		question: "Is stylized text safe for the algorithm?",
		answer:
			"Generally, yes. LinkedIn sees these as standard Unicode characters. However, excessive use might trigger spam filters if the readability score of your post becomes too low.",
	},
	{
		question: "Does this work on mobile and desktop?",
		answer:
			"Yes! Since we use standard Unicode, your stylized text will appear correctly on the LinkedIn mobile app and all desktop browsers.",
	},
	{
		question: "Will my post still be searchable?",
		answer:
			"Keywords in stylized text might not appear in standard searches. We recommend keeping keywords in plain text and using bold for emphasis.",
	},
	{
		question: "Does it affect screen readers?",
		answer:
			"Unicode mathematical symbols might not be read correctly by some screen readers. We recommend using them sparingly for emphasis, not for full paragraphs.",
	},
	{
		question: "Is this tool free for everyone?",
		answer: "Yes, it is 100% free with no signup required as part of the SocialflyAI toolkit.",
	},
];

export default function LinkedInTextGeneratorPage() {
	return (
		<>
			<ToolHero
				badge="LinkedIn formatter"
				badgeIcon={Type}
				title={
					<>
						LinkedIn Bold &amp; Italic <Accent>Text Generator</Accent>
					</>
				}
				description="Format your LinkedIn posts with bold and italic text to make them stand out in the feed. Simply type your text and copy the formatted version."
			>
				<TextStyler />
			</ToolHero>
			<ToolPromo />
			<ToolProse title="How to Use Bold and Italic Text on LinkedIn">
				<h3>Why Use Formatted Text on LinkedIn?</h3>
				<p>
					Bold and italic text can help your LinkedIn posts stand out in the crowded news feed.
					Formatted text draws attention to key points, improves readability, and can increase
					engagement rates by making your content more visually appealing.
				</p>
				<h3>Best Practices for LinkedIn Text Formatting</h3>
				<ul className="space-y-3">
					{PRACTICES.map((item) => (
						<li key={item} className="flex items-start gap-3">
							<CircleCheck className="mt-0.5 size-5 shrink-0 text-brand-text" aria-hidden="true" />
							<span>{item}</span>
						</li>
					))}
				</ul>
				<h3>How It Works</h3>
				<p>
					Our tool converts your regular text into Unicode characters that appear bold or italic on
					LinkedIn. These special characters are supported across all platforms and devices,
					ensuring your formatting appears correctly for all viewers.
				</p>
				<h3>Post to Multiple Platforms Simultaneously</h3>
				<p>
					Once you&apos;ve created your perfectly formatted LinkedIn post, consider using
					SocialflyAI to share it across up to 10 different social media platforms at once. Our
					platform preserves your text formatting and helps you maintain a consistent professional
					presence across LinkedIn, Twitter, Facebook, Instagram, and more — all while saving you
					hours of manual posting.
				</p>
			</ToolProse>
			<FaqSection title="LinkedIn Styler FAQ" items={FAQ} />
		</>
	);
}
