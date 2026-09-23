import { Hash, Sparkles, Users } from "lucide-react";
import { CompetitorPage, type CompetitorPageData } from "@/components/marketing/competitor-page";
import { pageMetadata } from "@/components/marketing/metadata";
import { Accent } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "SocialflyAI vs Later: AI Strategy Beyond Visual Planning",
	description:
		"Later is a visual planner. SocialflyAI is an AI strategist: unlimited AI captions, smart hashtags, cross-platform AI, predictive analytics and team-friendly pricing.",
	path: "/vs-later",
});

const data: CompetitorPageData = {
	name: "Later",
	hero: {
		title: (
			<>
				Strategy First. <br />
				<Accent>Visuals Second.</Accent>
			</>
		),
		description:
			"Later is a visual planner. SocialflyAI is an AI strategist. We don't just help you see how your grid looks; we help you create the content that makes the grid look great and convert.",
		socialProof: (
			<>
				<span className="block font-bold text-white">Top Rated AI Tool</span>
				Join 500+ creators
			</>
		),
	},
	preview: {
		title: "See SocialflyAI In Action",
		subtitle: "From AI-generated captions to multi-channel scheduling in seconds.",
	},
	comparisonFirst: true,
	comparison: {
		eyebrow: "Feature Battle",
		title: "Visual Planning vs AI Growth",
		subtitle: "Later helps you look good. SocialflyAI helps you grow fast.",
		rows: [
			{ feature: "Instagram Scheduling", competitor: "Excellent", socialfly: "Excellent + AI" },
			{ feature: "AI Content Studio", competitor: "Limited", socialfly: "Unlimited Generation" },
			{ feature: "Pricing Model", competitor: "Per User/Set", socialfly: "Team Friendly" },
			{
				feature: "Non-Visual Platforms",
				competitor: "Secondary",
				socialfly: "Native Full Support",
			},
			{ feature: "Predictive Analytics", competitor: "Basic", socialfly: "AI Trend Analysis" },
			{ feature: "Cross-Platform AI", competitor: false, socialfly: "Full Tech" },
			{ feature: "Smart Best-Times", competitor: "Limited", socialfly: "Deep AI Analysis" },
		],
	},
	features: [
		{
			title: "A Modern Interface Built For Speed",
			description:
				"Legacy software is slow. SocialflyAI is built on modern tech to ensure your workflow stays fluid. Spend less time clicking and more time creating.",
			bullets: ["Intuitive UI", "Instant Loads", "Mobile Optimized", "AI Templates"],
			visual: { kind: "dashboard" },
		},
		{
			title: "More Than Just Visual Planning",
			description:
				"Visuals matter, but strategy wins. Our AI studio generates the copy, hashtags, and timing strategy to ensure your beautiful posts actually get seen.",
			cards: [
				{
					icon: Sparkles,
					title: "AI Caption Studio",
					description: "Generate high-converting copy in seconds.",
				},
				{
					icon: Hash,
					title: "Smart Hashtagging",
					description: "Optimized for search and discovery.",
				},
			],
			visual: { kind: "calendar", title: "Content Calendar" },
		},
		{
			title: "Unlimited Team Collaboration",
			description:
				"Stop worrying about user seats. SocialflyAI's team features allow you to bring everyone into the loop—from creators to clients—without the extra costs.",
			bullets: ["Shared Workspaces", "Approval Workflows", "Team Comments", "Role Permissions"],
			visual: {
				kind: "list",
				title: "Invite Team",
				icon: Users,
				rows: [
					{ title: "Creators", subtitle: "3 members", status: "Active", avatar: "CR" },
					{
						title: "Clients",
						subtitle: "2 approvers",
						status: "Invited",
						tone: "warning",
						avatar: "CL",
					},
				],
			},
		},
	],
	faq: {
		subtitle: "Everything you need to know about switching from Later.",
		items: [
			{
				question: "Is SocialflyAI as good for Instagram as Later?",
				answer:
					"Yes, and more. We provide the same visual planning capabilities but add AI automation to help you generate content faster.",
			},
			{
				question: "Can I manage my TikTok and LinkedIn here?",
				answer:
					"Absolutely. SocialflyAI is a true multi-platform tool, giving you native-feeling controls for every major social network.",
			},
			{
				question: "Do you offer a free trial?",
				answer:
					"Yes! Start for free and explore all our AI features today. No credit card required to get started.",
			},
			{
				question: "How does the AI collaboration work?",
				answer:
					"Our AI can act as a coordinator—generating initial drafts for your team to review, and managing the approval flow seamlessly.",
			},
		],
	},
	cta: { title: "Ready To Grow Without The Guess Work?" },
};

export default function VsLaterPage() {
	return <CompetitorPage data={data} />;
}
