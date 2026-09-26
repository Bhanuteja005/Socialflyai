import { ArrowRight, LayoutDashboard, type LucideIcon, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { SIGNUP_URL } from "@/components/marketing/app-links";
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
	headingDisplay,
	PixelField,
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
						className="flex size-10 items-center justify-center rounded-full border-2 border-canvas bg-muted font-mono text-[11px] text-foreground"
					>
						{initials}
					</span>
				))}
			</div>
			<p className="text-left text-sm text-muted-foreground">{children}</p>
		</div>
	);
}

function CompetitorHero({ name, hero }: Pick<CompetitorPageData, "name" | "hero">) {
	return (
		<section className="relative overflow-hidden pt-32 pb-16 lg:pt-44 lg:pb-20">
			<PixelField />
			<Container size="md" className="relative text-center">
				<Eyebrow className="mb-8">SocialflyAI vs {name}</Eyebrow>
				<h1 className={headingDisplay}>{hero.title}</h1>
				<p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground leading-relaxed md:text-lg">
					{hero.description}
				</p>
				<div className="mt-10 flex flex-col items-center justify-center gap-6 sm:flex-row">
					<CtaLink href={SIGNUP_URL} className="w-full sm:w-auto">
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
				<figure className="relative overflow-hidden rounded-3xl border border-border bg-surface">
					<Image
						src="/assets/landingpage/DASHBOARD 3.svg"
						alt="SocialflyAI dashboard preview"
						width={1096}
						height={642}
						className="h-auto w-full grayscale invert mix-blend-multiply dark:invert-0 dark:mix-blend-normal"
					/>
					<div
						aria-hidden="true"
						className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent"
					/>
					<figcaption className="absolute bottom-4 left-4 flex items-center gap-2 rounded-xl border border-border bg-surface-raised/90 px-3 py-1.5 font-medium text-foreground text-xs sm:bottom-8 sm:left-8 sm:text-sm">
						<span aria-hidden="true" className="size-2 rounded-full bg-success" />
						Live dashboard preview
					</figcaption>
				</figure>
				{preview.tags && preview.tags.length > 0 ? (
					<ul className="mt-10 flex flex-wrap justify-center gap-x-10 gap-y-4 text-muted-foreground">
						{preview.tags.map((tag) => (
							<li key={tag} className="flex items-center gap-2">
								<span aria-hidden="true" className="size-2 rounded-full bg-success" />
								<span className="font-mono text-xs">{tag}</span>
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
					className="space-y-6 rounded-3xl border border-border bg-surface-raised p-6 sm:p-8"
				>
					<div className="flex items-center justify-between border-border border-b pb-6">
						<span className="font-medium text-muted-foreground">{visual.competitorPlan}</span>
						<span className="font-mono text-subtle-foreground text-xl tabular-nums line-through">
							{visual.competitorPrice}
						</span>
					</div>
					<div className="flex items-center justify-between text-foreground">
						<span className="font-medium text-lg">SocialflyAI</span>
						<span className="font-mono text-3xl tabular-nums">{visual.socialflyPrice}</span>
					</div>
					<div className="space-y-3 pt-2">
						<div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
							<div className="h-full w-full bg-primary" />
						</div>
						<p className="text-center font-mono text-[11px] text-subtle-foreground">
							{visual.note}
						</p>
					</div>
				</div>
			);
		case "inbox":
			return (
				<div
					aria-hidden="true"
					className="relative rounded-3xl border border-border bg-surface-raised p-5 pb-10 sm:p-8 sm:pb-12"
				>
					<ul className="space-y-4">
						{visual.messages.map((message) => (
							<li key={message.author} className="flex gap-4 rounded-2xl bg-surface p-4">
								<span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-muted-foreground text-xs">
									{message.author.slice(0, 2).toUpperCase()}
								</span>
								<div className="min-w-0 flex-1">
									<div className="mb-1 flex items-center justify-between">
										<span className="font-medium text-foreground text-xs">{message.author}</span>
										<span className="font-mono text-[10px] text-subtle-foreground">
											{message.time}
										</span>
									</div>
									<p className="text-muted-foreground text-xs">{message.text}</p>
								</div>
							</li>
						))}
					</ul>
					<div className="absolute right-6 -bottom-3 flex items-center gap-2 rounded-full bg-ink px-4 py-2 font-medium text-[11px] text-ink-foreground">
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
							<span className="rounded-full bg-ink px-4 py-2 font-medium text-[11px] text-ink-foreground">
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
			caption={`SocialflyAI vs ${data.name} feature comparison`}
			columns={[data.name, "SocialflyAI"]}
			highlightColumn={1}
			falseStyle="cross"
			title={
				<>
					{data.comparison.eyebrow ? (
						<span className="mb-4 block font-mono text-muted-foreground text-xs">
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
								className={`inline-flex items-center gap-2 rounded-full border border-border bg-surface-raised px-6 py-3 font-medium text-foreground text-sm transition-colors hover:bg-muted ${focusRing}`}
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
