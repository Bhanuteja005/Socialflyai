import { FaqSection } from "@/components/marketing/faq-section";
import { HeroSection } from "@/components/marketing/home/hero-section";
import { GridLines, HomeEyebrow, homeHeading } from "@/components/marketing/home/home-primitives";
import { InspirationSection } from "@/components/marketing/home/inspiration-section";
import {
	AnalyticsSection,
	CoreFeaturesSection,
	ProductPreviewSection,
	TaskPipelineSection,
	TrustedPartnersSection,
	UnifiedCalendarSection,
} from "@/components/marketing/home/showcase-sections";
import {
	type Testimonial,
	TestimonialsCarousel,
} from "@/components/marketing/home/testimonials-carousel";
import { pageMetadata } from "@/components/marketing/metadata";

export const metadata = pageMetadata({
	title: "SocialFly AI — AI Social Media Planner, Scheduler & Analytics",
	description:
		"Connect every social account, create consistently with AI and improve continuously with analytics. Plan, schedule and publish from one unified content calendar.",
	path: "/",
	absoluteTitle: true,
});

const TESTIMONIALS: Testimonial[] = [
	{
		avatarBg: "#4a5568",
		initials: "JA",
		name: "John Doe",
		location: "Newyork, NYC",
		text: "SocialflyAI completely streamlined our entire post calendar and daily operations. The automated scheduling features literally saved us hours weekly!",
	},
	{
		avatarBg: "#eab308",
		initials: "SM",
		name: "Sarah Miller",
		location: "London, UK",
		text: "This platform handled everything from our vendors to guest lists without a single hiccup. What felt overwhelming at first turned incredibly smooth.",
	},
	{
		avatarBg: "#9a6b5c",
		initials: "RB",
		name: "Robert Brown",
		location: "Sydney, AU",
		text: "The advanced analytics dashboards gave us the exact clarity we needed to easily scale our audience reach by over 120% in just two short months.",
	},
	{
		avatarBg: "#10b981",
		initials: "AL",
		name: "Alice Lee",
		location: "Tokyo, JP",
		text: "Super intuitive interface design packed with highly powerful automation features. I cannot recommend this workspace enough for serious creators!",
	},
	{
		avatarBg: "#a855f7",
		initials: "KM",
		name: "Kevin Mack",
		location: "Paris, FR",
		text: "Collaborating with external clients and brand partners has never been easier than it is now using these real-time synchronized shared drafts.",
	},
	{
		avatarBg: "#ef4444",
		initials: "DC",
		name: "Danielle Cox",
		location: "Berlin, DE",
		text: "Absolutely fantastic tooling designed perfectly for modern workflows. Visually fluid dashboards and blazingly quick responsive layout renders.",
	},
];

const HOME_FAQ = [
	{
		question: "How does SocialflyAI plan my content?",
		answer:
			"SocialflyAI brings every connected channel into one content calendar. The AI assistant helps you ideate and draft posts, and best-time insights suggest when to publish, so you can plan a whole week of content in one sitting.",
	},
	{
		question: "Can I collaborate with others?",
		answer:
			"Yes. Invite teammates and clients to shared workspaces, assign roles, and review drafts together before anything is published.",
	},
	{
		question: "Is my content data secure?",
		answer:
			"We connect to platforms through their official APIs, encrypt stored data and never sell your analytics or content history to third parties.",
	},
	{
		question: "Can I connect multiple social accounts?",
		answer:
			"Absolutely. Connect Instagram, Facebook, X (Twitter), LinkedIn, TikTok, YouTube and more, then manage them all from a single dashboard.",
	},
];

const SOFTWARE_JSON_LD = {
	"@context": "https://schema.org",
	"@type": "SoftwareApplication",
	name: "SocialFly AI",
	applicationCategory: "BusinessApplication",
	operatingSystem: "Web",
	description:
		"AI-powered social media management: plan, schedule, publish and analyse content across every major network.",
	offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export default function HomePage() {
	return (
		<>
			<script
				type="application/ld+json"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: static JSON-LD built from a constant
				dangerouslySetInnerHTML={{ __html: JSON.stringify(SOFTWARE_JSON_LD) }}
			/>
			<div className="relative z-0">
				<GridLines />
				<div className="relative z-10">
					<HeroSection />
					<ProductPreviewSection />
					<TrustedPartnersSection />
					<CoreFeaturesSection />
					<UnifiedCalendarSection />
					<TaskPipelineSection />
					<AnalyticsSection />
					<InspirationSection />
				</div>
			</div>

			<div className="relative bg-[radial-gradient(ellipse_140%_70%_at_50%_60%,#001a0d_0%,#000_80%)]">
				<section className="relative z-10 px-4 py-24 sm:px-6 lg:px-10">
					<div className="mx-auto max-w-5xl text-center">
						<HomeEyebrow>Testimonials</HomeEyebrow>
						<h2 className={homeHeading}>What Our Users Say</h2>
						<TestimonialsCarousel testimonials={TESTIMONIALS} />
					</div>
				</section>
				<FaqSection
					items={HOME_FAQ}
					title="Got Questions?"
					description="Everything you need to know before you get started."
					defaultOpenFirst={false}
				/>
			</div>
		</>
	);
}
