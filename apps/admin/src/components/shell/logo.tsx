import Image from "next/image";
import Link from "next/link";

export function Logo({ className }: { className?: string }) {
	return (
		<Link href="/" className={className} aria-label="SocialFly Admin overview">
			<span className="flex items-center gap-2 font-semibold text-[15px] tracking-tight">
				<Image
					src="/assets/socialflyai_logo/socialflyailogo.png"
					alt=""
					width={22}
					height={22}
					className="rounded-[5px]"
				/>
				SocialFly <span className="text-violet">Admin</span>
			</span>
		</Link>
	);
}
