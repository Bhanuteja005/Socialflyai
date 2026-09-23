import Image from "next/image";
import Link from "next/link";
import { focusRing } from "../primitives";

export function HeroSection() {
	return (
		<section className="relative px-4 pt-32 pb-20 sm:px-6 lg:px-10 lg:pt-40 lg:pb-28">
			<div
				aria-hidden="true"
				className="absolute top-40 left-1/2 h-[400px] w-[min(600px,100%)] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,#0BE27D_0%,transparent_70%)] opacity-30 blur-[120px]"
			/>
			<div className="relative mx-auto max-w-4xl text-center">
				<div className="mb-6 flex justify-center">
					<Image
						src="/assets/landingpage/Group 606.svg"
						alt="Recognized as an Innovative AI content planner"
						width={508}
						height={56}
						priority
						className="h-auto w-full max-w-md"
					/>
				</div>
				<h1 className="flex flex-col items-center font-medium text-4xl text-white leading-tight tracking-[-0.05em] sm:text-5xl md:text-[64px] md:leading-[72px]">
					<span>Connect Everything. Create</span>
					<span className="md:whitespace-nowrap">Consistently. Improve Continuously.</span>
				</h1>

				<div className="relative mx-auto mt-20 max-w-xl sm:mt-24">
					<div
						aria-hidden="true"
						className="pointer-events-none absolute top-1/2 left-1/2 z-0 size-[80vw] max-h-[80vmin] max-w-[80vmin] -translate-x-1/2 -translate-y-1/2 bg-[url('/assets/landingpage/Ellipse%202484.svg')] bg-center bg-no-repeat [background-size:100%_100%]"
					/>
					<Link
						href="/signup"
						className={`group relative z-10 flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.06] p-2 pr-6 text-left transition-colors hover:border-primary/40 ${focusRing}`}
					>
						<span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary">
							<Image
								src="/assets/landingpage/Vector.svg"
								alt=""
								width={24}
								height={24}
								className="size-5 shrink-0 brightness-0"
							/>
						</span>
						<span className="min-w-0 flex-1 truncate text-white">
							Start generating your content...
						</span>
						<span className="hidden font-semibold text-primary text-sm sm:inline">Try it free</span>
					</Link>
				</div>
			</div>
		</section>
	);
}
