import Image from "next/image";
import { cn } from "@/lib/utils";
import { GridLines, HomeEyebrow, homeHeading } from "./home-primitives";

type Card = { src: string; alt: string; width: number; height: number };

const story = (n: number): Card => ({
	src: `/assets/dashboard/inspiration/Instagram story - ${n}.png`,
	alt: `Instagram story inspiration ${n}`,
	width: 227,
	height: 403,
});
const post = (n: number): Card => ({
	src: `/assets/dashboard/inspiration/Instagram post - ${n}.png`,
	alt: `Instagram post inspiration ${n}`,
	width: 228,
	height: 284,
});

/** Staggered masonry columns; offsets only apply on large screens. */
const COLUMNS: { offset: string; cards: Card[] }[] = [
	{ offset: "lg:translate-y-16", cards: [story(1)] },
	{ offset: "lg:translate-y-6", cards: [post(1), story(4)] },
	{ offset: "lg:translate-y-0", cards: [story(2), story(5)] },
	{ offset: "lg:translate-y-8", cards: [story(3), post(5)] },
	{ offset: "lg:translate-y-24", cards: [post(2)] },
];

function InspirationCard({ card }: { card: Card }) {
	return (
		<div className="group relative overflow-hidden rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
			<Image
				src={card.src}
				alt={card.alt}
				width={card.width}
				height={card.height}
				sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw"
				className="h-auto w-full object-cover transition-transform duration-500 group-hover:scale-105"
			/>
			<div className="absolute inset-0 bg-black/10 transition-colors group-hover:bg-black/0" />
			<div className="absolute inset-x-3 bottom-3 rounded-2xl border border-white/10 bg-black/40 p-2.5 backdrop-blur-sm sm:inset-x-4 sm:bottom-4 sm:p-3">
				<div className="flex items-center gap-3">
					<div
						aria-hidden="true"
						className="size-8 shrink-0 rounded-full bg-[linear-gradient(135deg,#0BE27D,#0099ff)] sm:size-10"
					/>
					<div className="min-w-0">
						<p className="truncate font-medium text-sm text-white">walterwhite</p>
						<p className="truncate text-white/50 text-xs">@walterwhite</p>
					</div>
				</div>
			</div>
		</div>
	);
}

export function InspirationSection() {
	return (
		<section className="relative overflow-hidden bg-black px-4 pt-24 pb-40 sm:px-6 lg:px-10">
			<GridLines />
			<div className="relative mx-auto max-w-6xl">
				<div className="text-center">
					<HomeEyebrow>Inspiration</HomeEyebrow>
					<h2 className={homeHeading}>Find Inspiration</h2>
					<p className="mx-auto mt-4 max-w-xl text-base text-white/60">
						Fuel Your Creativity or Discover Fresh Content Ideas.
					</p>
				</div>

				<div className="mt-16 grid grid-cols-2 items-start gap-4 sm:grid-cols-3 lg:grid-cols-5 lg:gap-6">
					{COLUMNS.map((column) => (
						<div key={column.cards[0]?.src} className={cn("flex flex-col gap-4", column.offset)}>
							{column.cards.map((card) => (
								<InspirationCard key={card.src} card={card} />
							))}
						</div>
					))}
				</div>
			</div>

			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-64 bg-gradient-to-b from-transparent to-black"
			/>
		</section>
	);
}
