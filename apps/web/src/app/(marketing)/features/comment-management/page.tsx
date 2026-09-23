import {
	ChartLine,
	Inbox,
	MessageCircle,
	MessageSquare,
	Play,
	Send,
	Shield,
	ShieldCheck,
	Sparkles,
	Users,
	Zap,
} from "lucide-react";
import { FeatureSplitSection } from "@/components/marketing/feature-split";
import { FeaturePlanSections } from "@/components/marketing/features-plan-sections";
import { pageMetadata } from "@/components/marketing/metadata";
import { ChatMockup, ListMockup, MockupFrame } from "@/components/marketing/mockups";
import { PageHero } from "@/components/marketing/page-hero";
import { PlatformStrip } from "@/components/marketing/platform-strip";
import { Accent, Container, CtaLink, SectionHeading } from "@/components/marketing/primitives";
import { faqs, plans, rows } from "./data";

export const metadata = pageMetadata({
	title: "Unified Social Media Comment Management",
	description:
		"Manage every comment, mention and DM from one unified inbox. Reply with AI, analyze sentiment, block spam and build a CRM from your social interactions.",
	path: "/features/comment-management",
});

const CORE_VALUE = [
	{
		icon: Zap,
		title: "1-Click Response",
		description: "Reply directly from the dashboard using AI-generated contextual responses.",
	},
	{
		icon: Inbox,
		title: "Real-time Syncing",
		description: "Comments appear in your dashboard instantly as they land on social platforms.",
	},
	{
		icon: ShieldCheck,
		title: "Spam Protection",
		description: "Automatically filter and hide toxic or promotional spam using AI moderation.",
	},
	{
		icon: ChartLine,
		title: "Engagement Analytics",
		description: "Monitor reply times and sentiment scores for all social interactions.",
	},
];

export default function CommentManagementFeaturePage() {
	return (
		<>
			<PageHero
				badge={{ icon: Sparkles, label: "Unified Interaction Engine" }}
				title={
					<>
						Unified <Accent>Comment Management</Accent> <br />
						Across All Platforms
					</>
				}
				description={
					<>
						Say goodbye to tab-switching. Manage every interaction, reply with AI, and analyze
						sentiment from one powerful dashboard.
						<span className="mt-4 block text-base text-white/50">
							Trusted by <span className="font-bold text-white">18,000+ Teams</span>
						</span>
					</>
				}
				actions={[
					{ label: "Start for free", href: "/signup" },
					{ label: "Watch Demo", href: "/contact", variant: "secondary", icon: Play },
				]}
			>
				<MockupFrame
					title="Unified Inbox"
					icon={Inbox}
					aside={
						<span className="font-bold text-[10px] text-primary uppercase tracking-widest">
							14 New · AI Active
						</span>
					}
				>
					<ChatMockup
						messages={[
							{
								author: "@kushal · 2m ago",
								text: "This feature looks amazing! How do I get started?",
							},
							{ author: "AI Suggestion", text: "Thank you for asking...", ai: true },
						]}
					/>
				</MockupFrame>
			</PageHero>

			<PlatformStrip label="Manage interactions across every major network" />

			<section className="pt-20 sm:pt-28">
				<Container>
					<SectionHeading
						title={
							<>
								Manage Every Comment <br />
								<Accent>In One Place.</Accent>
							</>
						}
						description="Connect your Instagram, TikTok, LinkedIn, and YouTube accounts once. We bring all your mentions, comments, and DMs into a single interactive feed."
						className="mb-16"
					/>
					<div className="grid items-center gap-10 lg:grid-cols-2">
						<div>
							<ul className="grid gap-4 sm:grid-cols-2">
								{CORE_VALUE.map(({ icon: Icon, title, description }) => (
									<li key={title} className="rounded-2xl border border-white/10 bg-white/5 p-6">
										<span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
											<Icon className="size-6" aria-hidden="true" />
										</span>
										<h3 className="font-bold text-lg text-white">{title}</h3>
										<p className="mt-2 text-sm text-white/60">{description}</p>
									</li>
								))}
							</ul>
							<CtaLink href="/signup" className="mt-8">
								Try it for free
							</CtaLink>
						</div>
						<MockupFrame title="Live Mentions" icon={MessageSquare}>
							<ListMockup
								rows={[
									{
										title: "@travel_creator",
										subtitle: "Instagram · Love the new filter! 😍",
										avatar: "IG",
									},
									{
										title: "@tiktok_expert",
										subtitle: "TikTok · How long until you launch?",
										avatar: "TT",
									},
									{
										title: "@tech_reviewer",
										subtitle: "YouTube · Is this coming to Android soon?",
										avatar: "YT",
									},
									{
										title: "@marketing_pro",
										subtitle: "LinkedIn · Great insights on AI growth.",
										avatar: "in",
									},
								]}
							/>
						</MockupFrame>
					</div>
				</Container>
			</section>

			<FeatureSplitSection
				items={[
					{
						title: "Inbox Comment Box",
						description:
							"Interact with your audience without leaving your workspace. Our inbox handles all types of interactions—comments, mentions, and private messages—in one thread.",
						bullets: [
							"Integrated direct messages and comments",
							"Instant platform-to-dashboard syncing",
							"Priority filtering for VIP customers",
							"Team internal notes and assignments",
						],
						visual: (
							<MockupFrame title="Inbox" icon={MessageCircle}>
								<ListMockup
									rows={[
										{ title: "VIP customer", subtitle: "Direct message", status: "Priority" },
										{
											title: "New mention",
											subtitle: "Comment",
											status: "Assigned",
											tone: "muted",
										},
										{ title: "Team note", subtitle: "Internal", status: "Resolved", tone: "muted" },
									]}
								/>
							</MockupFrame>
						),
						reverse: true,
					},
					{
						title: "#1 Powered Auto Replies",
						description:
							"Respond to every customer in seconds. Our AI analyzes the sentiment and context of each message and suggests high-quality, professional replies for you to approve or automate.",
						bullets: [
							"Contextual AI-powered transcriptions",
							"Sentiment-based response selection",
							"Smart tag-to-reply automation",
							"Human-in-the-loop review available",
						],
						visual: (
							<MockupFrame title="AI suggested reply ready" icon={Sparkles}>
								<ChatMockup
									messages={[
										{
											author: "Customer",
											text: "This product saved my workflow! Highly recommend it.",
										},
										{
											author: "AI Reply",
											text: "Thank you so much! We're glad it helped you save time. ✨",
											ai: true,
										},
									]}
								/>
							</MockupFrame>
						),
						reverse: false,
					},
					{
						title: "AI & CRM Contact Management",
						description:
							"Know your audience better. Every comment builds a profile. Track your most engaged users, their sentiment trends, and past interaction history automatically.",
						bullets: [
							"Automated contact scoring and tagging",
							"Full history of interactions per user",
							"Lead identification from comments",
							"Bulk contact data export",
						],
						stats: [
							{ icon: Users, label: "Total Contacts", value: "15k+" },
							{ icon: MessageSquare, label: "Total Interactions", value: "250k" },
							{ icon: Shield, label: "Spam Blocked", value: "99.9%" },
							{ icon: Send, label: "Avg Response", value: "1.2s" },
						],
						reverse: true,
					},
				]}
			/>

			<FeaturePlanSections
				comparisonLabel="Comment Features"
				pricingDescription="Scale your interactions without losing the personal touch. Select the plan that fits your social volume."
				plans={plans}
				rows={rows}
				faqDescription="Everything you need to know about SocialflyAI unified comment management."
				faqs={faqs}
			/>
		</>
	);
}
