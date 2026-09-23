import type { ComparisonRow } from "@/components/marketing/comparison-table";
import type { FaqItem } from "@/components/marketing/faq-section";
import type { PricingPlan } from "@/components/marketing/pricing-section";

export const plans: PricingPlan[] = [
	{
		name: "Starter",
		price: "$29",
		description: "Perfect for growing creators and personal brands.",
		features: [
			"3 Platforms Tracked",
			"Basic Engagement Metrics",
			"7-Day Lookback",
			"Single Custom Report",
			"Email Support",
			"Single User Account",
		],
		cta: "Start for free",
	},
	{
		name: "Pro",
		price: "$79",
		description: "Best for high-growth brands and active social marketers.",
		features: [
			"Unlimited Platforms",
			"Advanced ROI Tracking",
			"Infinite History Lookback",
			"AI-Generated Insights",
			"Priority Support",
			"Multi-client Workspaces",
			"No SocialflyAI Branding",
		],
		cta: "Get Pro Access",
		highlight: true,
	},
	{
		name: "Agency",
		price: "$199",
		description: "For agencies requiring deep data across client accounts.",
		features: [
			"Everything in Pro",
			"White-label Reporting",
			"Multi-level Team Access",
			"Weekly Analyst Calls",
			"Dedicated Account Manager",
			"API Access for Reporting",
		],
		cta: "Contact Sales",
	},
];

export const rows: ComparisonRow[] = [
	{ feature: "Platforms Tracked", values: ["3", "Unlimited", "Unlimited"] },
	{ feature: "Data History Lookback", values: ["7 Days", "Unlimited", "Unlimited"] },
	{ feature: "AI Insights Generation", values: [false, true, true] },
	{ feature: "Conversion ROI Tracking", values: ["Basic", "Advanced", "Advanced"] },
	{ feature: "White-label Reports", values: [false, false, true] },
	{ feature: "Custom Branding", values: [false, true, true] },
	{ feature: "API Access", values: [false, false, true] },
];

export const faqs: FaqItem[] = [
	{
		question: "How accurate is the engagement data?",
		answer:
			"We sync directly with platform APIs in real-time. Our data matches exactly what you see in your native app analytics, with additional proprietary layers for sentiment analysis and conversion tracking.",
	},
	{
		question: "Can I export reports for my clients?",
		answer:
			"Yes! Our Pro and Agency plans allow you to export high-quality PDF or CSV reports. Agency users can also white-label these reports with their own branding.",
	},
	{
		question: "Does SocialflyAI track competitor data?",
		answer:
			"The Agency plan includes benchmarking tools that allow you to track publicly available metrics for competitor accounts, helping you understand where you stand in your niche.",
	},
	{
		question: "What platforms are supported for analytics?",
		answer:
			"Currently, we provide in-depth analytics for Instagram, TikTok, LinkedIn, Twitter/X, and Facebook. We are constantly adding support for new networks like Threads and Pinterest.",
	},
	{
		question: "How far back can I see my data?",
		answer:
			"The Starter plan provides a 7-day lookback for performance trends. The Pro and Agency plans provide infinite historical data from the moment you connect your account.",
	},
];
