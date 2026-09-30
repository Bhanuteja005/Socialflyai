import { CalendarCheck2, ShieldCheck, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import type { ReactNode } from "react";
import { SITE_URL } from "@/lib/urls";

export const metadata: Metadata = {
	robots: { index: false, follow: true },
};

const points = [
	{ icon: CalendarCheck2, text: "One calendar for every channel" },
	{ icon: Sparkles, text: "Per-platform previews and limits" },
	{ icon: ShieldCheck, text: "Roles for your whole team" },
];

// Relative weight of each sketched post (white alpha): the preview stays monochrome.
const WEEK = [
	{ day: "Mon", posts: [0.5, 0.25] },
	{ day: "Tue", posts: [0.35] },
	{ day: "Wed", posts: [0.25, 0.5, 0.15] },
	{ day: "Thu", posts: [] },
	{ day: "Fri", posts: [0.35, 0.2] },
];

/**
 * A static sketch of the product (week calendar + a scheduled post), so the sign-in page
 * shows what you get rather than describing it. Purely decorative: hidden from AT.
 */
function ProductPreview() {
	return (
		<div className="relative mx-auto w-full max-w-[480px]" aria-hidden="true">
			<div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
				<div className="mb-3 flex items-center justify-between">
					<span className="font-medium text-[13px] text-white/80">This week</span>
					<span className="rounded-full bg-white/[0.06] px-2 py-0.5 font-mono text-[11px] text-white/50">
						12 scheduled
					</span>
				</div>
				<div className="grid grid-cols-5 gap-2">
					{WEEK.map((d) => (
						<div
							key={d.day}
							className="flex min-h-28 flex-col gap-1.5 rounded-xl border border-white/[0.06] bg-white/[0.03] p-2"
						>
							<span className="font-mono text-[10px] text-white/40">{d.day}</span>
							{d.posts.map((weight, i) => (
								<span
									// biome-ignore lint/suspicious/noArrayIndexKey: static decoration
									key={i}
									className="h-4 rounded-[5px] border-l-2 bg-white/[0.07]"
									style={{ borderColor: `rgb(255 255 255 / ${weight})` }}
								/>
							))}
						</div>
					))}
				</div>
			</div>
			<div className="absolute -right-8 -bottom-16 w-64 rounded-2xl border border-white/10 bg-ink p-3 shadow-2xl dark:bg-surface-raised">
				<div className="flex items-center gap-2">
					<span className="flex size-7 items-center justify-center rounded-full bg-white/10 font-medium text-[11px] text-white/80">
						BC
					</span>
					<div className="grid gap-0.5">
						<span className="font-medium text-[12px] text-white/90">Brewline Coffee</span>
						<span className="font-mono text-[10px] text-white/45">Tue · 9:30 AM</span>
					</div>
					<span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 font-medium text-[10px] text-white/80">
						Scheduled
					</span>
				</div>
				<div className="mt-2.5 grid gap-1">
					<span className="h-1.5 w-full rounded-full bg-white/10" />
					<span className="h-1.5 w-4/5 rounded-full bg-white/10" />
				</div>
			</div>
			<div className="absolute -top-5 -left-5 flex items-center gap-2 rounded-2xl border border-white/10 bg-ink px-3 py-2 shadow-2xl dark:bg-surface-raised">
				<span className="font-medium font-mono text-[13px] text-white tabular-nums">+24%</span>
				<span className="text-[11px] text-white/55">engagement this month</span>
			</div>
		</div>
	);
}

/** The canvas pixel field, masked to fade out; `className` tints and positions it. */
function PixelField({ className, mask }: { className?: string; mask: string }) {
	return (
		<div
			aria-hidden="true"
			className={`pointer-events-none absolute inset-0 overflow-hidden ${mask}`}
		>
			<div className={`bg-glow absolute inset-0 ${className ?? ""}`} />
		</div>
	);
}

export default function AuthLayout({ children }: { children: ReactNode }) {
	return (
		<div className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
			{/* Ink in light mode, a near-black surface in dark: the panel reads dark in both themes. */}
			<aside className="relative hidden overflow-hidden bg-ink p-10 text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col dark:border-border dark:border-r dark:bg-surface">
				<PixelField
					className="[--pixel:rgb(255_255_255/0.22)]"
					mask="[mask-image:radial-gradient(ellipse_80%_60%_at_40%_40%,black_20%,transparent_80%)]"
				/>
				<a
					href={SITE_URL}
					className="relative flex items-center gap-2 self-start font-medium text-[16px]"
				>
					<Image
						src="/assets/socialflyai_logo/socialflyailogo.png"
						alt=""
						width={28}
						height={28}
						className="rounded-md"
					/>
					SocialFly AI
				</a>

				<div className="relative flex flex-1 items-center justify-center py-14">
					<ProductPreview />
				</div>

				<div className="relative grid max-w-lg gap-5">
					<p className="font-pixel text-[28px] leading-[1.2]">
						Every channel. One calendar.{" "}
						<span className="block text-white/50">Zero copy-paste.</span>
					</p>
					<ul className="flex flex-wrap gap-2">
						{points.map(({ icon: Icon, text }) => (
							<li
								key={text}
								className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[12px] text-white/70"
							>
								<Icon className="size-3.5 text-white/50" aria-hidden="true" />
								{text}
							</li>
						))}
					</ul>
					<p className="font-mono text-white/35 text-xs">
						© {new Date().getFullYear()} SocialFly AI
					</p>
				</div>
			</aside>

			<main className="relative flex min-h-dvh flex-col px-4 py-6 sm:px-8">
				<PixelField mask="bottom-auto h-[460px] [mask-image:radial-gradient(ellipse_70%_100%_at_50%_0%,black_20%,transparent_75%)]" />
				<a
					href={SITE_URL}
					className="relative flex items-center gap-2 self-start font-medium text-[15px] lg:hidden"
					aria-label="SocialFly AI home"
				>
					<Image
						src="/assets/socialflyai_logo/socialflyailogo.png"
						alt=""
						width={24}
						height={24}
						className="rounded-md"
					/>
					SocialFly AI
				</a>
				<div className="relative mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-10">
					<div className="rounded-3xl border border-border bg-surface-raised p-6 sm:p-8">
						{children}
					</div>
				</div>
				<p className="relative text-center text-muted-foreground text-xs">
					By continuing you agree to our{" "}
					<a
						href={`${SITE_URL}/terms-and-conditions`}
						className="underline underline-offset-2 hover:text-foreground"
					>
						Terms
					</a>{" "}
					and{" "}
					<a
						href={`${SITE_URL}/privacy-policy`}
						className="underline underline-offset-2 hover:text-foreground"
					>
						Privacy Policy
					</a>
					.
				</p>
			</main>
		</div>
	);
}
