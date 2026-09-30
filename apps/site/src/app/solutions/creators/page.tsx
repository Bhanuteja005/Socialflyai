import { ChartColumn, MessageSquare, Repeat, Sparkles, TrendingUp, Users, Zap } from "lucide-react";
import { SIGNUP_URL } from "@/components/marketing/app-links";
import { SolutionPage, type SolutionPageData } from "@/components/marketing/company-solution-page";
import { pageMetadata } from "@/components/marketing/metadata";
import { ChatMockup, MockupFrame } from "@/components/marketing/mockups";
import { Accent } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "Social Media Tools for Content Creators",
	description:
		"Focus on the content, we'll handle the viral growth. SocialflyAI automates scheduling, audience interaction and caption optimization for modern creators.",
	path: "/solutions/creators",
});

const data: SolutionPageData = {
	hero: {
		badge: { icon: Sparkles, label: "Built for Modern Content Creators" },
		title: (
			<>
				Focus on the <Accent>Content,</Accent> <br />
				We&apos;ll Handle the Viral Growth
			</>
		),
		description:
			"Take the tediousness out of social media. SocialflyAI automates your scheduling, interaction, and content optimization so you can stay in the creative zone longer.",
		actions: [
			{ label: "Start growing for free", href: SIGNUP_URL },
			{ label: "Upgrade to Pro", href: SIGNUP_URL, variant: "secondary", icon: Zap },
		],
		metrics: [
			{ label: "Engagement Hub", value: "+124%", note: "Viral Potential", icon: TrendingUp },
			{ label: "Auto-Scheduling", value: "24/7", note: "Active Presence", icon: Zap },
			{ label: "AI Brand Voice", value: "Locked", note: "Consistent Tone", icon: Sparkles },
		],
	},
	features: [
		{
			title: (
				<>
					Viral Hook &amp; <br />
					<Accent>Caption Generation.</Accent>
				</>
			),
			description:
				"Stop staring at a blank screen. Our AI analyzes millions of viral data points to write captions that stop the scroll and maximize your reach across TikTok, Instagram, and Twitter.",
			bullets: [
				"Algorithm-optimized hooks",
				"Dynamic hashtag clustering",
				"Cross-platform tone adaptation",
				"Multi-platform thread generation",
			],
			visual: (
				<MockupFrame title="AI hook suggestion" icon={Sparkles}>
					<p className="rounded-xl border border-border-strong bg-surface p-4 font-medium text-sm text-foreground italic">
						&ldquo;Stop making this 1 massive mistake with your content strategy...&rdquo;
					</p>
				</MockupFrame>
			),
		},
		{
			title: (
				<>
					Automated <br />
					<Accent>Follower Engagement.</Accent>
				</>
			),
			description:
				"Don't let your community go stale. AI-Reply automatically handles common questions and comments in your brand voice, keeping your engagement high while you sleep.",
			chips: [
				{ icon: MessageSquare, label: "Smart Interaction" },
				{ icon: Users, label: "Community Growth" },
			],
			visual: (
				<MockupFrame title="AI Reply" icon={MessageSquare}>
					<ChatMockup
						messages={[
							{ author: "Follower", text: "Where did you film this?" },
							{
								author: "AI Reply",
								text: "Thanks for asking! Full details are in my bio.",
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
					Unified <br />
					<Accent>Performance Mastery.</Accent>
				</>
			),
			description:
				"SocialflyAI's unified dashboard doesn't just manage posts—it manages your career. Track viral loops, identify your top traffic sources, and know exactly which platform to prioritize.",
			stats: [
				{ label: "Viral Index", value: "94.2", icon: ChartColumn },
				{ label: "Reach Delta", value: "+140%", icon: TrendingUp },
				{ label: "Audience Loyalty", value: "88%", icon: Repeat },
				{ label: "Growth Path", value: "Exponential", icon: Zap },
			],
		},
	],
	pricing: {
		title: (
			<>
				Invest in <Accent>Growth,</Accent> Not Just Tools
			</>
		),
		description: "Choose the plan that fits your current volume and future goals.",
		plans: [
			{
				name: "Starter",
				price: "$0",
				description: "Launch your personal brand for free.",
				features: [
					"3 Platforms Managed",
					"Basic AI Captions",
					"Manual Scheduling",
					"Standard Analytics",
					"Single User",
					"Email Support",
				],
				cta: "Start for free",
			},
			{
				name: "Pro",
				price: "$49",
				description: "Best for serious creators and community builders.",
				features: [
					"Unlimited Platforms",
					"Viral Hook Generator",
					"AI Engagement Auto-Reply",
					"Advanced Viral Insights",
					"Video Downloader Access",
					"Priority Support",
					"No SocialflyAI Branding",
				],
				cta: "Get Pro Access",
				highlight: true,
			},
			{
				name: "Elite",
				price: "$99",
				description: "For creators scaling a multi-platform media empire.",
				features: [
					"Everything in Pro",
					"Custom Brand Voice AI",
					"24/7 Priority Concierge",
					"Exclusive Growth Audits",
					"Monthly Strategy Call",
				],
				cta: "Contact Sales",
			},
		],
	},
	cta: {
		title: (
			<>
				Stay in the <Accent>Creative Zone.</Accent>
			</>
		),
		description: "Let SocialflyAI handle the scheduling, replies and reporting.",
		ctaLabel: "Start growing for free",
	},
};

export default function CreatorsSolutionPage() {
	return <SolutionPage data={data} />;
}
