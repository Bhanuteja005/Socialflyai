import type { ComparisonRow } from "@/components/marketing/comparison-table";
import type { FaqItem } from "@/components/marketing/faq-section";
import type { PricingPlan } from "@/components/marketing/pricing-section";

export const plans: PricingPlan[] = [
	{
		name: "Starter",
		price: "$19",
		description: "Perfect for budding creators and small personal brands.",
		features: [
			"30 Posts / month",
			"Basic Content Calendar",
			"Supports 3 Platforms",
			"Single User Interaction",
			"Email Support",
			"Grid Preview (Basic)",
		],
		cta: "Start for free",
	},
	{
		name: "Pro",
		price: "$49",
		description: "Best for serious social media managers and high-growth brands.",
		features: [
			"Unlimited Posts",
			"Advanced Drag-and-Drop Calendar",
			"All Platforms Supported",
			"Unlimited Grid Previews",
			"Priority Support",
			"Multi-client Workspaces",
			"Advanced Content Themes",
		],
		cta: "Get Pro Access",
		highlight: true,
	},
	{
		name: "Agency",
		price: "$119",
		description: "For agencies managing client strategy at scale.",
		features: [
			"Everything in Pro",
			"Multi-level Approval Flows",
			"Client Feedback Portal",
			"Team Collaboration Suite",
			"Dedicated Account Manager",
			"API Integration Access",
		],
		cta: "Contact Sales",
	},
];

export const rows: ComparisonRow[] = [
	{ feature: "Drag-and-Drop Interface", values: [true, true, true] },
	{ feature: "Instagram Grid Preview", values: ["Basic", "Unlimited", "Unlimited"] },
	{ feature: "Platform Support", values: ["3 Platforms", "All", "All"] },
	{ feature: "Team Collaboration", values: [false, true, true] },
	{ feature: "Client Approval Portal", values: [false, false, true] },
	{ feature: "Multi-level Approvals", values: [false, false, true] },
	{ feature: "API Access", values: [false, false, true] },
];

export const faqs: FaqItem[] = [
	{
		question: "Can I manage multiple brand accounts on one calendar?",
		answer:
			"Yes! Our Pro and Agency plans allow you to create separate workspaces for different brands or clients, each with their own dedicated content calendar and team members.",
	},
	{
		question: "How do team approvals work?",
		answer:
			"You can set up custom approval workflows. For example, a content creator can draft a post, which then automatically notifies the manager for review. Only once approved will the post be scheduled for publishing.",
	},
	{
		question: "Is there a drag-and-drop interface for all platforms?",
		answer:
			"Absolutely. Our unified calendar supports drag-and-drop rescheduling for Instagram, TikTok, Facebook, LinkedIn, Twitter/X, and YouTube simultaneously.",
	},
	{
		question: "Can clients leave feedback directly on the calendar?",
		answer:
			"Yes, the Agency plan features a 'Client Portal' where clients can view the upcoming schedule and leave threaded comments or 'Request Edits' on specific posts without needing a full account.",
	},
	{
		question: "Does the grid preview work for Reels and Carousels?",
		answer:
			"Yes! Our visual grid planner allows you to see exactly how your photos, carousels, and Reels covers will look in your Instagram feed before you post.",
	},
];
