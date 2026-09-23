import Link from "next/link";
import { focusRing } from "./primitives";
import {
	COMPANY_LINKS,
	COMPETITOR_LINKS,
	FEATURE_LINKS,
	FREE_TOOL_LINKS,
	INTEGRATIONS,
	type NavLink,
	SOLUTION_LINKS,
} from "./site-config";

function FooterColumn({
	title,
	titleHref,
	links,
}: {
	title: string;
	titleHref?: string;
	links: NavLink[];
}) {
	const headingId = `footer-${title.toLowerCase().replace(/\s+/g, "-")}`;
	return (
		<div className="space-y-3">
			<h2 id={headingId} className="font-semibold text-white/40 text-xs uppercase tracking-wider">
				{titleHref ? (
					<Link
						href={titleHref}
						className={`rounded transition-colors hover:text-primary ${focusRing}`}
					>
						{title}
					</Link>
				) : (
					title
				)}
			</h2>
			<ul aria-labelledby={headingId} className="space-y-2 text-sm text-white/70">
				{links.map((link) => (
					<li key={link.href}>
						<Link
							href={link.href}
							className={`rounded transition-colors hover:text-white ${focusRing}`}
						>
							{link.label}
						</Link>
					</li>
				))}
			</ul>
		</div>
	);
}

export function MarketingFooter() {
	const year = new Date().getFullYear();
	return (
		<footer className="bg-[radial-gradient(ellipse_140%_70%_at_50%_60%,#001a0d_0%,#000_80%)] px-3 pt-4 pb-10 sm:px-6 lg:px-10 lg:pb-16">
			<div className="mx-auto w-full rounded-[32px] bg-black p-6 sm:p-10 lg:rounded-[40px] lg:p-16">
				<div className="grid grid-cols-1 gap-10 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
					<FooterColumn title="Features" links={FEATURE_LINKS} />
					<div className="space-y-3">
						<h2 className="font-semibold text-white/40 text-xs uppercase tracking-wider">
							Integrations
						</h2>
						<ul className="space-y-2 text-sm text-white/70">
							{INTEGRATIONS.map((name) => (
								<li key={name}>{name}</li>
							))}
						</ul>
					</div>
					<FooterColumn title="Solutions" links={SOLUTION_LINKS} />
					<FooterColumn title="Company" links={COMPANY_LINKS} />
					<FooterColumn title="Compare" links={COMPETITOR_LINKS} />
					<FooterColumn title="Free Tools" titleHref="/free-tools" links={FREE_TOOL_LINKS} />
				</div>

				<div
					aria-hidden="true"
					className="pointer-events-none mt-16 flex select-none justify-center overflow-hidden pb-4"
				>
					<span className="bg-[linear-gradient(to_bottom,#0BE27D33_0%,#0BE27D0D_100%)] bg-clip-text font-bold text-[18vw] text-transparent leading-none tracking-tighter sm:text-[12vw]">
						SocialflyAI
					</span>
				</div>

				<div className="mt-10 flex flex-col items-center justify-between gap-4 border-white/10 border-t pt-8 text-sm text-white/50 md:flex-row">
					<p>&copy; {year} SocialflyAI. All rights reserved.</p>
					<ul className="flex flex-wrap justify-center gap-x-6 gap-y-2">
						<li>
							<a
								href="/sitemap.xml"
								className={`rounded transition-colors hover:text-white ${focusRing}`}
							>
								Sitemap
							</a>
						</li>
						<li>
							<Link
								href="/terms-and-conditions"
								className={`rounded transition-colors hover:text-white ${focusRing}`}
							>
								Terms
							</Link>
						</li>
						<li>
							<Link
								href="/privacy-policy"
								className={`rounded transition-colors hover:text-white ${focusRing}`}
							>
								Privacy Policy
							</Link>
						</li>
						<li>
							<Link
								href="/contact"
								className={`rounded transition-colors hover:text-white ${focusRing}`}
							>
								Contact
							</Link>
						</li>
					</ul>
				</div>
			</div>
		</footer>
	);
}
