import { ChartColumn, CirclePlay, Globe, Heart, MessageSquare, Users, Zap } from "lucide-react";
import {
	ProgressPanel,
	SolutionPage,
	type SolutionPageData,
} from "@/components/marketing/company-solution-page";
import { pageMetadata } from "@/components/marketing/metadata";
import { ChatMockup, MockupFrame } from "@/components/marketing/mockups";
import { Accent } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "Social Media Management for Non-Profits",
	description:
		"Social intelligence for social good. SocialflyAI helps non-profits scale awareness, engage donors and coordinate volunteers with AI-powered efficiency and impact pricing.",
	path: "/solutions/non-profits",
});

const data: SolutionPageData = {
	hero: {
		badge: { icon: Heart, label: "Dedicated Support for Non-Profit Organizations" },
		title: (
			<>
				Social Intelligence <br />
				for <Accent>Social Good.</Accent>
			</>
		),
		description:
			"Amplify your mission. SocialflyAI helps non-profits scale awareness, engage donors, and coordinate volunteers with AI-powered efficiency and special impact pricing.",
		actions: [
			{ label: "Apply for Impact Pricing", href: "/contact" },
			{
				label: "Watch Impact Story",
				href: "/testimonials",
				variant: "secondary",
				icon: CirclePlay,
			},
		],
		metrics: [
			{ label: "Awareness Lift", value: "420%", note: "Mission Reach", icon: Globe },
			{ label: "Volunteer Signups", value: "+2.4K", note: "Community Action", icon: Users },
		],
	},
	features: [
		{
			title: (
				<>
					Mission-Driven <br />
					<Accent>Content Scaling.</Accent>
				</>
			),
			description:
				"Tell your story at scale. SocialflyAI generates awareness-focused captions and reels that highlight your organizations impact, making it easier than ever to keep your supporters informed and inspired.",
			bullets: [
				"Impact-focused storytelling AI",
				"Campaign-specific hashtag clusters",
				"Unified multi-platform scheduling",
				"Automated donation link management",
			],
			visual: (
				<ProgressPanel
					icon={Heart}
					title="Impact Campaign: Active"
					percent={75}
					caption="Awareness Goal: 75% Reached"
				/>
			),
		},
		{
			title: (
				<>
					Automated Donor <br />
					<Accent>&amp; Volunteer Interaction.</Accent>
				</>
			),
			description:
				"Engagement shouldn't stop when your team is off. AI-Reply handles common questions about donation links, volunteer events, and mission updates, ensuring every supporter feels valued.",
			chips: [
				{ icon: Users, label: "Supporter Engagement" },
				{ icon: Globe, label: "Global Reach" },
			],
			visual: (
				<MockupFrame title="Impact Assistant" icon={MessageSquare}>
					<ChatMockup
						messages={[
							{ author: "Supporter Comment", text: "How can I volunteer this weekend?" },
							{
								author: "Impact Assistant",
								text: "Thank you! Sign-up details are in our pinned post.",
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
					Impact Reporting. <br />
					<Accent>Simplified.</Accent>
				</>
			),
			description:
				"Get the data your board actually needs. Track how social awareness correlates with donation spikes and community growth with easy-to-export impact reports.",
			stats: [
				{ label: "New Donors", value: "+142", icon: ChartColumn },
				{ label: "Awareness Delta", value: "+210%", icon: Globe },
				{ label: "Supporters", value: "Looped", icon: Heart },
				{ label: "Time Saved", value: "20h", icon: Zap },
			],
		},
	],
	pricing: {
		title: (
			<>
				Invest in <Accent>Mission,</Accent> Not Just Tools
			</>
		),
		description: "Non-profit special pricing. Help us amplify your world-changing work.",
		plans: [
			{
				name: "Community",
				price: "$0",
				description: "Empower your mission for free forever.",
				features: [
					"3 Platforms Managed",
					"Impact Caption AI",
					"Event Scheduling",
					"Standard Stats",
					"Single User",
					"Non-profit Impact Support",
				],
				cta: "Start for free",
			},
			{
				name: "Impact",
				price: "$49",
				description: "Best for regional organizations and awareness campaigns.",
				features: [
					"Unlimited Platforms",
					"Advanced Donor Interaction",
					"Infinite History Lookback",
					"Board-Ready Performance PDF",
					"Priority Mission Support",
					"Video Analytics Suite",
					"No SocialflyAI Branding",
				],
				cta: "Get Impact Access",
				highlight: true,
			},
			{
				name: "Global Impact",
				price: "$99",
				description: "For international non-profits scaling global outreach.",
				features: [
					"Everything in Impact",
					"Custom Brand Voice AI",
					"Audit Logs & Safety Controls",
					"Strategic Mission Manager",
					"Custom API Development",
					"Multi-user Team Roles",
				],
				cta: "Contact Sales",
			},
		],
	},
	cta: {
		title: (
			<>
				Amplify Your <Accent>Mission.</Accent>
			</>
		),
		description: "Spend less time posting and more time on the work that matters.",
		ctaLabel: "Start for free",
	},
};

export default function NonProfitsSolutionPage() {
	return <SolutionPage data={data} />;
}
