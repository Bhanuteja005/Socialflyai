import { ImageIcon } from "lucide-react";
import { ImageResizer } from "@/components/marketing/free-tools/image-resizer";
import { ToolHero, ToolPromo } from "@/components/marketing/free-tools/tool-page-shell";
import { ToolGuide } from "@/components/marketing/free-tools/tool-sections";
import { pageMetadata } from "@/components/marketing/metadata";
import { Accent } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "Free Twitter Photo Resizer",
	description:
		"Resize images for Twitter (X) in seconds: profile pictures (400×400), headers (1500×500), tweet images (1200×628) and Twitter cards (800×418). Free and private — runs in your browser.",
	path: "/free-tools/twitter-photo-resizer",
	keywords: ["twitter image resizer", "twitter header size", "x photo resizer", "tweet image size"],
});

const GUIDE = [
	{
		title: "Profile Picture",
		description:
			"Your Twitter profile picture appears in your profile and next to all your tweets. The recommended size is 400 × 400 pixels with a 1:1 aspect ratio. Twitter displays your profile picture as a circle, so make sure important elements are centered.",
	},
	{
		title: "Header Image",
		description:
			"The Twitter header (or cover) image sits at the top of your profile page. The recommended size is 1500 × 500 pixels with a 3:1 aspect ratio. Keep important content in the center as the edges may be cropped on different devices.",
	},
	{
		title: "Tweet Image",
		description:
			"Images shared in tweets should be 1200 × 628 pixels with a 1.91:1 aspect ratio for optimal display in timelines. Twitter will automatically crop images that don't match this ratio, which could affect how your content is viewed.",
	},
	{
		title: "Twitter Card",
		description:
			"Twitter Cards are generated when you share links with featured images. The recommended size is 800 × 418 pixels with a 1.91:1 aspect ratio. These cards help your content stand out in the timeline and drive more engagement.",
	},
];

export default function TwitterPhotoResizerPage() {
	return (
		<>
			<ToolHero
				badge="Image resizer"
				badgeIcon={ImageIcon}
				title={
					<>
						Free <Accent>Twitter Photo Resizer</Accent> Tool
					</>
				}
				description="Optimize your Twitter images in seconds. Get the perfect dimensions for profile pictures, headers, tweets, and Twitter cards."
			>
				<ImageResizer platform="twitter" />
			</ToolHero>
			<ToolPromo />
			<ToolGuide title="Twitter Image Size Guide" items={GUIDE} />
		</>
	);
}
