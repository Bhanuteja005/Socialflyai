import { CircleQuestionMark } from "lucide-react";
import { type FaqItem, FaqJsonLd, FaqList } from "@/components/marketing/faq-section";
import { pageMetadata } from "@/components/marketing/metadata";
import { PageHero } from "@/components/marketing/page-hero";
import { Accent, Container, CtaLink } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "FAQ",
	description:
		"Answers to common questions about SocialflyAI: supported platforms, growth features, data security, platform compliance, pricing and cancellations.",
	path: "/faq",
});

const FAQS: { category: string; items: FaqItem[] }[] = [
	{
		category: "Product",
		items: [
			{
				question: "How Does SocialflyAI Actually Grow My Following?",
				answer:
					"SocialflyAI uses proprietary Engagement Loops to identify and interact with high-value prospects in your niche, combined with AI-optimized content that stops the scroll.",
			},
			{
				question: "Which Social Platforms Are Currently Supported?",
				answer:
					"We currently support Instagram, TikTok, LinkedIn, and Twitter/X, with YouTube and Facebook coming in Q2 2026.",
			},
			{
				question: "Can I Port My Existing Content From Other Tools?",
				answer:
					"Yes, our universal CSV/API importer makes it trivial to bring your drafts and history from Buffer, Hootsuite, or Sprout Social.",
			},
		],
	},
	{
		category: "Safety & Privacy",
		items: [
			{
				question: "Is SocialflyAI Compliant With Platform Terms of Service?",
				answer:
					"Absolutely. We use official API integrations and human-like rate-limiting behaviors to ensure your accounts are never at risk of shadow-banning or suspension.",
			},
			{
				question: "How Secure Is My Personal And Brand Data?",
				answer:
					"We use enterprise-grade AES-256 encryption for all data storage and never sell your analytics or content history to third parties.",
			},
		],
	},
	{
		category: "Pricing",
		items: [
			{
				question: "Is There A Truly Free Version of SocialflyAI?",
				answer:
					"Yes, our 'Starter' plan is free forever for managed platform clusters, including basic AI caption support.",
			},
			{
				question: "Can I Cancel Or Change My Subscription Anytime?",
				answer:
					"Of course. There are no long-term contracts. You can upgrade, downgrade, or cancel directly from your dashboard at any time.",
			},
		],
	},
];

export default function FaqPage() {
	return (
		<>
			<PageHero
				badge={{ icon: CircleQuestionMark, label: "Have Questions? We Have Answers" }}
				title={
					<>
						Comprehensive <Accent>FAQ.</Accent>
					</>
				}
			/>
			<Container size="md" className="pb-20 sm:pb-28">
				<div className="space-y-12">
					{FAQS.map((group, index) => (
						<section key={group.category} aria-labelledby={`faq-group-${index}`}>
							<h2
								id={`faq-group-${index}`}
								className="mb-6 ml-2 font-bold text-white/40 text-xl uppercase tracking-widest"
							>
								{group.category}
							</h2>
							<FaqList items={group.items} defaultOpenFirst={index === 0} />
						</section>
					))}
				</div>

				<div className="mt-20 rounded-[40px] border border-white/10 bg-white/5 p-8 text-center backdrop-blur-md sm:p-12">
					<h2 className="mb-4 font-bold text-2xl text-white">Still have more questions?</h2>
					<p className="mb-8 text-white/60">Our support team is ready to help your brand grow.</p>
					<CtaLink href="/contact">Message our team</CtaLink>
				</div>
			</Container>
			<FaqJsonLd items={FAQS.flatMap((group) => group.items)} />
		</>
	);
}
