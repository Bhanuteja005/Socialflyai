import { ArrowRight, LayoutDashboard, type LucideIcon, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ComparisonTable } from "./comparison-table";
import { CtaSection } from "./cta-section";
import { FaqSection } from "./faq-section";
import { FeatureSplit } from "./feature-split";
import {
	BarChartMockup,
	CalendarMockup,
	type ChatMessage,
	ChatMockup,
	DashboardMockup,
	ListMockup,
	MockupFrame,
	type MockupRow,
} from "./mockups";
import {
	Container,
	CtaLink,
	Eyebrow,
	focusRing,
	Glow,
	headingDisplay,
	SectionHeading,
} from "./primitives";

/** Illustration placed beside a feature block. */
export type CompetitorVisual =
	| { kind: "dashboard" }
	| {
			kind: "price";
			competitorPlan: string;
			competitorPrice: string;
			socialflyPrice: string;
			note: string;
	  }
	| { kind: "inbox"; messages: { author: string; text: string; time: string }[]; badge: string }
	| { kind: "list"; title: string; icon?: LucideIcon; rows: MockupRow[] }
	| { kind: "calendar"; title: string }
	| { kind: "chat"; title: string; messages: ChatMessage[]; action?: string }
	| { kind: "chart"; title: string; caption?: string };

export type CompetitorFeature = {
	title: ReactNode;
	description: string;
	bullets?: string[];
	cards?: { title: string; description: string; icon?: LucideIcon }[];
	chips?: string[];
	visual: CompetitorVisual;
};

export type CompetitorPageData = {
	/** Competitor display name, e.g. "Buffer". */
	name: string;
	hero: {
		title: ReactNode;
		description: string;
		/** Rating / social-proof line shown next to the primary CTA. */
		socialProof?: ReactNode;
	};
	/** Static product preview (replaces the legacy video/photo block). */
	preview?: { title: string; subtitle: string; tags?: string[] };
	comparison: {
		eyebrow?: string;
		title?: ReactNode;
		subtitle?: string;
		rows: { feature: string; competitor: string | boolean; socialfly: string | boolean }[];
	};
	/** Render the comparison table before the feature blocks (legacy page order). */
	comparisonFirst?: boolean;
	features: CompetitorFeature[];
	faq?: {
		title?: ReactNode;
		subtitle?: string;
		items: { question: string; answer: string }[];
		showAllLink?: boolean;
	};
	cta?: { title: ReactNode; label?: string; footnote?: string };
};

const AVATAR_INITIALS = ["JM", "SK", "AL", "RB", "TW"];

function SocialProof({ children }: { children: ReactNode }) {
	return (
		<div className="flex items-center gap-4">
			<div aria-hidden="true" className="flex -space-x-2">
				{AVATAR_INITIALS.map((initials) => (
					<span
						key={initials}
						className="flex size-10 items-center justify-center rounded-full border-2 border-black bg-gradient-to-br from-primary/40 to-white/10 font-bold text-[11px] text-white"
					>
						{initials}
					</span>
				))}
			</div>
			<p className="text-left text-sm text-white/50">{children}</p>
		</div>
	);
}

function CompetitorHero({ name, hero }: Pick<CompetitorPageData, "name" | "hero">) {
	return (
		<section className="relative overflow-hidden pt-32 pb-16 lg:pt-44 lg:pb-20">
			<Glow className="opacity-25" />
			<Container size="md" className="relative text-center">
				<Eyebrow icon={Sparkles} className="mb-8 uppercase">
					SocialflyAI vs {name}
				</Eyebrow>
				<h1 className={`${headingDisplay} md:text-[64px] md:leading-[72px]`}>{hero.title}</h1>
				<p className="mx-auto mt-6 max-w-2xl text-base text-white/60 leading-relaxed md:text-lg">
					{hero.description}
				</p>
				<div className="mt-10 flex flex-col items-center justify-center gap-6 sm:flex-row">
					<CtaLink href="/signup" className="w-full sm:w-auto">
						Start for free
					</CtaLink>
					{hero.socialProof ? <SocialProof>{hero.socialProof}</SocialProof> : null}
				</div>
			</Container>
		</section>
	);
}

