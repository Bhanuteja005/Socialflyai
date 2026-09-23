import Image from "next/image";
import { cn } from "@/lib/utils";

export const PLATFORMS = [
	{ name: "Instagram", logo: "/assets/applogos/instagram.svg" },
	{ name: "TikTok", logo: "/assets/applogos/tiktok.svg" },
	{ name: "YouTube", logo: "/assets/applogos/youtube.svg" },
	{ name: "Facebook", logo: "/assets/applogos/facebook.svg" },
	{ name: "LinkedIn", logo: "/assets/applogos/linkedin.svg" },
	{ name: "Twitter/X", logo: "/assets/applogos/x.svg" },
	{ name: "Threads", logo: "/assets/applogos/threads.svg" },
	{ name: "Pinterest", logo: "/assets/applogos/pinterest.svg" },
] as const;

/** Row of supported-platform logos with a caption. */
export function PlatformStrip({
	label = "Seamlessly connects with all major platforms",
	className,
}: {
	label?: string;
	className?: string;
}) {
	return (
		<section aria-label={label} className={cn("border-white/5 border-y py-12", className)}>
			<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
				<p className="mb-8 text-center font-semibold text-sm text-white/50 uppercase tracking-wider">
					{label}
				</p>
				<ul className="grid grid-cols-2 items-center gap-6 min-[480px]:grid-cols-4 lg:grid-cols-8">
					{PLATFORMS.map((platform) => (
						<li
							key={platform.name}
							className="flex items-center justify-center gap-2 opacity-60 grayscale transition hover:opacity-100 hover:grayscale-0"
						>
							<Image src={platform.logo} alt="" width={24} height={24} className="size-6" />
							<span className="font-semibold text-sm text-white">{platform.name}</span>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}
