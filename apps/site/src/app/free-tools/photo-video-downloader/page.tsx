import {
	CircleCheck,
	Download,
	Globe,
	Image as ImageIcon,
	ShieldCheck,
	Smartphone,
	Zap,
} from "lucide-react";
import { FaqSection } from "@/components/marketing/faq-section";
import { ComingSoonPanel } from "@/components/marketing/free-tools/coming-soon-panel";
import { ToolHero, ToolPromo } from "@/components/marketing/free-tools/tool-page-shell";
import { ToolFeatureGrid, ToolProse } from "@/components/marketing/free-tools/tool-sections";
import { pageMetadata } from "@/components/marketing/metadata";
import { Accent } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "Free Social Media Photo & Video Downloader",
	description:
		"Download photos and videos from Instagram, TikTok, Facebook, Twitter, and more in original quality for free.",
	path: "/free-tools/photo-video-downloader",
	keywords: ["social media downloader", "instagram video downloader", "tiktok downloader"],
});

const PLATFORM_GROUPS = [
	{
		title: "Social Media",
		items: ["Instagram Reels", "Facebook Videos", "TikTok (No Watermark)", "Twitter / X Media"],
	},
	{
		title: "Professional Networks",
		items: ["LinkedIn Clips", "Pinterest Pins", "Twitch Highlights", "Reddit Media"],
	},
	{
		title: "Video Platforms",
		items: ["YouTube Shorts", "Vimeo Playback", "DailyMotion", "Personal Clouds"],
	},
];

const CHARACTERISTICS = [
	{
		icon: Zap,
		title: "Fastest Speed",
		description: "Powered by advanced cloud acceleration technology for instant downloads.",
	},
	{
		icon: ImageIcon,
		title: "High-Quality Clips",
		description: "Supports 4K, 1080p, and high-bitrate audio extraction in MP4/MP3.",
	},
	{
		icon: ShieldCheck,
		title: "High-level Security",
		description: "SSL encrypted connections and end-to-end privacy for every save.",
	},
	{
		icon: CircleCheck,
		title: "Reliable & Stable",
		description: "99.9% uptime with servers distributed across the globe.",
	},
	{
		icon: Smartphone,
		title: "User-Friendly",
		description: "Simple one-click interface designed for everyone from creators to brands.",
	},
	{
		icon: Globe,
		title: "Great Compatibility",
		description: "Works on iOS, Android, macOS, and Windows without any software.",
	},
];

const FAQ = [
	{
		question: "Is it legal to download social media videos?",
		answer:
			"Downloading content for personal use is generally acceptable, but you should always respect the creator's copyright and not re-upload content without permission.",
	},
	{
		question: "Do I need to pay for 4K downloads?",
		answer:
			"No. SocialflyAI provides high-resolution downloads for free. We don't charge extra for higher quality tiers.",
	},
	{
		question: "Can I download from private profiles?",
		answer: "For security reasons, our tool only works on publicly available profiles and videos.",
	},
	{
		question: "What formats are supported?",
		answer:
			"We primarily support MP4 for video and JPG/PNG for images. Audio can be extracted as MP3 at 320kbps.",
	},
	{
		question: "How to download TikTok without watermark?",
		answer:
			"Simply paste the TikTok URL into our downloader, and our engine automatically strips the watermark for a clean save.",
	},
];

export default function PhotoVideoDownloaderPage() {
	return (
		<>
			<ToolHero
				badge="Media downloader"
				badgeIcon={Download}
				title={
					<>
						Social Media <Accent>Photo &amp; Video</Accent> Downloader
					</>
				}
				description="Download photos and videos from Instagram, TikTok, Facebook, Twitter, and more in original quality for free."
			>
				<ComingSoonPanel icon={Download} toolName="Photo & Video Downloader" />
			</ToolHero>
			<ToolPromo />
			<ToolProse title="Best Free Social Media Downloader Tool 2026">
				<p>
					SocialflyAI&apos;s Photo and Video Downloader is the ultimate solution for capturing
					high-quality content from your favorite social media platforms. Whether you need to save
					an inspiring Instagram post, a viral TikTok video, or a professional LinkedIn clip, our
					tool handles it all with zero loss in resolution.
				</p>
				<p>
					We&apos;ve optimized our engine to bypass high-traffic bandwidth caps, ensuring that your
					downloads are instant and secure. No account registration or browser extensions
					required—just paste and save.
				</p>
				<h3>All applications it works with</h3>
				<div className="grid gap-6 sm:grid-cols-3">
					{PLATFORM_GROUPS.map((group) => (
						<div key={group.title}>
							<h4 className="mb-3 font-medium text-brand-text text-sm font-mono">{group.title}</h4>
							<ul className="space-y-2">
								{group.items.map((item) => (
									<li key={item} className="flex items-center gap-2 text-muted-foreground">
										<CircleCheck className="size-4 shrink-0 text-brand-text" aria-hidden="true" />
										{item}
									</li>
								))}
							</ul>
						</div>
					))}
				</div>
			</ToolProse>
			<ToolFeatureGrid title="Why Creators Choose Our Downloader" items={CHARACTERISTICS} />
			<FaqSection title="Universal Downloader FAQ" items={FAQ} />
		</>
	);
}
