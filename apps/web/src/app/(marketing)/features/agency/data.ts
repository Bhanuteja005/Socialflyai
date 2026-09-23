import type { ComparisonRow } from "@/components/marketing/comparison-table";
import type { FaqItem } from "@/components/marketing/faq-section";
import type { PricingPlan } from "@/components/marketing/pricing-section";

export const plans: PricingPlan[] = [
	{
		name: "Starter",
		price: "$49",
		description: "Ideal for fresh boutiques and small social teams.",
		features: [
			"Up to 5 Client Workspaces",
			"Agency Team (3 Members)",
			"Basic Collaborative Drafting",
			"AI Content Assistance",
			"Email Support",
			"Manual Client Reports",
		],
		cta: "Start for free",
	},
	{
		name: "Pro Agency",
		price: "$149",
		description: "Best for high-growth agencies and established social firms.",
		features: [
			"Unlimited Client Workspaces",
			"Agency Team (10 Members)",
			"Granular Team Roles",
			"AI Interaction Suite",
			"Priority Support",
			"Brand Voice Management",
			"Custom Approval Flows",
		],
		cta: "Get Pro Access",
		highlight: true,
	},
	{
		name: "Enterprise",
		price: "$299",
		description: "For global agencies with complex client needs.",
		features: [
			"Everything in Pro",
			"White-label Reporting Suite",
			"Public Client Portals",
			"Unlimited Team Members",
			"Dedicated Success Manager",
			"Custom API Integrations",
		],
		cta: "Contact Sales",
	},
];

export const rows: ComparisonRow[] = [
	{ feature: "Client Workspaces", values: ["5", "Unlimited", "Unlimited"] },
	{ feature: "Team Members", values: ["3", "10", "Unlimited"] },
	{ feature: "White-label Reporting", values: [false, true, true] },
	{ feature: "Granular Permissions", values: ["Basic", "Advanced", "Advanced"] },
	{ feature: "Custom Approval Flows", values: [false, false, true] },
	{ feature: "Public Client Portals", values: [false, false, true] },
	{ feature: "API Access", values: [false, false, true] },
];

export const faqs: FaqItem[] = [
	{
		question: "How many client accounts can I manage?",
		answer:
			"The Starter plan allows for 5 client workspaces, while our Pro and Enterprise plans offer unlimited workspaces, letting you scale your agency without restrictions.",
	},
	{
		question: "Can I white-label the reports with my agency's logo?",
		answer:
			"Yes! Our Enterprise plan includes a full white-labeling suite. You can replace all SocialflyAI branding with your own agency logo and colors on both PDF reports and public client dashboards.",
	},
	{
		question: "How do client approvals work?",
		answer:
			"You can invite clients to their specific workspace with 'Viewer' or 'Approver' permissions. They can see the upcoming schedule and leave feedback directly on posts—all without seeing your internal agency settings.",
	},
	{
		question: "Does the AI help with multi-client content strategy?",
		answer:
			"Absolutely. Our AI Assistant can be trained on different 'Brand Voices' for each client, ensuring that generated hooks and captions remain consistent with each individual brand's identity.",
	},
	{
		question: "What kind of team permissions are available?",
		answer:
			"We offer granular roles including Owner, Manager, Editor, and Viewer. You can restrict team members to specific client workspaces to ensure data privacy and workflow focus.",
	},
];
