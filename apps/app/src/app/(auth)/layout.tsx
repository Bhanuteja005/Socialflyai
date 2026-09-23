import { CalendarCheck2, ShieldCheck, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import type { ReactNode } from "react";
import { SITE_URL } from "@/lib/urls";

export const metadata: Metadata = {
	robots: { index: false, follow: true },
};

const points = [
	{ icon: CalendarCheck2, text: "Plan a month of posts across every channel in one calendar." },
	{ icon: Sparkles, text: "Per-platform previews and limits, checked before you publish." },
	{ icon: ShieldCheck, text: "Roles for your whole team, from viewers to owners." },
];

export default function AuthLayout({ children }: { children: ReactNode }) {
	return (
		<div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
			<aside className="relative hidden overflow-hidden bg-[#050807] p-10 text-white lg:flex lg:flex-col">
				<div
					className="pointer-events-none absolute inset-0 opacity-70"
					style={{
						background:
							"radial-gradient(60% 50% at 20% 10%, rgb(11 226 125 / 0.28), transparent 70%), radial-gradient(50% 40% at 90% 90%, rgb(11 226 125 / 0.14), transparent 70%)",
					}}
					aria-hidden="true"
				/>
				<div
					className="pointer-events-none absolute inset-0 opacity-[0.07]"
					style={{
						backgroundImage:
							"linear-gradient(rgb(255 255 255) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255) 1px, transparent 1px)",
						backgroundSize: "44px 44px",
					}}
					aria-hidden="true"
				/>
				<a href={SITE_URL} className="relative flex items-center gap-2 font-semibold text-lg">
					<Image
						src="/assets/socialflyai_logo/socialflyailogo.png"
						alt=""
						width={28}
						height={28}
						className="rounded-md"
					/>
					SocialFly AI
				</a>
				<div className="relative mt-auto max-w-md">
					<p className="font-semibold text-3xl leading-tight tracking-tight">
						Every channel. One calendar.
						<span className="block text-[#0be27d]">Zero copy-paste.</span>
					</p>
					<ul className="mt-8 grid gap-4">
						{points.map(({ icon: Icon, text }) => (
							<li key={text} className="flex items-start gap-3 text-sm text-white/75">
								<span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5">
									<Icon className="size-4 text-[#0be27d]" aria-hidden="true" />
								</span>
								<span className="pt-1">{text}</span>
							</li>
						))}
					</ul>
				</div>
				<p className="relative mt-12 text-white/40 text-xs">
					© {new Date().getFullYear()} SocialFly AI
				</p>
			</aside>

			<main className="flex flex-col px-4 py-8 sm:px-8">
				<a
					href={SITE_URL}
					className="flex items-center gap-2 self-start font-semibold text-[15px] lg:hidden"
					aria-label="SocialFly AI home"
				>
					<Image
						src="/assets/socialflyai_logo/socialflyailogo.png"
						alt=""
						width={24}
						height={24}
						className="rounded-[5px]"
					/>
					SocialFly AI
				</a>
				<div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
					{children}
				</div>
				<p className="text-center text-muted-foreground text-xs">
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
