import { ImageIcon } from "lucide-react";
import { FaqSection } from "@/components/marketing/faq-section";
import { ImageResizer } from "@/components/marketing/free-tools/image-resizer";
import { ToolHero, ToolPromo } from "@/components/marketing/free-tools/tool-page-shell";
import { ToolGuide } from "@/components/marketing/free-tools/tool-sections";
import { pageMetadata } from "@/components/marketing/metadata";
import { Accent } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "Free LinkedIn Photo Resizer",
	description:
		"Resize images for LinkedIn: profile pictures (400×400), banners (1584×396), post images (1200×628) and company logos (300×300). Free, private and instant in your browser.",
	path: "/free-tools/linkedin-photo-resizer",
	keywords: ["linkedin image resizer", "linkedin banner size", "linkedin profile photo size"],
});

const GUIDE = [
	{
		title: "Profile Picture",
		description:
			"Your LinkedIn profile picture is crucial for making a professional first impression. The recommended size is 400 × 400 pixels with a 1:1 aspect ratio. LinkedIn displays your profile picture as a circle, so ensure important elements are centered. A high-quality, professional headshot can significantly improve your profile's effectiveness.",
	},
	{
		title: "Banner Image",
		description:
			"The LinkedIn banner (or background) image appears at the top of your profile and helps establish your personal brand. The recommended size is 1584 × 396 pixels with a 4:1 aspect ratio. Keep important content in the center as the edges may be cropped on different devices. Use this space to showcase your professional identity or highlight your company.",
	},
	{
		title: "Post Image",
		description:
			"Images shared in LinkedIn posts should be 1200 × 628 pixels with a 1.91:1 aspect ratio for optimal display in feeds. High-quality, relevant images can significantly increase engagement with your content. Consider using branded graphics, infographics, or professional photography to stand out in the feed.",
	},
	{
		title: "Company Logo",
		description:
			"For LinkedIn company pages, the logo should be 300 × 300 pixels with a 1:1 aspect ratio. Your company logo appears in search results and on your company page, so it should be clear and recognizable even at smaller sizes. Use a high-resolution version of your logo with adequate padding around the edges.",
	},
];

const FAQ = [
	{
		question: "What is the best format for LinkedIn images?",
		answer:
			"LinkedIn handles JPG, PNG, and GIF formats. For logos and graphics with sharp text, PNG is usually the best choice to avoid compression artifacts.",
	},
	{
		question: "Why does my profile photo look blurry?",
		answer:
			"Blurriness usually occurs if you upload an image smaller than 400x400 pixels or if the original file is low quality. Always use SocialflyAI's resizer to start with the correct 400x400 canvas.",
	},
	{
		question: "What is the banner aspect ratio?",
		answer:
			"The LinkedIn desktop banner has a 4:1 aspect ratio. However, on mobile, the cropping changes. Keep your main content centered so it stays within the 'safe zone'.",
	},
	{
		question: "Is this LinkedIn resizer tool free?",
		answer:
			"Yes! Our LinkedIn Photo Resizer is 100% free to use forever. It's part of SocialflyAI's mission to power the creator economy.",
	},
	{
		question: "Do I need to sign up to download resized images?",
		answer:
			"No registration is required. Images are resized directly in your browser and never uploaded — download your professional assets instantly without an account.",
	},
];

export default function LinkedInPhotoResizerPage() {
	return (
		<>
			<ToolHero
				badge="Image resizer"
				badgeIcon={ImageIcon}
				title={
					<>
						Free LinkedIn <Accent>Photo Resizer</Accent> Tool
					</>
				}
				description="Optimize your LinkedIn images in seconds. Get the perfect dimensions for profile pictures, banner images, and post content to enhance your professional presence."
			>
				<ImageResizer platform="linkedin" />
			</ToolHero>
			<ToolPromo />
			<ToolGuide title="LinkedIn Image Size Guide" items={GUIDE} />
			<FaqSection title="LinkedIn Resizer FAQ" items={FAQ} />
		</>
	);
}
