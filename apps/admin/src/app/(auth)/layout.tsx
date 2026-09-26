import { Building2, Layers, ScrollText, Send, ShieldCheck, Sparkles, Users } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { StaffBadge } from "@/components/common";

const tools = [
	{ icon: Building2, label: "Organizations" },
	{ icon: Users, label: "Users" },
	{ icon: Send, label: "Publishing" },
	{ icon: Sparkles, label: "AI usage" },
	{ icon: Layers, label: "Queues" },
	{ icon: ScrollText, label: "Audit log" },
];

/** The canvas pixel field, masked to fade out; `className` tints it. */
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

/**
 * Staff sign-in. Same monochrome language as the product, but "staff console" everywhere, the
 * violet staff marker and the audit notice up front, so nobody signs in here thinking it is
 * the product.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
	return (
		<div className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
			{/* Ink in light mode, a near-black surface in dark: the panel reads dark in both themes. */}
			<aside className="relative hidden overflow-hidden bg-ink p-10 text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col dark:border-border dark:border-r dark:bg-surface">
				<PixelField
					className="[--pixel:rgb(255_255_255/0.22)]"
					mask="[mask-image:radial-gradient(ellipse_80%_60%_at_35%_40%,black_20%,transparent_80%)]"
				/>
				<div className="relative flex items-center gap-2 font-medium text-[16px]">
					<Image
						src="/assets/socialflyai_logo/socialflyailogo.png"
						alt=""
						width={28}
						height={28}
						className="rounded-md"
					/>
					SocialFly <span className="text-white/50">Admin</span>
				</div>

				<div className="relative my-auto grid max-w-md gap-8 py-12">
					<span className="flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-white/80">
						<ShieldCheck className="size-6" aria-hidden="true" />
					</span>
					<div className="grid gap-3">
						<p className="text-balance font-pixel text-[28px] leading-[1.2]">
							The staff console for every SocialFly workspace.
						</p>
						<p className="text-sm text-white/60">
							Support customers, watch publishing health and manage AI budgets.
						</p>
					</div>
					<ul className="grid grid-cols-2 gap-2" aria-label="What's inside">
						{tools.map(({ icon: Icon, label }) => (
							<li
								key={label}
								className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[13px] text-white/75"
							>
								<Icon className="size-4 text-white/50" aria-hidden="true" />
								{label}
							</li>
						))}
					</ul>
				</div>

				<p className="relative flex items-center gap-2 text-white/45 text-xs">
					<span className="size-1.5 rounded-full bg-violet" aria-hidden="true" />
					Every change made here is written to the audit log.
				</p>
			</aside>

			<main className="relative flex min-h-dvh flex-col px-4 py-6 sm:px-8">
				<PixelField mask="bottom-auto h-[460px] [mask-image:radial-gradient(ellipse_70%_100%_at_50%_0%,black_20%,transparent_75%)]" />
				<div className="relative flex items-center justify-between gap-3 lg:hidden">
					<span className="flex items-center gap-2 font-medium text-[15px]">
						<Image
							src="/assets/socialflyai_logo/socialflyailogo.png"
							alt=""
							width={24}
							height={24}
							className="rounded-md"
						/>
						SocialFly <span className="text-muted-foreground">Admin</span>
					</span>
				</div>
				<div className="relative mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-10">
					<div className="rounded-3xl border border-border bg-surface-raised p-6 sm:p-8">
						<StaffBadge className="mb-5" />
						{children}
					</div>
				</div>
				<p className="relative text-center text-muted-foreground text-xs">
					Internal SocialFly staff console. Every change here is audited.
				</p>
			</main>
		</div>
	);
}