function ProductPreview({ preview }: { preview: NonNullable<CompetitorPageData["preview"]> }) {
	return (
		<section className="relative py-16 sm:py-20">
			<Container size="lg">
				<SectionHeading title={preview.title} description={preview.subtitle} className="mb-12" />
				<figure className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#050505] shadow-2xl">
					<Image
						src="/assets/landingpage/DASHBOARD 3.svg"
						alt="SocialflyAI dashboard preview"
						width={1096}
						height={642}
						className="h-auto w-full opacity-80"
					/>
					<div
						aria-hidden="true"
						className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"
					/>
					<figcaption className="absolute bottom-4 left-4 flex items-center gap-2 rounded-xl border border-white/10 bg-black/60 px-3 py-1.5 font-medium text-white/80 text-xs backdrop-blur-md sm:bottom-8 sm:left-8 sm:text-sm">
						<span aria-hidden="true" className="size-2 rounded-full bg-primary" />
						Live dashboard preview
					</figcaption>
				</figure>
				{preview.tags && preview.tags.length > 0 ? (
					<ul className="mt-10 flex flex-wrap justify-center gap-x-10 gap-y-4 text-white/60">
						{preview.tags.map((tag) => (
							<li key={tag} className="flex items-center gap-2">
								<span aria-hidden="true" className="size-2 rounded-full bg-primary" />
								<span className="font-bold text-sm uppercase tracking-widest">{tag}</span>
							</li>
						))}
					</ul>
				) : null}
			</Container>
		</section>
	);
}

function Visual({ visual }: { visual: CompetitorVisual }) {
	switch (visual.kind) {
		case "dashboard":
			return <DashboardMockup />;
		case "price":
			return (
				<div
					aria-hidden="true"
					className="space-y-6 rounded-3xl border border-white/5 bg-white/[0.02] p-6 backdrop-blur-xl sm:p-8"
				>
					<div className="flex items-center justify-between border-white/5 border-b pb-6">
						<span className="font-medium text-white/60">{visual.competitorPlan}</span>
						<span className="font-bold text-white/40 text-xl line-through">
							{visual.competitorPrice}
						</span>
					</div>
					<div className="flex items-center justify-between text-primary">
						<span className="font-bold text-lg">SocialflyAI</span>
						<span className="font-black text-3xl">{visual.socialflyPrice}</span>
					</div>
					<div className="space-y-3 pt-2">
						<div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
							<div className="h-full w-full bg-primary shadow-[0_0_10px_#0BE27D]" />
						</div>
						<p className="text-center font-black text-[10px] text-white/30 uppercase tracking-widest">
							{visual.note}
						</p>
					</div>
				</div>
			);
		case "inbox":
			return (
				<div
					aria-hidden="true"
					className="relative rounded-[32px] border border-white/10 bg-[#080808] p-5 pb-10 shadow-2xl sm:p-8 sm:pb-12"
				>
					<ul className="space-y-4">
						{visual.messages.map((message) => (
							<li
								key={message.author}
								className="flex gap-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4"
							>
								<span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/5 font-bold text-white/60 text-xs">
									{message.author.slice(0, 2).toUpperCase()}
								</span>
								<div className="min-w-0 flex-1">
									<div className="mb-1 flex items-center justify-between">
										<span className="font-bold text-white text-xs">{message.author}</span>
										<span className="text-[10px] text-white/30">{message.time}</span>
									</div>
									<p className="text-white/50 text-xs">{message.text}</p>
								</div>
							</li>
						))}
					</ul>
					<div className="absolute right-6 -bottom-3 flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-black text-[10px] text-black shadow-[0_10px_30px_rgba(11,226,125,0.4)]">
						<Sparkles className="size-3" />
						{visual.badge}
					</div>
				</div>
			);
		case "list":
			return (
				<MockupFrame title={visual.title} icon={visual.icon ?? LayoutDashboard}>
					<ListMockup rows={visual.rows} />
				</MockupFrame>
			);
		case "calendar":
			return (
				<MockupFrame title={visual.title} icon={LayoutDashboard}>
					<CalendarMockup />
				</MockupFrame>
			);
		case "chat":
			return (
				<MockupFrame title={visual.title} icon={Sparkles}>
					<ChatMockup messages={visual.messages} />
					{visual.action ? (
						<div className="mt-4 flex justify-end">
							<span className="rounded-lg bg-primary px-4 py-2 font-black text-[10px] text-black tracking-wider">
								{visual.action}
							</span>
						</div>
					) : null}
				</MockupFrame>
			);
		case "chart":
			return (
				<MockupFrame title={visual.title} icon={LayoutDashboard}>
					<BarChartMockup caption={visual.caption} />
				</MockupFrame>
			);
	}
}

