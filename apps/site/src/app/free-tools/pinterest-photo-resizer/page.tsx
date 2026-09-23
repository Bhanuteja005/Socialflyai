import { ImageIcon } from "lucide-react";
import { FaqSection } from "@/components/marketing/faq-section";
import { ImageResizer } from "@/components/marketing/free-tools/image-resizer";
import { ToolHero, ToolPromo } from "@/components/marketing/free-tools/tool-page-shell";
import { ToolGuide } from "@/components/marketing/free-tools/tool-sections";
import { pageMetadata } from "@/components/marketing/metadata";
import { Accent } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "Free Pinterest Image Resizer",
	description:
		"Resize images for Pinterest: standard pins (1000×1500), long pins, square pins, profile pictures and board covers. Free and private — runs entirely in your browser.",
	path: "/free-tools/pinterest-photo-resizer",
	keywords: ["pinterest image resizer", "pinterest pin size", "pinterest board cover size"],
});

const GUIDE = [
	{
		title: "Standard Pin",
		description:
			"The recommended size for standard Pinterest pins is 1000 × 1500 pixels with a 2:3 aspect ratio. This vertical format is ideal for most content and performs well in Pinterest's feed algorithm. Pins with this aspect ratio typically receive more engagement and visibility.",
	},
	{
		title: "Long Pin",
		description:
			"Long pins (1000 × 2100 pixels with a 1:2.1 aspect ratio) can be effective for step-by-step tutorials, infographics, or recipes. While they take up more vertical space in the feed, Pinterest may truncate very long images, so keep important content toward the top.",
	},
	{
		title: "Square Pin",
		description:
			"Square pins (1000 × 1000 pixels with a 1:1 aspect ratio) work well for product images, quotes, and content that needs equal dimensions. While not as dominant in the feed as vertical pins, they're versatile and can be repurposed for other platforms like Instagram.",
	},
	{
		title: "Profile Picture",
		description:
			"Your Pinterest profile picture should be 165 × 165 pixels with a 1:1 aspect ratio. Pinterest displays profile pictures as circles, so make sure important elements are centered. A clear, recognizable image helps build brand identity and trust with your audience.",
	},
	{
		title: "Board Cover",
		description:
			"Board covers appear at 600 × 400 pixels with a 3:2 aspect ratio. Choosing attractive, cohesive board covers creates a professional-looking profile and helps users quickly understand your content categories. Select images that clearly represent each board's theme.",
	},
];

const FAQ = [
	{
		question: "What is the best aspect ratio for Pins?",
		answer:
			"Pinterest recommends a 2:3 aspect ratio (e.g., 1000 x 1500 pixels). This ratio ensures your pins look their best in the feed without being truncated.",
	},
	{
		question: "Why are vertical images better on Pinterest?",
		answer:
			"Pinterest is a vertical-first platform. Vertical images take up more 'real estate' in the home feed, making them more likely to catch a user's eye and drive clicks.",
	},
	{
		question: "Can I use square images on Pinterest?",
		answer:
			"Yes, square images (1000x1000) are supported, but they generally see lower engagement than vertical 2:3 pins. Use them sparingly for specific content types.",
	},
	{
		question: "What is the maximum file size for Pinterest?",
		answer:
			"Pinterest supports files up to 10MB. Our resizer exports an optimized JPEG so your image meets platform requirements while maintaining high quality.",
	},
	{
		question: "Is the Pinterest Resizer tool free?",
		answer:
			"Yes, like all SocialflyAI free tools, the Pinterest Resizer is 100% free and requires no signup or login.",
	},
];

export default function PinterestPhotoResizerPage() {
	return (
		<>
			<ToolHero
				badge="Image resizer"
				badgeIcon={ImageIcon}
				title={
					<>
						Free Pinterest <Accent>Image Resizer</Accent> Tool
					</>
				}
				description="Create eye-catching Pinterest content in seconds. Get the perfect dimensions for pins, board covers, profile pictures, and more."
			>
				<ImageResizer platform="pinterest" />
			</ToolHero>
			<ToolPromo />
			<ToolGuide title="Pinterest Image Size Guide" items={GUIDE} />
			<FaqSection title="Pinterest Resizer FAQ" items={FAQ} />
		</>
	);
}
