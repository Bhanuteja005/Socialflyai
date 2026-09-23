import type { ComparisonRow } from "@/components/marketing/comparison-table";
import type { FaqItem } from "@/components/marketing/faq-section";
import type { PricingPlan } from "@/components/marketing/pricing-section";

export const plans: PricingPlan[] = [
	{
		name: "Starter",
		price: "$29",
		description: "Ideal for growing creators with expanding comment sections.",
		features: [
			"500 Comments / month",
			"Unified Inbox (3 platforms)",
			"Basic AI Suggestions",
			"Spam Monitoring",
			"Email Support",
			"Single User",
		],
		cta: "Start for free",
	},
	{
		name: "Pro",
		price: "$59",
		description: "Best for high-engagement brands and social media managers.",
		features: [
			"Unlimited Comments",
			"Unified Inbox (All platforms)",
			"Advanced AI Auto-Replies",
			"Smart Sentiment Analysis",
			"Lead Detection (CRM)",
			"Priority Support",
			"Custom Tags & Groups",
		],
		cta: "Get Pro Access",
		highlight: true,
	},
	{
		name: "Agency",
		price: "$129",
		description: "For agencies managing client interactions at scale.",
		features: [
			"Multi-client Workspaces",
			"Bulk Auto-Reply Templates",
			"Team Workflow Assignment",
			"White-label Reporting",
			"Dedicated Manager",
			"API Interaction Access",
		],
		cta: "Contact Sales",
	},
];

export const rows: ComparisonRow[] = [
	{ feature: "Comments Mode", values: ["3 Platforms", "Unlimited", "Unlimited"] },
	{ feature: "AI Auto-Reply Suggestions", values: ["Basic", "Advanced", "Bulk Templates"] },
	{ feature: "Sentiment Analysis", values: [false, true, true] },
	{ feature: "Lead Scoring (CRM)", values: [false, true, true] },
	{ feature: "Team Collaboration", values: [false, true, "Full Workflow"] },
	{ feature: "Bulk Moderation", values: [false, true, true] },
	{ feature: "Priority Support", values: [false, true, "Dedicated Manager"] },
];

export const faqs: FaqItem[] = [
	{
		question: "How does the Unified Inbox work?",
		answer:
			"Our Unified Inbox connects via official APIs to all your social platforms. Every time a new comment, mention, or DM lands, it's instantly synced to your SocialflyAI dashboard for quick interaction.",
	},
	{
		question: "Can I automate all my replies with AI?",
		answer:
			"While you can automate simple acknowledgments, we recommend using our AI Suggestion mode. It prepares a high-quality reply for you to review and send in one click, ensuring the perfect balance of speed and brand voice.",
	},
	{
		question: "What platforms are currently supported?",
		answer:
			"We support Instagram, TikTok, YouTube, Facebook, LinkedIn, Twitter/X, and Pinterest. We are constantly adding new integrations as their APIs become available.",
	},
	{
		question: "Is the CRM contact data private?",
		answer:
			"Absolutely. All contact data, sentiment history, and interaction logs are encrypted and private to your account. We never share your audience data with third parties.",
	},
	{
		question: "Can multiple team members manage comments?",
		answer:
			"Yes! With our Agency and Pro plans, you can invite team members and assign specific comments or platforms to them to ensure no interaction is missed.",
	},
];
