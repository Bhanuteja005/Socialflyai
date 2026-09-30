import { Accessibility, Cpu, Download, Languages, Play, Sparkles, Upload, Zap } from "lucide-react";
import { SIGNUP_URL } from "@/components/marketing/app-links";
import { FeatureSplitSection } from "@/components/marketing/feature-split";
import { FeaturePlanSections } from "@/components/marketing/features-plan-sections";
import { pageMetadata } from "@/components/marketing/metadata";
import { MockupFrame } from "@/components/marketing/mockups";
import { PageHero } from "@/components/marketing/page-hero";
import { PlatformStrip } from "@/components/marketing/platform-strip";
import { Accent, SectionHeading } from "@/components/marketing/primitives";
import { StepsSection } from "@/components/marketing/steps-section";
import { faqs, plans, rows } from "./data";

export const metadata = pageMetadata({
	title: "AI Auto Caption Generator for Videos",
	description:
		"Generate accurate, perfectly timed video captions in seconds with AI. 100+ languages, custom branding and exports for Reels, TikTok, Shorts and 40+ platforms.",
	path: "/features/ai-caption-generator",
});

const ENGAGEMENT = [
	{
		icon: Zap,
		title: "90% Higher Engagement",
		description:
			"Videos with captions receive significantly more views and interaction than those without.",
	},
	{
		icon: Languages,
		title: "100+ Languages Supported",
		description:
			"Translate your captions into over 100 languages with a single click to reach a global audience.",
	},
	{
		icon: Accessibility,
		title: "Full Accessibility",
		description:
			"Make your content accessible to the hearing impaired and those who watch with sound off.",
	},
];

const CAPTION_PLATFORMS = [
	"YouTube",
	"Instagram",
	"TikTok",
	"Twitter/X",
	"Facebook",
	"LinkedIn",
	"Shorts",
	"Reels",
	"Snapchat",
	"40+ More",
];

export default function AICaptionGeneratorPage() {
	return (
		<>
			<PageHero
				badge={{ icon: Sparkles, label: "AI-Powered Content Creation" }}
				title={
					<>
						AI-Powered <Accent>Auto Caption</Accent> <br />
						Generator for Your Videos
					</>
				}
				description={
					<>
						Match the speed of your creativity with AI-generated captions in seconds. Scale your
						video presence on every platform with effortless precision.
						<span className="mt-4 block text-base text-muted-foreground">
							Trusted by <span className="font-medium text-foreground">25,000+ Creators</span>
						</span>
					</>
				}
				actions={[
					{ label: "Try for free", href: SIGNUP_URL },
					{ label: "Watch Demo", href: "/contact", variant: "secondary", icon: Play },
				]}
			>
				<MockupFrame>
					<div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl">
						<div className="flex size-16 items-center justify-center rounded-full border border-border-strong bg-surface-raised/90 sm:size-20">
							<Play className="ml-1 size-7 fill-current text-primary sm:size-8" />
						</div>
						<div className="absolute inset-x-4 bottom-4 flex flex-col items-center gap-2 sm:bottom-8">
							<p className="rounded-lg bg-surface-raised px-3 py-1.5 font-medium text-sm text-foreground sm:text-lg">
								"Artificial intelligence is fundamentally..."
							</p>
							<p className="rounded-lg bg-primary px-3 py-1.5 font-medium text-primary-foreground text-sm sm:text-lg">
								"...changing how we create."
							</p>
						</div>
					</div>
				</MockupFrame>
			</PageHero>

			<PlatformStrip />

			<FeatureSplitSection
				heading={
					<SectionHeading
						title={
							<>
								Captions That Boost <br />
								<Accent>Engagement & Accessibility</Accent>
							</>
						}
						description="Captions aren't just for accessibility—they're for engagement. 80% of social media users watch videos with the sound off. Don't let your message be missed."
						className="mb-16 lg:mb-20"
					/>
				}
				items={[
					{
						title: "AI-Powered Generation",
						description:
							"Our advanced neural networks transcribe your video with 99% accuracy in seconds.",
						bullets: [
							"Automatic silence detection",
							"Smart punctuation and capitalization",
							"Speaker identification",
							"Platform-specific formatting",
						],
						visual: (
							<ul className="space-y-4">
								{ENGAGEMENT.map(({ icon: Icon, title, description }) => (
									<li
										key={title}
										className="flex items-start gap-4 rounded-2xl border border-border bg-surface-raised p-6"
									>
										<span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-muted text-foreground">
											<Icon className="size-6" aria-hidden="true" />
										</span>
										<div>
											<p className="font-medium text-lg text-foreground">{title}</p>
											<p className="mt-1 text-muted-foreground">{description}</p>
										</div>
									</li>
								))}
							</ul>
						),
					},
					{
						title: (
							<>
								Use in Across <Accent>40 Major Platforms</Accent>
							</>
						),
						description:
							"Generating captions is just the beginning. Our platform optimizes your content for every major social network, ensuring your videos look perfect wherever they're shared.",
						chips: CAPTION_PLATFORMS.map((label) => ({ label })),
					},
				]}
			/>

			<StepsSection
				title="How Auto Caption Generator Works"
				description="Get your videos ready for the world with just three simple steps."
				steps={[
					{
						icon: Upload,
						title: "Upload Your Content",
						description:
							"Provide the link or upload your video from your device to start the process.",
					},
					{
						icon: Cpu,
						title: "AI Analysis",
						description:
							"The AI analysis handles the rest—identifying speaker, transcribing voice, and generating captions.",
					},
					{
						icon: Download,
						title: "Ready to Download",
						description:
							"Preview your ready-to-download captioned video and export it in any format or directly share.",
					},
				]}
			/>

			<FeaturePlanSections
				comparisonLabel="Plan Features"
				pricingDescription="Choose the plan that's right for your content goals. No hidden fees, upgrade anytime."
				plans={plans}
				rows={rows}
				faqDescription="Everything you need to know about our AI-powered captioning service."
				faqs={faqs}
			/>
		</>
	);
}
