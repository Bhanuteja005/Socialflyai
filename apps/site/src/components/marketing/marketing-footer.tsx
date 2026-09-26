import { ArrowRight, Mail } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { LOGIN_URL, SIGNUP_URL } from "@/components/marketing/app-links";
import { focusRing } from "./primitives";
import {
	ALL_FREE_TOOLS_LINK,
	FEATURE_LINKS,
	FEATURED_COMPARISONS,
	FEATURED_FREE_TOOLS,
	LEARN_LINKS,
	type NavLink,
	SOLUTION_LINKS,
	SUPPORT_EMAIL,
} from "./site-config";

const PLATFORMS = [
	{ name: "Instagram", logo: "instagram" },
	{ name: "Facebook", logo: "facebook" },
	{ name: "X (Twitter)", logo: "x" },
	{ name: "LinkedIn", logo: "linkedin" },
	{ name: "TikTok", logo: "tiktok" },
	{ name: "YouTube", logo: "youtube" },
];

const COMPANY_COLUMN: NavLink[] = [
	{ label: "About us", href: "/about" },
	{ label: "Contact us", href: "/contact" },
	{ label: "Log in", href: LOGIN_URL },
	{ label: "Create account", href: SIGNUP_URL },
];

const linkClass = `rounded transition-colors duration-150 hover:text-foreground ${focusRing}`;

function FooterColumn({ title, links, more }: { title: string; links: NavLink[]; more?: NavLink }) {
	const headingId = `footer-${title.toLowerCase().replace(/\s+/g, "-")}`;
	return (
		<div>
			<h2 id={headingId} className="font-medium text-foreground text-sm">
				{title}
			</h2>
			<ul aria-labelledby={headingId} className="mt-4 space-y-2.5 text-muted-foreground text-sm">
				{links.map((link) => (
					<li key={link.href}>
						<Link href={link.href} className={linkClass}>
							{link.label}
						</Link>
					</li>
				))}
				{more && (
					<li>
						<Link
							href={more.href}
							className={`group inline-flex items-center gap-1 font-medium text-brand-text ${focusRing} rounded`}
						>
							{more.label}
							<ArrowRight
								className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
								aria-hidden="true"
							/>
						</Link>
					</li>
				)}
			</ul>
		</div>
	);
}

/** The whole footer uses the site's main sans font, like the homepage headline. */
export function MarketingFooter() {
	const year = new Date().getFullYear();
	return (
		<footer className="px-3 pt-4 pb-3 font-sans sm:px-4 sm:pb-4">
			<div className="relative mx-auto w-full max-w-[1280px] overflow-hidden rounded-3xl border border-border bg-surface-raised">
				<div
					aria-hidden="true"
					className="bg-glow pointer-events-none absolute inset-x-0 top-0 h-64 opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent)]"
				/>

				<div className="relative px-6 pt-12 sm:px-10 lg:px-14 lg:pt-14">
					{/* Brand row: identity on the left, actions and platforms on the right. */}
					<div className="flex flex-col gap-8 border-border border-b pb-10 lg:flex-row lg:items-end lg:justify-between">
						<div className="max-w-md">
							<Link
								href="/"
								aria-label="SocialFly AI home"
								className={`inline-flex items-center gap-2 rounded-full ${focusRing}`}
							>
								<Image
									src="/assets/socialflyai_logo/socialflyailogo.png"
									alt=""
									width={28}
									height={28}
									className="size-7"
								/>
								<span className="font-medium text-foreground text-lg tracking-tight">
									SocialFly
								</span>
							</Link>
							<p className="mt-4 text-muted-foreground text-sm leading-6">
								Plan, create, schedule and analyze every social channel from one AI workspace.
							</p>
							<ul className="mt-5 flex flex-wrap gap-2" aria-label="Supported platforms">
								{PLATFORMS.map((platform) => (
									<li
										key={platform.name}
										title={platform.name}
										className="flex size-9 items-center justify-center rounded-xl border border-border bg-white"
									>
										<Image
											src={`/assets/applogos/${platform.logo}.svg`}
											alt={platform.name}
											width={18}
											height={18}
											className="size-[18px]"
										/>
									</li>
								))}
							</ul>
						</div>

						<div className="flex flex-wrap items-center gap-2">
							<a
								href={`mailto:${SUPPORT_EMAIL}`}
								className={`inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-muted-foreground text-sm transition-colors duration-150 hover:border-border-strong hover:text-foreground ${focusRing}`}
							>
								<Mail className="size-4" aria-hidden="true" />
								{SUPPORT_EMAIL}
							</a>
							<Link
								href={SIGNUP_URL}
								className={`group inline-flex h-10 items-center gap-1.5 rounded-full bg-brand pr-4 pl-5 font-medium text-brand-foreground text-sm transition-colors duration-150 hover:bg-brand-hover ${focusRing}`}
							>
								Start free
								<ArrowRight
									className="size-4 transition-transform duration-150 group-hover:translate-x-0.5"
									aria-hidden="true"
								/>
							</Link>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-x-6 gap-y-10 pt-10 sm:grid-cols-3 lg:grid-cols-6">
						<FooterColumn title="Product" links={FEATURE_LINKS} />
						<FooterColumn title="Solutions" links={SOLUTION_LINKS} />
						<FooterColumn
							title="Free tools"
							links={FEATURED_FREE_TOOLS}
							more={ALL_FREE_TOOLS_LINK}
						/>
						<FooterColumn title="Compare" links={FEATURED_COMPARISONS} />
						<FooterColumn title="Resources" links={LEARN_LINKS} />
						<FooterColumn title="Company" links={COMPANY_COLUMN} />
					</div>
				</div>

				{/* Oversized wordmark in the main font, cropped by the panel's bottom edge. */}
				<div
					aria-hidden="true"
					className="pointer-events-none relative mt-12 flex select-none justify-center overflow-hidden px-4"
				>
					<span className="translate-y-[16%] bg-gradient-to-b from-foreground/[0.16] to-foreground/[0.02] bg-clip-text font-medium font-sans text-[17vw] text-transparent leading-[0.85] tracking-[-0.06em] lg:text-[210px]">
						SocialflyAI
					</span>
				</div>

				<div className="relative flex flex-col items-center justify-between gap-4 border-border border-t px-6 py-5 text-muted-foreground text-sm sm:px-10 md:flex-row lg:px-14">
					<p>&copy; {year} SocialflyAI. All rights reserved.</p>
					<ul className="flex flex-wrap justify-center gap-x-6 gap-y-2">
						<li>
							<Link href="/privacy-policy" className={linkClass}>
								Privacy Policy
							</Link>
						</li>
						<li>
							<Link href="/terms-and-conditions" className={linkClass}>
								Terms
							</Link>
						</li>
						<li>
							<a href="/sitemap.xml" className={linkClass}>
								Sitemap
							</a>
						</li>
					</ul>
				</div>
			</div>
		</footer>
	);
}
