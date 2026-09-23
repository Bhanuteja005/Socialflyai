import { ChevronDown } from "lucide-react";
import Image from "next/image";
import { GridLines, HomeEyebrow, homeHeading } from "./home-primitives";

/**
 * Landing page product showcase. Mask: 1512×756 with a 1095-wide window at (208.5, 114.5);
 * the 1096×642 dashboard is fitted into that window.
 */
export function ProductPreviewSection() {
	const maskW = 1512;
	const maskH = 756;
	const winW = 1095;
	const dashFitH = winW * (642 / 1096);
	return (
		<section className="-mt-16 px-4 pb-16 sm:-mt-28 sm:px-6 sm:pb-20 lg:-mt-44 lg:px-10 lg:pb-24">
			<div
				className="relative mx-auto w-full max-w-[100rem] overflow-hidden rounded-xl shadow-2xl sm:rounded-2xl"
				style={{ aspectRatio: `${maskW} / ${maskH}` }}
			>
				<div
					className="absolute z-0 overflow-hidden"
					style={{
						left: `${(208.5 / maskW) * 100}%`,
						top: `${(114.5 / maskH) * 100}%`,
						width: `${(winW / maskW) * 100}%`,
						height: `${(dashFitH / maskH) * 100}%`,
					}}
				>
					<Image
						src="/assets/landingpage/DASHBOARD 3.svg"
						alt=""
						width={1096}
						height={642}
						className="h-full w-full object-contain object-[0%_0%] opacity-30"
					/>
				</div>
				<Image
					src="/assets/landingpage/Mask group.svg"
					alt="SocialflyAI dashboard preview"
					width={1512}
					height={756}
					className="absolute inset-0 z-10 h-full w-full object-cover object-[0%_0%]"
				/>
			</div>
		</section>
	);
}

export function TrustedPartnersSection() {
	return (
		<section className="px-4 pt-16 pb-24 sm:px-6 lg:px-10">
			<div className="mx-auto max-w-6xl text-center">
				<HomeEyebrow className="mb-3 border-white/10 bg-white/[0.04] text-white/80">
					Our Trusted Partners
				</HomeEyebrow>
				<div className="flex items-center justify-center opacity-80 grayscale">
					<Image
						src="/assets/landingpage/Group 1272628477.svg"
						alt="Logos of our trusted partners"
						width={1700}
						height={140}
						className="h-auto max-w-full"
					/>
				</div>
			</div>
		</section>
	);
}

const CORE_CARDS = [
	{ src: "/assets/landingpage/Group 1272628481.svg", alt: "AI image generation" },
	{ src: "/assets/landingpage/Group 1272628485.svg", alt: "Content to-do list" },
];