function FeatureBlocks({ features }: { features: CompetitorFeature[] }) {
	return (
		<section className="py-20 sm:py-24">
			<Container size="lg" className="space-y-28 lg:space-y-36">
				{features.map((feature, index) => (
					<FeatureSplit
						// biome-ignore lint/suspicious/noArrayIndexKey: static, ordered content blocks
						key={index}
						reverse={index % 2 === 1}
						title={feature.title}
						description={feature.description}
						bullets={feature.bullets}
						chips={feature.chips?.map((label) => ({ label }))}
						cards={feature.cards?.map((card) => ({ ...card, icon: card.icon ?? Sparkles }))}
						visual={<Visual visual={feature.visual} />}
					/>
				))}
			</Container>
		</section>
	);
}

/** Data-driven "SocialflyAI vs <competitor>" landing page. */
export function CompetitorPage({ data }: { data: CompetitorPageData }) {
	const comparison = (
		<ComparisonTable
			className="bg-white/[0.02]"
			caption={`SocialflyAI vs ${data.name} feature comparison`}
			columns={[data.name, "SocialflyAI"]}
			highlightColumn={1}
			falseStyle="cross"
			title={
				<>
					{data.comparison.eyebrow ? (
						<span className="mb-4 block font-bold text-primary text-sm uppercase tracking-widest">
							{data.comparison.eyebrow}
						</span>
					) : null}
					{data.comparison.title ?? "Why Teams Choose SocialflyAI"}
				</>
			}
			description={data.comparison.subtitle}
			rows={data.comparison.rows.map((row) => ({
				feature: row.feature,
				values: [row.competitor, row.socialfly],
			}))}
		/>
	);
	const features = data.features.length > 0 ? <FeatureBlocks features={data.features} /> : null;

	return (
		<>
			<CompetitorHero name={data.name} hero={data.hero} />
			{data.preview ? <ProductPreview preview={data.preview} /> : null}
			{data.comparisonFirst ? (
				<>
					{comparison}
					{features}
				</>
			) : (
				<>
					{features}
					{comparison}
				</>
			)}
			{data.faq ? (
				<>
					<FaqSection
						title={data.faq.title}
						description={data.faq.subtitle}
						items={data.faq.items}
						className={data.faq.showAllLink ? "pb-8 sm:pb-10" : undefined}
					/>
					{data.faq.showAllLink ? (
						<div className="pb-16 text-center">
							<Link
								href="/faq"
								className={`inline-flex items-center gap-2 rounded-full border border-white/10 px-8 py-4 text-white/80 transition-colors hover:bg-white/5 ${focusRing}`}
							>
								View all FAQs
								<ArrowRight className="size-4" aria-hidden="true" />
							</Link>
						</div>
					) : null}
				</>
			) : null}
			{data.cta ? (
				<CtaSection title={data.cta.title} ctaLabel={data.cta.label} footnote={data.cta.footnote} />
			) : null}
		</>
	);
}
