import { CircleCheck, FilePlay, ShieldCheck, SquarePlay, Star, Zap } from "lucide-react";
import { CtaSection } from "@/components/marketing/cta-section";
import { FaqSection } from "@/components/marketing/faq-section";
import { ComingSoonPanel } from "@/components/marketing/free-tools/coming-soon-panel";
import { ToolHero, ToolPromo } from "@/components/marketing/free-tools/tool-page-shell";
import { ToolFeatureGrid, ToolProse } from "@/components/marketing/free-tools/tool-sections";
import { pageMetadata } from "@/components/marketing/metadata";
import { Accent } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "Free YouTube Video Downloader",
	description:
		"Download YouTube videos for free in 1080p, 4K, 8K & high-quality MP4/MP3 format with high-speed downloads using the SocialflyAI tool.",
	path: "/free-tools/youtube-video-downloader",
	keywords: [
		"youtube video downloader",
		"youtube to mp4",
		"youtube to mp3",
		"download youtube shorts",
	],
});

const FEATURES = [
	{
		icon: Zap,
		title: "Fast Downloads",
		description: "Experience lightning-fast download speeds without any caps.",
	},
	{
		icon: FilePlay,
		title: "High Quality",
		description: "Download in 4K, 1080p, and high-bitrate MP3 formats.",
	},
	{
		icon: ShieldCheck,
		title: "No Registration",
		description: "Use all features without creating an account or signing in.",
	},
	{
		icon: CircleCheck,
		title: "Wait-Free",
		description: "Start your downloads instantly without annoying timers.",
	},
	{
		icon: ShieldCheck,
		title: "Total Privacy",
		description: "We don't log your downloads or store your data.",
	},
	{
		icon: Star,
		title: "Free Forever",
		description: "No hidden fees, subscriptions, or credit card required.",
	},
];

const FORMATS = [
	{ type: "Video Formats", items: "MP4, WebM, MKV, AVI" },
	{ type: "Audio Formats", items: "MP3, M4A, WAV, AAC" },
	{ type: "Quality Options", items: "8K, 4K, 1080p, 720p, 480p" },
	{ type: "Audio Quality", items: "320kbps, 256kbps, 128kbps" },
];

const FAQ = [
	{
		question: "Is the YouTube Video Downloader free?",
		answer:
			"Yes, our tool is 100% free with no hidden charges. You can download as many videos as you want without paying a penny.",
	},
	{
		question: "What is the best YouTube video downloader?",
		answer:
			"SocialflyAI's downloader is among the fastest and most secure, offering high-resolution downloads including 4K and 8K, along with a simple, ad-free experience.",
	},
	{
		question: "Where do my downloaded videos go?",
		answer:
			'By default, videos are saved in your device\'s "Downloads" folder. You can change this in your browser settings.',
	},
	{
		question: "How can I download YouTube videos on my PC?",
		answer:
			'Simply copy the video URL from YouTube, paste it into our tool\'s input box, click "Download", and select your preferred quality to save it to your PC.',
	},
	{
		question: "Can I download YouTube videos in 4K quality?",
		answer:
			"Yes, our tool supports 4K and even 8K downloads if the original video was uploaded in those resolutions.",
	},
	{
		question: "How to download YouTube Shorts?",
		answer:
			"The process is exactly the same! Just copy the Shorts URL and paste it into our downloader to save it as a high-quality video file.",
	},
];

export default function YouTubeVideoDownloaderPage() {
	return (
		<>
			<ToolHero
				badge="Video downloader"
				badgeIcon={SquarePlay}
				title={
					<>
						YouTube <Accent>Video Downloader</Accent>
					</>
				}
				description="Download YouTube videos for free in 1080p, 4K, 8K & high-quality MP4/MP3 format with high-speed download using our SocialflyAI tool."
			>
				<ComingSoonPanel icon={SquarePlay} toolName="YouTube Video Downloader" />
			</ToolHero>
			<ToolPromo />
			<ToolFeatureGrid
				title="Free YouTube Video & Audio Downloader Tool 2026"
				description="Our YouTube video downloader lets you download any YouTube video in high quality for free. No registration or software installation required. Simply paste the URL and download."
				items={FEATURES}
			/>
			<ToolProse title="Supported File Formats">
				<dl className="grid gap-4 sm:grid-cols-2">
					{FORMATS.map((row) => (
						<div key={row.type} className="rounded-2xl border border-border bg-surface-raised p-5">
							<dt className="font-medium text-subtle-foreground text-xs font-mono">{row.type}</dt>
							<dd className="mt-2 font-medium text-foreground">{row.items}</dd>
						</div>
					))}
				</dl>
				<h3>Privacy &amp; Security</h3>
				<p>
					SocialflyAI prioritizes your security. Our YouTube downloader operates directly in the
					cloud, ensuring no malware or unwanted software touches your device.
				</p>
				<ul className="space-y-3">
					{["SSL Encrypted Connection", "No Personal Data Required", "Automatic File Cleanup"].map(
						(item) => (
							<li key={item} className="flex items-center gap-3">
								<CircleCheck className="size-5 shrink-0 text-brand-text" aria-hidden="true" />
								{item}
							</li>
						),
					)}
				</ul>
			</ToolProse>
			<FaqSection items={FAQ} />
			<CtaSection
				title="Take Your Content Further"
				description="Once you've downloaded your videos, use SocialflyAI's full suite to schedule, analyze, and grow your presence across all social platforms."
				ctaLabel="Sign Up For Free Now"
			/>
		</>
	);
}
