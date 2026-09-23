import { cn } from "@socialfly/ui/utils";
import {
	Bot,
	Briefcase,
	Calendar,
	ChartColumn,
	CircleCheck,
	Clock,
	type LucideIcon,
	MessageSquare,
	Sparkles,
	Zap,
} from "lucide-react";
import Link from "next/link";
import { pageMetadata } from "@/components/marketing/metadata";
import { PageHero } from "@/components/marketing/page-hero";
import { Accent, Container, focusRing, headingSection } from "@/components/marketing/primitives";

export const metadata = pageMetadata({
	title: "Features — AI Social Media Management Tools",
	description:
		"Explore SocialflyAI features: scheduling, calendar planner, analytics, best time to post, AI captions, AI replies, comment management and agency tools.",
	path: "/features",
});

type Tile = { title: string; description: string; href: string; icon: LucideIcon };

const CORE: Tile[] = [
	{
		title: "Scheduling",
		description: "Automate your presence globally. Cross-platform execution with one-click logic.",
		href: "/features/scheduling",
		icon: Zap,
	},
	{
		title: "Calendar",
		description: "Unified drag-and-drop workflow. Visualize your brand's growth journey.",
		href: "/features/calendar-planner",
		icon: Calendar,
	},
];

const SUPPORTING: Tile[] = [
	{
		title: "Best Time",
		description: "Algorithm-first timing.",
		href: "/features/best-time",
		icon: Clock,
	},
	{
		title: "AI Caption",
		description: "Viral hooks that stop the scroll.",
		href: "/features/ai-caption-generator",
		icon: Sparkles,
	},
	{
		title: "Comments",
		description: "Turn talk into community.",
		href: "/features/comment-management",
		icon: CircleCheck,
	},
];

const MORE: Tile[] = [
	{
		title: "AI Assistant",
		description: "Your 24/7 creative partner for strategy and execution.",
		href: "/features/ai-assistant",
		icon: Bot,
	},
	{
		title: "Agency Suite",
		description: "Scale your client management without the headaches.",
		href: "/features/agency",
		icon: Briefcase,
	},
];

const PILLARS = [
	{
		title: "Proactive Intelligence",
		description:
			"We don't wait for your command. SocialflyAI constantly scans your niche for viral opportunities and proactively suggests your next best move.",
	},
	{
		title: "Unified Logic",
		description:
			"Our AI maintains your brand's unique voice across all platforms. No more fragmented messaging—one brain, infinite reach.",
	},
	{
		title: "Engagement Loops",
		description:
			"Real growth happens in the comments. Our autonomous interaction engine builds community while you sleep, with human-level nuance.",
	},
];

const cardBase = cn(
	"group relative block h-full overflow-hidden border border-white/10 text-left transition-colors hover:border-primary/40",
	focusRing,
);

function IconBadge({ icon: Icon, size = "md" }: { icon: LucideIcon; size?: "md" | "lg" }) {
	return (
		<span
			className={cn(
				"flex items-center justify-center border border-white/10 bg-white/5 text-primary transition-transform group-hover:scale-110",
				size === "lg" ? "mb-10 size-16 rounded-3xl" : "mb-6 size-12 rounded-2xl",
			)}
		>
			<Icon className={size === "lg" ? "size-8" : "size-6"} aria-hidden="true" />
		</span>
	);
}