export function CoreFeaturesSection() {
	return (
		<section className="relative bg-[linear-gradient(180deg,#000_0%,#051a0f_50%,#000_100%)] px-4 pb-24 sm:px-6 lg:px-10">
			<GridLines />
			<div className="relative mx-auto max-w-6xl">
				<div className="text-center">
					<HomeEyebrow className="border-[#424242] bg-black/30">Core features</HomeEyebrow>
					<h2 className={homeHeading}>Built for Effortless Content</h2>
					<p className="mx-auto mt-4 max-w-xl text-base text-white/60">
						Intelligent systems working quietly behind every successful post.
					</p>
				</div>

				<div className="mt-16 grid gap-6 md:grid-cols-3">
					{CORE_CARDS.map((card) => (
						<div
							key={card.src}
							className="relative w-full overflow-hidden rounded-[24px] bg-[#042214]/50 backdrop-blur-sm"
						>
							<Image
								src={card.src}
								alt={card.alt}
								width={417}
								height={542}
								className="h-auto w-full"
							/>
						</div>
					))}

					{/* Workspace card: the SVG leaves blank fields that we fill with live text. */}
					<div className="relative w-full overflow-hidden rounded-[24px] bg-[#042214]/50 backdrop-blur-sm">
						<Image
							src="/assets/landingpage/Group 1272628484.svg"
							alt="Create a workspace"
							width={417}
							height={542}
							className="h-auto w-full"
						/>
						<div aria-hidden="true">
							<div className="absolute top-[32.5%] left-[19.8%] flex h-[12.3%] w-[60.4%] items-center justify-between px-4 font-medium text-sm text-white">
								<span>Croco Studio</span>
								<ChevronDown className="size-4 text-white/60" />
							</div>
							<div className="absolute top-[49.1%] left-[22.3%] flex h-[8.7%] w-[55.4%] items-center px-3 text-sm text-white/90">
								John Mathew
							</div>
							<div className="absolute top-[57.5%] left-[22.3%] flex h-[8.7%] w-[55.4%] items-center px-3 text-sm text-white/40">
								Grok Personal brand
							</div>
							<div className="absolute top-[68.3%] left-[22.3%] flex h-[8.7%] w-[55.4%] items-center justify-center font-bold text-black text-sm">
								+ Add workspace
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}

type ShowcaseProps = {
	eyebrow: string;
	title: string;
	description: string;
	image: { src: string; alt: string; width: number; height: number };
	/** Put the image on the left on large screens. */
	imageFirst?: boolean;
	background: string;
};

function SplitShowcase({
	eyebrow,
	title,
	description,
	image,
	imageFirst,
	background,
}: ShowcaseProps) {
	return (
		<section className={`relative py-24 lg:py-32 ${background}`}>
			<GridLines />
			<div className="relative grid w-full grid-cols-1 items-center gap-12 overflow-hidden lg:grid-cols-2 lg:gap-0">
				<div
					className={
						imageFirst
							? "order-1 flex max-w-xl flex-col items-start px-4 py-12 sm:px-6 lg:order-2 lg:max-w-none lg:py-16 lg:pr-16 lg:pl-24 xl:pr-24 xl:pl-32"
							: "flex max-w-xl flex-col items-start px-4 py-12 sm:px-6 lg:max-w-none lg:py-16 lg:pr-16 lg:pl-16 xl:pl-24 2xl:pl-32"
					}
				>
					<HomeEyebrow variant="green" className="mb-8">
						{eyebrow}
					</HomeEyebrow>
					<h2 className={homeHeading}>{title}</h2>
					<p className="mt-5 max-w-md text-base text-white/50 leading-relaxed">{description}</p>
				</div>
				<Image
					src={image.src}
					alt={image.alt}
					width={image.width}
					height={image.height}
					className={
						imageFirst
							? "order-2 h-auto w-full justify-self-start rounded-r-3xl lg:order-1 lg:w-auto lg:max-w-full"
							: "h-auto w-full justify-self-end rounded-l-3xl lg:w-auto lg:max-w-full"
					}
				/>
			</div>
		</section>
	);
}

export function UnifiedCalendarSection() {
	return (
		<SplitShowcase
			eyebrow="Smart Control"
			title="Unified Content Calendar"
			description="Plan, schedule, and manage posts across all platforms from one intelligent calendar."
			image={{
				src: "/assets/landingpage/BUDGET PLANNER 1.svg",
				alt: "Unified content calendar dashboard",
				width: 759,
				height: 665,
			}}
			background="bg-[linear-gradient(180deg,#000000_0%,#020b05_50%,#000000_100%)]"
		/>
	);
}

export function TaskPipelineSection() {
	return (
		<SplitShowcase
			eyebrow="Task Pipeline"
			title="Move Tasks Forward Effortlessly"
			description="Drag, drop, and organize your content workflow from idea to published."
			image={{
				src: "/assets/landingpage/BUDGET PLANNER 2.svg",
				alt: "Task pipeline board",
				width: 803,
				height: 665,
			}}
			imageFirst
			background="bg-[linear-gradient(180deg,#000_0%,#001a0d_40%,#002211_60%,#000_100%)]"
		/>
	);
}

export function AnalyticsSection() {
	return (
		<section className="relative bg-[linear-gradient(180deg,#000_0%,#001a0d_50%,#000_100%)] px-4 py-24 sm:px-6 lg:px-10">
			<GridLines />
			<div className="relative mx-auto max-w-5xl">
				<div className="text-center">
					<HomeEyebrow className="border-white/10 bg-black/50">Analytics</HomeEyebrow>
					<h2 className={homeHeading}>See What&apos;s Working</h2>
					<p className="mx-auto mt-4 max-w-xl text-base text-white/60">
						Monitor engagement, growth, and trends across all your social channels.
					</p>
				</div>
				<div className="relative mx-auto mt-16 max-w-5xl">
					<Image
						src="/assets/landingpage/Group 1272628492 1.svg"
						alt="Analytics dashboard showing engagement and growth charts"
						width={1141}
						height={546}
						className="h-auto w-full"
					/>
				</div>
			</div>
		</section>
	);
}
