import { cn } from "@socialfly/ui/utils";
import { CircleCheck, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Container, headingSub } from "./primitives";

export type FeatureCard = { icon: LucideIcon; title: string; description: string };
export type FeatureStat = { icon?: LucideIcon; label: string; value: string };
export type FeatureChip = { icon?: LucideIcon; label: string };

export type FeatureSplitProps = {
	/** Heading; wrap the highlighted part in <Accent>. */
	title: ReactNode;
	description: ReactNode;
	bullets?: string[];
	chips?: FeatureChip[];
	cards?: FeatureCard[];
	stats?: FeatureStat[];
	/** Illustration shown beside the copy. */
	visual?: ReactNode;
	/** Put the visual on the left on large screens. */
	reverse?: boolean;
};

/** Two-column "copy + visual" block. */
export function FeatureSplit({
	title,
	description,
	bullets,
	chips,
	cards,
	stats,
	visual,
	reverse = false,
}: FeatureSplitProps) {
	return (
		<div
			className={cn(
				"flex flex-col items-center gap-12 text-left lg:gap-16",
				reverse ? "lg:flex-row-reverse" : "lg:flex-row",
			)}
		>
			<div className="w-full max-w-xl lg:flex-1">
				<h3 className={headingSub}>{title}</h3>
				<p className="mt-6 text-base text-white/60 leading-relaxed sm:text-lg">{description}</p>

				{bullets && bullets.length > 0 ? (
					<ul className="mt-8 space-y-4">
						{bullets.map((bullet) => (
							<li key={bullet} className="flex items-start gap-3 text-white/80">
								<CircleCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
								<span>{bullet}</span>
							</li>
						))}
					</ul>
				) : null}

				{chips && chips.length > 0 ? (
					<ul className="mt-8 flex flex-wrap gap-3">
						{chips.map(({ icon: Icon, label }) => (
							<li
								key={label}
								className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-2 font-semibold text-sm text-white"
							>
								{Icon ? <Icon className="size-4 text-primary" aria-hidden="true" /> : null}
								{label}
							</li>
						))}
					</ul>
				) : null}

				{cards && cards.length > 0 ? (
					<ul className="mt-8 space-y-4">
						{cards.map(({ icon: Icon, title: cardTitle, description: cardDescription }) => (
							<li
								key={cardTitle}
								className="flex items-start gap-4 rounded-2xl border border-white/10 bg-white/5 p-4"
							>
								<Icon className="mt-1 size-6 shrink-0 text-primary" aria-hidden="true" />
								<div>
									<p className="mb-1 font-bold text-white">{cardTitle}</p>
									<p className="text-sm text-white/60">{cardDescription}</p>
								</div>
							</li>
						))}
					</ul>
				) : null}
			</div>

			{visual || (stats && stats.length > 0) ? (
				<div className="w-full max-w-2xl lg:flex-1">
					{visual}
					{stats && stats.length > 0 ? <StatGrid stats={stats} /> : null}
				</div>
			) : null}
		</div>
	);
}

export function StatGrid({ stats, className }: { stats: FeatureStat[]; className?: string }) {
	return (
		<div className={cn("grid grid-cols-2 gap-4", className)}>
			{stats.map(({ icon: Icon, label, value }) => (
				<div
					key={label}
					className="group rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm transition-colors hover:border-primary/40 sm:p-6"
				>
					{Icon ? <Icon className="mb-4 size-6 text-primary" aria-hidden="true" /> : null}
					<p className="font-bold text-2xl text-white transition-colors group-hover:text-primary">
						{value}
					</p>
					<p className="mt-1 font-bold text-white/50 text-xs uppercase tracking-widest">{label}</p>
				</div>
			))}
		</div>
	);
}

/** Vertical stack of FeatureSplit blocks with alternating sides. */
export function FeatureSplitSection({
	items,
	heading,
	className,
}: {
	items: FeatureSplitProps[];
	heading?: ReactNode;
	className?: string;
}) {
	return (
		<section className={cn("py-20 sm:py-28", className)}>
			<Container>
				{heading}
				<div className="space-y-28 lg:space-y-36">
					{items.map((item, index) => (
						<FeatureSplit
							// biome-ignore lint/suspicious/noArrayIndexKey: static, ordered content blocks
							key={index}
							reverse={item.reverse ?? index % 2 === 1}
							{...item}
						/>
					))}
				</div>
			</Container>
		</section>
	);
}
