import type { ComparisonRow } from "@/components/marketing/comparison-table";
import type { FaqItem } from "@/components/marketing/faq-section";
import type { PricingPlan } from "@/components/marketing/pricing-section";

export const plans: PricingPlan[] = [
	{
		name: "Starter",
		price: "$24",
		description: "Perfect for individual creators and small social media managers.",
		features: [
			"20 Videos / month",
			"Up to 5 min per video",
			"Standard AI Transcription",
			"100+ Languages",
			"720p Export",
			"Standard Support",
		],
		cta: "Start for free",
	},
	{
		name: "Pro",
		price: "$49",
		description: "Best for professional creators and growing social media agencies.",
		features: [
			"Unlimited Videos",
			"Up to 15 min per video",
			"Advanced Neural Transcription",
			"Custom Branding & Fonts",
			"4K Export",
			"Priority Support",
			"No Watermark",
		],
		cta: "Get started with Pro",
		highlight: true,
	},
	{
		name: "Agency",
		price: "$99",
		description: "For agencies and large teams managing multiple content streams.",
		features: [
			"Team Collaboration (5 users)",
			"Bulk Video Processing",
			"API Access",
			"Custom Caption Templates",
			"Dedicated Manager",
			"Whitelabel Exports",
		],
		cta: "Join as an Agency",
	},
];

export const rows: ComparisonRow[] = [
	{ feature: "AI Transcription Credits", values: ["20 / month", "Unlimited", "Unlimited"] },
	{ feature: "Maximum Video Length", values: ["5 mins", "15 mins", "60 mins"] },
	{ feature: "Multi-Language Support", values: ["Yes (100+)", "Yes (100+)", "Yes (100+)"] },
	{ feature: "Custom Branding", values: [false, true, true] },
	{ feature: "4K Export Quality", values: [false, true, true] },
	{ feature: "API Access", values: [false, false, true] },
	{ feature: "Team Collaboration", values: [false, false, true] },
	{ feature: "Post Directly to Social", values: [true, true, true] },
];

export const faqs: FaqItem[] = [
	{
		question: "What is an AI Caption Generator?",
		answer:
			"An AI Caption Generator uses advanced neural networks to transcribe the speech from your videos and convert it into text-based captions that are timed perfectly with the audio.",
	},
	{
		question: "How long does it take to generate captions?",
		answer:
			"Most videos are processed in less than 2 minutes. For longer content, our AI works at roughly 4x real-time speed, so a 10-minute video takes about 2.5 minutes.",
	},
	{
		question: "Is there a free version?",
		answer:
			"Yes, you can try our AI Caption Generator for free to test the precision and quality of the transcripts. You'll receive a limited number of credits to get started.",
	},
	{
		question: "Which formats are supported?",
		answer:
			"We support all major video formats including MP4, MOV, AVI, and WMV. You can also export captions in SRT, VTT, or hard-coded directly into the video.",
	},
	{
		question: "Can I edit the captions manually?",
		answer:
			"Absolutely! Our platform includes a powerful editor that allows you to refine the text, adjust the timing, and change the styling of your captions.",
	},
];
