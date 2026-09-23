import {
	BookOpen,
	ChartColumn,
	GraduationCap,
	Repeat,
	ShieldAlert,
	ShieldCheck,
	Users,
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
	title: "Social Media Management for Higher Education",
	description:
		"Social media built for the modern campus. Drive recruitment, showcase campus life and manage alumni relations with AI-powered consistency and enterprise-grade safety.",
	path: "/solutions/higher-education",
});

const data: SolutionPageData = {
	hero: {
		badge: { icon: GraduationCap, label: "Enterprise Solution for Higher Education" },
		title: (
			<>
				Social Media Built <br />
				for the <Accent>Modern Campus.</Accent>
			</>
		),
		description:
			"Drive recruitment, showcase campus life, and manage alumni relations with AI-powered consistency and enterprise-grade safety across every department.",
		actions: [
			{ label: "Get Higher Ed Demo", href: "/contact" },
			{ label: "Education Case Studies", href: "/blog", variant: "secondary", icon: BookOpen },
		],
		metrics: [
			{ label: "Student Engagement", value: "+340%", note: "Recruitment ROI", icon: GraduationCap },
			{ label: "Safety Controls", value: "Locked", note: "Brand Protection", icon: ShieldCheck },
		],
	},
	features: [
		{
			title: (
				<>
					Recruitment-First <br />
					<Accent>Content Automation.</Accent>
				</>
			),
			description:
				"Turn campus life into student enrollments. SocialflyAI's AI Assistant automatically identifies viral student trends and generates reels and posts that resonate with the next generation of applicants.",
			bullets: [
				"Trend-aware student recruitment AI",
				"Campus life reel templates",
				"Multi-department access clusters",
				"Automated 'Apply Now' CTAs",
			],
			visual: (
				<TagPanel
					icon={GraduationCap}
					title="Campus Life Highlight: Active"
					tags={["#CampusLife", "#Universitybound", "#FutureGrad"]}
				/>
			),
		},
		{
			title: (
				<>
					Enterprise Campus <br />
					<Accent>Moderation &amp; Safety.</Accent>
				</>
			),
			description:
				"Protect your institution's reputation. Our AI-Reply and moderation engine filters harmful content and ensures all interactions across department accounts adhere to university brand safety guidelines.",
			chips: [
				{ icon: ShieldCheck, label: "Brand Safety Guardrails" },
				{ icon: Users, label: "Departmental Hierarchy" },
			],
			visual: (
				<MockupFrame title="Moderation AI" icon={ShieldAlert}>
					<ChatMockup
						messages={[
							{ author: "Incoming Comment", text: "When do applications open for fall?" },
							{
								author: "Moderation AI",
								text: "Applications open soon — check the admissions page for dates.",
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
					Alumni Engagement. <br />
					<Accent>Infinite Connection.</Accent>
				</>
			),
			description:
				"Foster lifelong connections. Track how campus content drives alumni interactions and fundraising triggers with deep data that helps your foundation grow.",
			stats: [
				{ label: "Alumni Interaction", value: "+240%", icon: ChartColumn },
				{ label: "Campus Reach", value: "Global", icon: Repeat },
				{ label: "Enrollment ROI", value: "High", icon: GraduationCap },
				{ label: "Safety Record", value: "100%", icon: Zap },
			],
		},
	],
	pricing: {
		title: (
			<>
				Invest in <Accent>Education,</Accent> Not Just Tools
			</>
		),
		description: "Special higher education pricing for campuses and institutions.",
		plans: [
			{
				name: "Campus",
				price: "$99",
				description: "Launch your department's social presence.",
				features: [
					"Up to 5 Department Accounts",
					"Student Engagement AI",
					"Basic Safety Moderation",
					"Campus Event Scheduling",
					"Email Support",
					"2 Admin Seats",
				],
				cta: "Start for free",
			},
			{
				name: "University",
				price: "$299",
				description: "Best for multi-department social management and recruitment.",
				features: [
					"Unlimited Accounts",
					"Global Safety & Compliance",
					"AI Recruitment Assistant",
					"Alumni Insight Dashboard",
					"Priority Edu-Support",
					"Institutional Hierarchy Roles",
					"No SocialflyAI Branding",
				],
				cta: "Get University Access",
				highlight: true,
			},
			{
				name: "District",
				price: "$599+",
				description: "For large university systems and global education networks.",
				features: [
					"Everything in University",
					"Audit Logs & Compliance Suite",
					"Public Performance Links",
					"Unlimited Admin Seats",
					"Dedicated Success Manager",
					"Custom API Development",
				],
				cta: "Contact Sales",
			},
		],
	},
	cta: {
		title: (
			<>
				Bring Your <Accent>Campus</Accent> Together.
			</>
		),
		description: "Every department, one safe and consistent social presence.",
		ctaLabel: "Get started for free",
	},
};

export default function HigherEducationSolutionPage() {
	return <SolutionPage data={data} />;
}
