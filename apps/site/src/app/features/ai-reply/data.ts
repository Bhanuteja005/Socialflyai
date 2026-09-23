import type { ComparisonRow } from "@/components/marketing/comparison-table";
import type { FaqItem } from "@/components/marketing/faq-section";
import type { PricingPlan } from "@/components/marketing/pricing-section";

export const plans: PricingPlan[] = [
	{
		name: "Starter",
		price: "$34",
		description: "Ideal for growing creators with expanding engagement needs.",
		features: [
			"250 AI Replies / month",
			"Basic Sentiment Analysis",
			"Supports 3 Platforms",
			"Standard Training Data",
			"Email Support",
			"Single User",
		],
		cta: "Start for free",
	},
	{
		name: "Pro",
		price: "$69",
		description: "Best for high-engagement brands and social media managers.",
		features: [
			"1,500 AI Replies / month",
			"Advanced Contextual Intelligence",
			"Works Across All Platforms",
			"Brand Voice Customization",
			"GIF & Emoji Integration",
			"Priority Support",
			"No Watermark",
		],
		cta: "Get Pro Access",
		highlight: true,
	},
	{
		name: "Agency",
		price: "$149",
		description: "For agencies managing client interactions at scale.",
		features: [
			"Unlimited AI Replies",
			"Multi-client Workspaces",
			"Bulk Reply Templates",
			"API Integration Access",
			"Dedicated Manager",
			"White-label Reporting",
			"Team Workflow Assignment",
		],
		cta: "Contact Sales",
	},
];

export const rows: ComparisonRow[] = [
	{ feature: "Monthly AI Replies", values: ["250", "1,500", "Unlimited"] },
	{ feature: "Contextual Intelligence", values: ["Basic", "Advanced", "Advanced+"] },
	{ feature: "Platform Support", values: ["3 Platforms", "All", "All"] },
	{ feature: "Brand Voice Customization", values: [false, true, true] },
	{ feature: "GIF & Emoji Replies", values: [false, true, true] },
	{ feature: "Multi-client Workspaces", values: [false, true, true] },
	{ feature: "API Access", values: [false, false, true] },
];

export const faqs: FaqItem[] = [
	{
		question: "How does the AI know my brand voice?",
		answer:
			"You can provide a 'Brand Brief' in your dashboard settings. Our AI analyzes your past successful interactions and your guidelines to ensure every reply sounds authentically like your brand.",
	},
	{
		question: "Is it safe to automate all replies?",
		answer:
			"We offer two modes: 'Suggestion Mode' (where you approve every reply) and 'Auto-Pilot' (where the AI replies autonomously). We always recommend starting with Suggestion Mode to refine your AI's accuracy.",
	},
	{
		question: "Does it work for DMs as well as comments?",
		answer:
			"Yes! AI Reply handles both public comments and private direct messages across all supported platforms, ensuring a unified customer experience.",
	},
	{
		question: "Can I filter out certain keywords?",
		answer:
			"Absolutely. You can set 'Blacklisted Keywords' that the AI will never use, and 'Negative Triggers' that will cause the AI to flag a message for human review instead of replying.",
	},
	{
		question: "Does AI Reply support multiple languages?",
		answer:
			"Yes, our AI automatically detects the source language and replies in the same language fluently. It currently supports over 100 languages.",
	},
];
