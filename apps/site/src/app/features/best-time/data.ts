import type { ComparisonRow } from "@/components/marketing/comparison-table";
import type { FaqItem } from "@/components/marketing/faq-section";
import type { PricingPlan } from "@/components/marketing/pricing-section";

export const plans: PricingPlan[] = [
	{
		name: "Starter",
		price: "$29",
		description: "Ideal for growing creators and personal brands.",
		features: [
			"Basic Heatmap Analytics",
			"Single Platform Support",
			"24h Engagement Insights",
			"Manual Rescheduling",
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
			"Unlimited Platform Support",
			"Advanced Reach Audit",
			"7-Day Engagement Forecasting",
			"Automated 'Perfect Time' Trigger",
			"Priority Support",
			"Multi-client Workspaces",
		],
		cta: "Get Pro Access",
		highlight: true,
	},
	{
		name: "Agency",
		price: "$149",
		description: "For agencies managing client strategy at scale.",
		features: [
			"Everything in Pro",
			"Multi-client Analytics Dashboard",
			"Competitor Activity Benchmarks",
			"Bulk Reach Reporting",
			"Dedicated Analyst Support",
			"API Integration Access",
		],
		cta: "Contact Sales",
	},
];

export const rows: ComparisonRow[] = [
	{ feature: "AI Engagement Heatmaps", values: ["Basic", "Advanced", "Full History"] },
	{ feature: "'Perfect Time' Auto-Scheduler", values: [false, true, true] },
	{ feature: "Audit Analytics", values: ["Current Post", "7-Day Forecast", "Custom Range"] },
	{ feature: "Platform Support", values: ["1 Platform", "Unlimited", "Unlimited"] },
	{ feature: "Competitor Benchmarking", values: [false, false, true] },
	{ feature: "Weekly Reach Reports", values: [false, true, true] },
	{ feature: "API Access", values: [false, false, true] },
];

export const faqs: FaqItem[] = [
	{
		question: "How accurate is the 'Best Time' prediction?",
		answer:
			"Our AI uses millions of data points from your specific audience's past interactions. While no prediction is 100% certain, our users typically see a 40-80% lift in engagement when following our 'Perfect Time' suggestions.",
	},
	{
		question: "Does it track activity for all my platforms?",
		answer:
			"Yes, SocialflyAI tracks unique audience patterns for Instagram, TikTok, LinkedIn, Twitter/X, and Facebook simultaneously, providing a per-platform 'Best Time' recommendation.",
	},
	{
		question: "What is an 'Engagement Audit'?",
		answer:
			"An Engagement Audit is a report that shows you the gap between your current performance and your potential performance if you optimized your posting times. It helps you see exactly where you're losing reach.",
	},
	{
		question: "Can I set the 'Best Time' to be automated?",
		answer:
			"Absolutely. In our Pro and Agency plans, you can toggle 'Auto-Slot' when scheduling. The system will automatically place your post into the next available high-engagement window based on your heatmap.",
	},
	{
		question: "Does it account for different time zones?",
		answer:
			"Yes. Our AI Assistant automatically detects the geographic distribution of your audience and suggests times based on where the majority of your active followers are located.",
	},
];
