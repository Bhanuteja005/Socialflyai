import type { ComparisonRow } from "@/components/marketing/comparison-table";
import type { FaqItem } from "@/components/marketing/faq-section";
import type { PricingPlan } from "@/components/marketing/pricing-section";

export const plans: PricingPlan[] = [
	{
		name: "Starter",
		price: "$19",
		description: "Ideal for solo creators managing a single brand presence.",
		features: [
			"30 Posts / month",
			"Basic Content Calendar",
			"Supports 3 Platforms",
			"Manual Scheduling",
			"Email Support",
			"Single User",
		],
		cta: "Start for free",
	},
	{
		name: "Pro",
		price: "$49",
		description: "Best for high-volume creators and growing social media managers.",
		features: [
			"Unlimited Posts",
			"Advanced Drag-and-Drop Calendar",
			"All Platforms Supported",
			"AI Content Assistant",
			"Perfect Post Timing Audit",
			"Priority Support",
			"Collaboration Tools",
		],
		cta: "Get Pro Access",
		highlight: true,
	},
	{
		name: "Agency",
		price: "$119",
		description: "For agencies managing client content at scale.",
		features: [
			"Unlimited Everything",
			"Multi-client Workspace",
			"Bulk Upload & Management",
			"Advanced Approval Workflows",
			"Dedicated Manager",
			"White-label Content Planner",
			"API Integration Access",
		],
		cta: "Contact Sales",
	},
];

export const rows: ComparisonRow[] = [
	{ feature: "Monthly Posts", values: ["30", "Unlimited", "Unlimited"] },
	{ feature: "Content Calendar", values: ["Basic", "Drag-and-Drop", "Drag-and-Drop"] },
	{ feature: "AI Content Assistant", values: [false, true, true] },
	{ feature: "Perfect Time Audit", values: [false, true, true] },
	{ feature: "Direct Publishing", values: [true, true, true] },
	{ feature: "Bulk Upload", values: [false, true, true] },
	{ feature: "Team Approvals", values: [false, false, true] },
];

export const faqs: FaqItem[] = [
	{
		question: "Does SocialflyAI support direct posting?",
		answer:
			"Yes! We support direct publishing to Instagram (Posts, Reels, Stories), TikTok, Facebook, LinkedIn, Twitter/X, and YouTube. No mobile notifications required.",
	},
	{
		question: "Can I schedule videos and Reels?",
		answer:
			"Absolutely. You can upload and schedule high-quality videos, Reels, and TikToks directly from the dashboard. We even help you select the best cover frame.",
	},
	{
		question: "What is 'Perfect Post Time'?",
		answer:
			"Our AI analyzes your unique audience data to identify the specific hours and days when your followers are most active, helping you maximize every post's reach.",
	},
	{
		question: "Can I manage multiple client accounts?",
		answer:
			"Yes, our Agency plan is designed specifically for teams managing multiple brands. You can switch between workspaces and keep client content completely separate.",
	},
	{
		question: "Is there a limit to how many posts I can schedule?",
		answer:
			"The Starter plan includes 30 posts per month, while our Pro and Agency plans offer unlimited scheduling for all your social platforms.",
	},
];
