import { Calendar, CircleCheck, LayoutGrid, MessageSquare, ShieldCheck, Users } from "lucide-react";
import { FeatureSplitSection } from "@/components/marketing/feature-split";
import { FeaturePlanSections } from "@/components/marketing/features-plan-sections";
import { pageMetadata } from "@/components/marketing/metadata";
import { CalendarMockup, ChatMockup, MockupFrame } from "@/components/marketing/mockups";
import { PageHero } from "@/components/marketing/page-hero";
import { Accent } from "@/components/marketing/primitives";
import { faqs, plans, rows } from "./data";

export const metadata = pageMetadata({
	title: "Social Media Content Calendar Planner",
	description:
		"The most intuitive social media calendar. Drag and drop posts, collaborate with approvals and preview your Instagram grid before you publish.",
	path: "/features/calendar-planner",
});

const GRID_TILES = ["g1", "g2", "g3", "g4", "g5", "g6", "g7", "g8", "g9"];

export default function CalendarPlannerFeaturePage() {
	return (
		<>
			<PageHero
				badge={{ icon: Calendar, label: "Visual Content Strategy" }}
				title={
					<>
						Visualize Your <Accent>Strategy,</Accent> <br />
						Execute Perfectly
					</>
				}
				description="The world's most intuitive social media calendar. Drag, drop, and collaborate with your team to build a 24/7 content engine."
				actions={[
					{ label: "Get started for free", href: "/signup" },
					{ label: "Invite Team", href: "/signup", variant: "secondary", icon: Users },
				]}
			>
				<MockupFrame title="Content Calendar" icon={Calendar}>
					<CalendarMockup
						posts={[
							{ day: 0, label: "Reel teaser" },
							{ day: 1, label: "Carousel" },
							{ day: 3, label: "Dragging…" },
							{ day: 4, label: "Product launch" },
							{ day: 6, label: "Live Q&A" },
						]}
					/>
				</MockupFrame>
			</PageHero>

			<FeatureSplitSection
				heading={<h2 className="sr-only">Calendar planner features</h2>}
				items={[
					{
						title: (
							<>
								Drag, Drop, <br />
								<Accent>Done.</Accent>
							</>
						),
						description:
							"Rescheduling your entire week takes seconds, not hours. Move posts across days, change times, and see your strategy update in real-time.",
						bullets: [
							"Instant day-to-day rescheduling",
							"Multi-post selection and mass-moving",
							"Visual gaps identification",
							"Lock important posts in place",
						],
						visual: (
							<MockupFrame title="This week" icon={Calendar}>
								<CalendarMockup />
							</MockupFrame>
						),
					},
					{
						title: (
							<>
								Team Collaboration <br />
								<Accent>& Approvals</Accent>
							</>
						),
						description:
							"Managing clients or a large team? Build a seamless approval workflow. Clients can leave feedback, approve posts, or request edits directly on the calendar.",
						chips: [
							{ icon: ShieldCheck, label: "Multi-Level Approvals" },
							{ icon: MessageSquare, label: "Inline Content Feedback" },
						],
						visual: (
							<MockupFrame
								title="Client Review"
								icon={Users}
								aside={
									<span className="flex items-center gap-1.5 font-bold text-primary text-xs">
										<CircleCheck className="size-4" />
										Approve Post
									</span>
								}
							>
								<ChatMockup
									messages={[
										{ author: "Client", text: "Could we use a brighter image for this one?" },
									]}
								/>
							</MockupFrame>
						),
					},
					{
						title: (
							<>
								See Your Grid, <br />
								<Accent>Before You Post.</Accent>
							</>
						),
						description:
							"Instagram aesthetics matter. Use our visual grid planner to ensure every post fits perfectly into your feed's style long before you hit schedule.",
						chips: [
							{ icon: LayoutGrid, label: "Visual Grid Preview" },
							{ label: "Theme Management" },
						],
						visual: (
							<MockupFrame title="Instagram Grid" icon={LayoutGrid}>
								<div className="grid grid-cols-3 gap-2">
									{GRID_TILES.map((tile, index) => (
										<div
											key={tile}
											className={
												index % 4 === 0
													? "aspect-square rounded-lg bg-primary/30"
													: "aspect-square rounded-lg bg-white/10"
											}
										/>
									))}
								</div>
							</MockupFrame>
						),
					},
				]}
			/>

			<FeaturePlanSections
				comparisonLabel="Calendar Features"
				pricingDescription="Every viral post starts with a single high-quality strategy. Choose the plan that's right for your volume."
				plans={plans}
				rows={rows}
				faqDescription="Everything you need to know about SocialflyAI Planner."
				faqs={faqs}
			/>
		</>
	);
}
