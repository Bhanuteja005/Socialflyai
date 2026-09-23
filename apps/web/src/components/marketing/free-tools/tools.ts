import {
	Download,
	FileText,
	Hash,
	Image as ImageIcon,
	Link as LinkIcon,
	type LucideIcon,
	MessageSquare,
	SquarePlay,
	Tag,
	Type,
} from "lucide-react";

export type FreeToolStatus = "live" | "coming-soon";

export type FreeTool = {
	slug: string;
	title: string;
	description: string;
	status: FreeToolStatus;
	icon: LucideIcon;
};

/** Every free tool. `status` drives the index badge; the sitemap lists all of them. */
export const FREE_TOOLS: FreeTool[] = [
	{
		slug: "utm-generator",
		title: "UTM Generator",
		description: "Create UTM campaign URLs with standardized tracking params.",
		status: "live",
		icon: LinkIcon,
	},
	{
		slug: "twitter-thread-maker",
		title: "Twitter Thread Maker",
		description: "Split long-form writing into a perfectly sized, numbered X/Twitter thread.",
		status: "live",
		icon: MessageSquare,
	},
	{
		slug: "linkedin-bold-italic-text-generator",
		title: "LinkedIn Bold and Italic Text Generator",
		description: "Convert plain text into unicode bold and italic variants.",
		status: "live",
		icon: Type,
	},
	{
		slug: "twitter-photo-resizer",
		title: "Twitter Photo Resizer",
		description: "Resize images to Twitter/X recommended dimensions, right in your browser.",
		status: "live",
		icon: ImageIcon,
	},
	{
		slug: "linkedin-photo-resizer",
		title: "LinkedIn Photo Resizer",
		description: "Resize images to LinkedIn recommended dimensions, right in your browser.",
		status: "live",
		icon: ImageIcon,
	},
	{
		slug: "pinterest-photo-resizer",
		title: "Pinterest Photo Resizer",
		description: "Resize images to Pinterest recommended dimensions, right in your browser.",
		status: "live",
		icon: ImageIcon,
	},
	{
		slug: "hashtag-generator",
		title: "Hashtag Generator",
		description: "Generate platform-specific hashtags using AI.",
		status: "coming-soon",
		icon: Hash,
	},
	{
		slug: "youtube-tags-generator",
		title: "YouTube Tags Generator",
		description: "Generate SEO-friendly tags for a YouTube topic or title.",
		status: "coming-soon",
		icon: Tag,
	},
	{
		slug: "youtube-ai-description-generator",
		title: "YouTube AI Description Generator",
		description: "Generate long-form YouTube description copy using AI.",
		status: "coming-soon",
		icon: FileText,
	},
	{
		slug: "youtube-video-downloader",
		title: "YouTube Video Downloader",
		description: "Download YouTube videos in high-quality MP4/MP3 formats.",
		status: "coming-soon",
		icon: SquarePlay,
	},
	{
		slug: "photo-video-downloader",
		title: "Photo and Video Downloader",
		description: "Save photos and videos from public social media posts in original quality.",
		status: "coming-soon",
		icon: Download,
	},
];

export function getFreeTool(slug: string): FreeTool {
	const tool = FREE_TOOLS.find((item) => item.slug === slug);
	if (!tool) throw new Error(`Unknown free tool: ${slug}`);
	return tool;
}