export default function FeaturesIndexPage() {
	return (
		<>
			<PageHero
				title={
					<>
						The <Accent>Intelligence</Accent> <br />
						Behind the Growth.
					</>
				}
				description="Powerful automation and AI-driven insights designed to scale your social presence with human-level nuance."
			/>

			<section className="pb-20 sm:pb-28">
				<Container>
					<h2 className="sr-only">All features</h2>
					<ul className="mb-24 grid grid-cols-1 gap-6 md:grid-cols-6">
						{CORE.map((tile) => (
							<li key={tile.href} className="md:col-span-3">
								<Link
									href={tile.href}
									className={cn(cardBase, "rounded-[40px] bg-[#0A0F0C] p-8 sm:p-10")}
								>
									<div
										aria-hidden="true"
										className="pointer-events-none absolute inset-0 bg-[radial-gradient(#0BE27D_1px,transparent_1px)] opacity-10 [background-size:20px_20px]"
									/>
									<div className="relative">
										<IconBadge icon={tile.icon} size="lg" />
										<span className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 font-black text-[10px] text-primary uppercase tracking-widest">
											<Sparkles className="size-3" aria-hidden="true" />
											Core Workflow
										</span>
										<h3 className="mb-6 font-bold text-3xl text-white">{tile.title}</h3>
										<p className="mb-10 text-lg text-white/60 leading-relaxed">
											{tile.description}
										</p>
										<span className="font-bold text-primary text-sm uppercase tracking-widest">
											Explore Workflow &rarr;
										</span>
									</div>
								</Link>
							</li>
						))}

						<li className="md:col-span-6">
							<Link
								href="/features/analytics"
								className={cn(cardBase, "rounded-[40px] bg-white/5 p-8 hover:bg-white/10 sm:p-10")}
							>
								<div className="flex flex-col justify-between gap-10 md:flex-row md:items-center">
									<div className="flex-1">
										<IconBadge icon={ChartColumn} />
										<h3 className="mb-6 font-bold text-4xl text-white">Analytics</h3>
										<p className="max-w-xl text-lg text-white/60 leading-relaxed">
											Impact reporting at scale. Data that drives ROI for creators and brands.
											Visualize your growth journey with deep-dive performance metrics.
										</p>
									</div>
									<span className="font-bold text-primary text-sm uppercase tracking-widest">
										Analyze Data &rarr;
									</span>
								</div>
							</Link>
						</li>

						{SUPPORTING.map((tile) => (
							<li key={tile.href} className="md:col-span-2">
								<Link
									href={tile.href}
									className={cn(cardBase, "rounded-3xl bg-white/5 p-8 hover:bg-white/10")}
								>
									<IconBadge icon={tile.icon} />
									<h3 className="mb-3 font-bold text-white text-xl">{tile.title}</h3>
									<p className="mb-6 text-sm text-white/60 leading-relaxed">{tile.description}</p>
									<span className="font-bold text-primary text-xs uppercase tracking-widest opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
										Explore &rarr;
									</span>
								</Link>
							</li>
						))}

						<li className="md:col-span-6">
							<Link
								href="/features/ai-reply"
								className={cn(cardBase, "rounded-[40px] bg-[#0A0F0C] p-8 sm:p-10")}
							>
								<div className="flex flex-col justify-between gap-10 md:flex-row md:items-center">
									<div className="flex-1">
										<IconBadge icon={MessageSquare} />
										<h3 className="mb-4 font-bold text-2xl text-white">AI Reply</h3>
										<p className="max-w-2xl text-lg text-white/60 leading-relaxed">
											Engagement loops that sound like you. Maintain your brand's unique voice while
											building community on autopilot.
										</p>
									</div>
									<ul className="hidden max-w-sm flex-wrap gap-3 lg:flex">
										{["Friendly", "Witty", "Professional", "Helpful"].map((tone) => (
											<li
												key={tone}
												className="rounded-full border border-white/10 bg-white/5 px-5 py-2 font-bold text-white/60 text-xs uppercase tracking-widest"
											>
												{tone} Tone
											</li>
										))}
									</ul>
								</div>
							</Link>
						</li>
						{MORE.map((tile) => (
							<li key={tile.href} className="md:col-span-3">
								<Link
									href={tile.href}
									className={cn(cardBase, "rounded-3xl bg-white/5 p-8 hover:bg-white/10")}
								>
									<IconBadge icon={tile.icon} />
									<h3 className="mb-3 font-bold text-white text-xl">{tile.title}</h3>
									<p className="text-sm text-white/60 leading-relaxed">{tile.description}</p>
								</Link>
							</li>
						))}
					</ul>

					<div className="rounded-[40px] border border-white/10 bg-white/5 p-8 backdrop-blur-md sm:p-10 lg:p-16">
						<h2 className={cn(headingSection, "mb-12")}>
							The <Accent>AI-Native</Accent> Difference.
						</h2>
						<ul className="grid grid-cols-1 gap-12 md:grid-cols-3">
							{PILLARS.map((pillar) => (
								<li key={pillar.title}>
									<span className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-black">
										<CircleCheck className="size-6 text-primary" aria-hidden="true" />
									</span>
									<h3 className="mb-4 font-bold text-lg text-white">{pillar.title}</h3>
									<p className="text-sm text-white/60 leading-relaxed">{pillar.description}</p>
								</li>
							))}
						</ul>
					</div>
				</Container>
			</section>
		</>
	);
}
