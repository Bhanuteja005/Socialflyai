import {
	Building,
	Calendar,
	ChartColumn,
	Clock,
	MapPin,
	MessageSquare,
	Target,
	Zap,
} from "lucide-react";
import {
	SolutionPage,
	type SolutionPageData,
	TagPanel,
} from "@/components/marketing/company-solution-page";
import { pageMetadata } from "@/components/marketing/metadata";
import { ChatMockup, MockupFrame } from "@/components/marketing/mockups";
import { Accent } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "Social Media Management for Small Businesses",
	description:
		"Social media that drives real local business. SocialflyAI automates local visibility, customer interaction and consistent posting so you can focus on running your business.",
	path: "/solutions/smb",
});

const data: SolutionPageData = {
	hero: {
		badge: { icon: Building, label: "Complete Social Strategy for Small Businesses" },
		title: (
			<>
				Social Media That <br />
				Drives <Accent>Real Local Business</Accent>
			</>
		),
		description:
			"Don't let your social profiles go silent. SocialflyAI automates your local visibility, customer interaction, and consistent posting—so you can focus on running your business.",
		actions: [
			{ label: "Start for free", href: "/signup" },
			{ label: "Book a Demo", href: "/contact", variant: "secondary", icon: Target },
		],
		metrics: [
			{ label: "Local Reach", value: "850%", note: "Visibility Lift", icon: Target },
			{ label: "Weekly Hours Saved", value: "12 Hours", note: "Automation ROI", icon: Zap },
		],
	},
	features: [
		{
			title: (
				<>
					Set-and-Forget <br />
					<Accent>Weekly Content.</Accent>
				</>
			),
			description:
				"Running a business is a full-time job. SocialflyAI generates 2 weeks of content in 10 minutes, including tailored local tags, so you stay consistent without breaking your schedule.",
			bullets: [
				"Auto-generated industry captions",
				"Local-first hashtag clusters",
				"One-click multi-platform posting",
				"Visual brand voice alignment",
			],
			visual: (
				<TagPanel
					icon={Calendar}
					title="Next Post: Tomorrow, 9:00 AM"
					tags={["#LocalSmallBiz", "#SupportLocal", "#Consistency"]}
				/>
			),
		},
		{
			title: (
				<>
					Instant Customer <br />
					<Accent>Interaction.</Accent>
				</>
			),
			description:
				"Never miss a lead. Our AI handles FAQs in your comments and DMs instantly, guiding customers to your shop, website, or booking link while you work.",
			chips: [
				{ icon: MessageSquare, label: "Auto-Reply Support" },
				{ icon: MapPin, label: "Local Lead Capture" },
			],
			visual: (
				<MockupFrame title="AI Assistant" icon={MessageSquare}>
					<ChatMockup
						messages={[
							{ author: "Customer Inquiry", text: "Are you open on Sundays?" },
							{
								author: "AI Assistant",
								text: "Yes! You can book a slot via the link in our bio.",
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
					Simplified Results. <br />
					<Accent>No Data Bloat.</Accent>
				</>
			),
			description:
				"Get the stats that actually help you sell. Our simplified reports show you exactly what content is driving store visits and new customer inquiries.",
			stats: [
				{ label: "New Leads", value: "+42", icon: ChartColumn },
				{ label: "Reach Delta", value: "+310%", icon: MapPin },
				{ label: "Interaction", value: "High", icon: MessageSquare },
				{ label: "Time Saved", value: "12h", icon: Clock },
			],
		},
	],
	pricing: {
		title: (
			<>
				Invest in <Accent>Growth,</Accent> Not Just Tools
			</>
		),
		description:
			"Every viral post starts with a single high-quality measurement. Choose the plan that's right for your volume.",
		plans: [
			{
				name: "Local",
				price: "$29",
				description: "Perfect for single-location shops and services.",
				features: [
					"3 Platforms Managed",
					"Local Hashtag Optimization",
					"Automated Weekly Scheduling",
					"Basic Heatmap Analytics",
					"Email Support",
					"Single User",
				],
				cta: "Start for free",
			},
			{
				name: "Growth",
				price: "$79",
				description: "Best for growing businesses with multiple locations.",
				features: [
					"Unlimited Platforms",
					"Advanced Local SEO Tags",
					"AI Interaction Suite",
					"ROI Performance Reports",
					"Priority Support",
					"Multi-user Access",
					"No SocialflyAI Branding",
				],
				cta: "Get Growth Access",
				highlight: true,
			},
			{
				name: "Enterprise",
				price: "$199",
				description: "For established brands scaling their local impact.",
				features: [
					"Everything in Growth",
					"Custom Brand Voice AI",
					"Bulk Posting Clusters",
					"Dedicated Success Manager",
					"API Integration Access",
				],
				cta: "Contact Sales",
			},
		],
	},
	cta: {
		title: (
			<>
				Keep Your Business <Accent>Visible.</Accent>
			</>
		),
		description: "Consistent posting and instant replies, without the extra hours.",
		ctaLabel: "Start for free",
	},
};

export default function SmbSolutionPage() {
	return <SolutionPage data={data} />;
}
