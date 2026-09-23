import { Bot, Brain, Clock, Globe, MessageSquare, Moon, Zap } from "lucide-react";
import { FeatureSplitSection } from "@/components/marketing/feature-split";
import { FeaturePlanSections } from "@/components/marketing/features-plan-sections";
import { pageMetadata } from "@/components/marketing/metadata";
import { ChatMockup, MockupFrame } from "@/components/marketing/mockups";
import { PageHero } from "@/components/marketing/page-hero";
import { PlatformStrip } from "@/components/marketing/platform-strip";
import { Accent, Container, SectionHeading } from "@/components/marketing/primitives";
import { faqs, plans, rows } from "./data";

export const metadata = pageMetadata({
	title: "AI Auto-Reply for Comments and DMs",
	description:
		"Respond to every comment and DM with human-like AI replies, 24/7. Brand-voice aligned, multilingual and sentiment-aware across all your social networks.",
	path: "/features/ai-reply",
});

const CORE_FEATURES = [
	{
		icon: Zap,
		title: "1s Response Time",
		description:
			"Our AI generates high-quality replies instantly, ensuring your audience never has to wait.",
	},
	{
		icon: Globe,
		title: "Multilingual AI",
		description: "Reply perfectly in over 100 languages with native-level grammatical precision.",
	},
	{
		icon: Bot,
		title: "Sentiment Tracking",
		description:
			"AI identifies the emotion behind every message to tailor the perfect tonal response.",
	},
	{
		icon: Brain,
		title: "Brand Voice Alignment",
		description: "Fine-tune the AI to sound exactly like your brand—corporate, witty, or friendly.",
	},
];

export default function AIReplyFeaturePage() {
	return (
		<>
			<PageHero
				badge={{ icon: Zap, label: "24/7 Smart Engagement" }}
				title={
					<>
						AI-Powered <Accent>Auto-Replies</Accent> <br />
						That Never Sleep
					</>
				}
				description="Respond to every comment and DM with human-like precision. Scale your social presence without hiring a support team."
				actions={[
					{ label: "Get started for free", href: "/signup" },
					{ label: "See how it works", href: "/contact", variant: "secondary", icon: Clock },
				]}
			>
				<MockupFrame
					title="Instagram Comment • 2s ago"
					icon={MessageSquare}
					aside={
						<span className="hidden font-bold text-[10px] text-primary uppercase tracking-widest sm:inline">
							AI Active · 1.2s React Time · 100+ Languages
						</span>
					}
				>
					<ChatMockup
						messages={[
							{ author: "@kushal", text: "Does this work with Instagram Reels comments too?" },
							{
								author: "AI Suggested Reply",
								text: "Yes, Kushal! SocialflyAI supports all Instagram formats including Reels, Stories, and Grid posts. Want to see a demo?",
								ai: true,
							},
						]}
					/>
				</MockupFrame>
			</PageHero>

			<PlatformStrip label="Seamless AI Replies for every social network" />

			<section className="pt-20 sm:pt-28">
				<Container>
					<SectionHeading
						title={
							<>
								Respond Instantly With <br />
								<Accent>AI Precision.</Accent>
							</>
						}
						description="AI Reply isn't just a chatbot—it's a sophisticated interaction engine that understands the nuance of social media dialogue."
						className="mb-16"
					/>
					<div className="grid items-center gap-10 lg:grid-cols-2">
						<ul className="grid gap-4 sm:grid-cols-2">
							{CORE_FEATURES.map(({ icon: Icon, title, description }) => (
								<li key={title} className="rounded-2xl border border-white/10 bg-white/5 p-6">
									<span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
										<Icon className="size-6" aria-hidden="true" />
									</span>
									<h3 className="font-bold text-lg text-white">{title}</h3>
									<p className="mt-2 text-sm text-white/60">{description}</p>
								</li>
							))}
						</ul>
						<MockupFrame title="Automation Engine" icon={Bot}>
							<p className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
								Analysis: Positive sentiment detected. Query about pricing.
							</p>
							<p className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-primary text-sm">
								"Reply generated with 1.2s latent response time."
							</p>
						</MockupFrame>
					</div>
				</Container>
			</section>

			<FeatureSplitSection
				items={[
					{
						title: "Contextual AI Replies",
						description:
							"Our AI doesn't just scan for keywords. It understands the full conversation history, user sentiment, and platform-specific etiquette to deliver replies that feel authentically human.",
						bullets: [
							"Sentiment-aware response selection",
							"Internal knowledge base integration",
							"Dynamic GIF and emoji placement",
							"Automated thread summarization",
						],
						visual: (
							<MockupFrame title="AI Draft · High confidence" icon={MessageSquare}>
								<ChatMockup
									messages={[
										{
											author: "Customer Message",
											text: "Hey, I love the tool! Is there any way to get a yearly discount?",
										},
										{
											author: "AI Draft",
											text: "Hi! We're so glad you're enjoying SocialflyAI! Yes, we offer a 20% discount on yearly plans. You can upgrade in your dashboard. ✨",
											ai: true,
										},
									]}
								/>
							</MockupFrame>
						),
					},
					{
						title: (
							<>
								Never <Accent>Sleep.</Accent>
							</>
						),
						description:
							"Engagement happens 24/7. While you're offline, our AI remains active, moderating spam, answering common FAQs, and keeping your community vibrant across all time zones.",
						chips: [
							{ icon: Moon, label: "Nighttime Auto-Pilot" },
							{ icon: Bot, label: "24/7 Lead Detection" },
						],
						stats: [
							{ label: "Uptime · Always online", value: "99.99%" },
							{ label: "Support · No delay", value: "24/7" },
							{ label: "Lead Capture · Sync to CRM", value: "Instant" },
							{ label: "Accuracy · Human quality", value: "98%" },
						],
					},
				]}
			/>

			<FeaturePlanSections
				comparisonLabel="AI Reply Features"
				pricingDescription="Scale your engagement without sacrificing the human feel. Choose the plan that's right for your volume."
				plans={plans}
				rows={rows}
				faqDescription="Everything you need to know about SocialflyAI auto-replies."
				faqs={faqs}
			/>
		</>
	);
}
