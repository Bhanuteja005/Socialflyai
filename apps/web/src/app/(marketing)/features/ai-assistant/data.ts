import type { ComparisonRow } from "@/components/marketing/comparison-table";
import type { FaqItem } from "@/components/marketing/faq-section";
import type { PricingPlan } from "@/components/marketing/pricing-section";

export const plans: PricingPlan[] = [
	{
		name: "Starter",
		price: "$14",
		description: "Perfect for budding creators looking to scale their hook game.",
		features: [
			"50 AI Hooks / month",
			"Basic Caption Generator",
			"Supports 3 Platforms",
			"Common Hashtag Clusters",
			"Email Support",
			"Single User",
		],
		cta: "Start for free",
	},
	{
		name: "Pro",
		price: "$39",
		description: "Best for serious creators and established brands.",
		features: [
			"Unlimited AI Hooks",
			"Advanced Viral Scripting",
			"All Platforms Supported",
			"Cross-Platform Adaptation",
			"Custom Brand Voice",
			"Priority Support",
			"No Watermark",
		],
		cta: "Get Pro Access",
		highlight: true,
	},
	{
		name: "Agency",
		price: "$99",
		description: "For agencies handling multiple client accounts.",
		features: [
			"Everything in Pro",
			"Multi-client Workspace",
			"Bulk Hook Generation",
			"Team Collaboration",
			"Dedicated Manager",
			"API Integration Access",
		],
		cta: "Contact Sales",
	},
];

export const rows: ComparisonRow[] = [
	{ feature: "AI Hooks / Month", values: ["50", "Unlimited", "Unlimited"] },
	{ feature: "Caption Variations", values: ["2 per post", "Unlimited", "Unlimited"] },
	{ feature: "Platform Support", values: ["3 Platforms", "All", "All"] },
	{ feature: "Brand Voice Customization", values: [false, true, true] },
	{
		feature: "Hashtag Recommendation Engine",
		values: ["Basic Clusters", "Advanced Analytics", "Advanced Analytics"],
	},
	{ feature: "Team Collaboration", values: [false, true, true] },
	{ feature: "API Access", values: [false, false, true] },
];

export const faqs: FaqItem[] = [
	{
		question: "How does the AI know my brand's voice?",
		answer:
			"You can upload examples of your past best-performing content or descriptive brand guidelines. Our AI Assistant analyzes these patterns to ensure every hook and caption sounds exactly like your brand.",
	},
	{
		question: "Are the hooks generated really viral-ready?",
		answer:
			"Our AI is trained on high-performing content trends across TikTok, Instagram, and LinkedIn. It uses psychology-backed patterns (curiosity gaps, problem/solution, etc.) to maximize the chances of your content going viral.",
	},
	{
		question: "Can I use AI Assistant for multiple platforms?",
		answer:
			"Yes! AI Assistant automatically adjusts the tone, length, and formatting for LinkedIn, Twitter/X, Instagram, TikTok, and more, ensuring your message fits the platform's unique culture.",
	},
	{
		question: "Does it help with hashtag research?",
		answer:
			"Absolutely. AI Assistant generates optimized hashtag clusters categorized by competition level (High, Medium, Low) to give your posts the best chance at discovery.",
	},
	{
		question: "Is there a limit to how many hooks I can generate?",
		answer:
			"The Starter plan includes 50 hooks per month, while Pro and Agency plans offer unlimited generations for all your social content needs.",
	},
];
