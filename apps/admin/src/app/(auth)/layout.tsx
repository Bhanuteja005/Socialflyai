import Image from "next/image";
import type { ReactNode } from "react";
import { StaffBadge } from "@/components/common";

export default function AuthLayout({ children }: { children: ReactNode }) {
	return (
		<div className="flex min-h-dvh flex-col bg-surface px-4 py-8">
			<main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
				<div className="mb-8 flex flex-col items-center gap-3">
					<span className="flex items-center gap-2 font-semibold text-lg tracking-tight">
						<Image
							src="/assets/socialflyai_logo/socialflyailogo.png"
							alt=""
							width={28}
							height={28}
							className="rounded-md"
						/>
						SocialFly Admin
					</span>
					<StaffBadge />
				</div>
				<div className="rounded-xl border border-border bg-surface-raised p-6 shadow-xs">
					{children}
				</div>
			</main>
			<p className="text-center text-muted-foreground text-xs">
				Internal SocialFly staff console. Every change here is audited.
			</p>
		</div>
	);
}
