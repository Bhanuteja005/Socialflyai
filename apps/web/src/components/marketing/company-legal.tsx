import { Scale } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Container, Eyebrow, Glow } from "./primitives";

export type LegalSection = {
	id: number;
	title: string;
	highlight?: boolean;
	content: ReactNode;
};

/** Bulleted list used inside legal sections. */
export function LegalList({
	items,
	tone = "accent",
	className,
}: {
	items: ReactNode[];
	tone?: "accent" | "danger";
	className?: string;
}) {
	return (
		<ul className={cn("space-y-1.5 text-sm text-white/60", className)}>
			{items.map((item, index) => (
				<li
					// biome-ignore lint/suspicious/noArrayIndexKey: static legal copy in a fixed order
					key={index}
					className="flex items-start gap-2"
				>
					<span
						aria-hidden="true"
						className={cn(
							"mt-1.5 size-1.5 shrink-0 rounded-full",
							tone === "danger" ? "bg-red-400/70" : "bg-primary",
						)}
					/>
					<span>{item}</span>
				</li>
			))}
		</ul>
	);
}

/** Inline link styled for legal copy. */
export function LegalLink({ href, children }: { href: string; children: ReactNode }) {
	const external = href.startsWith("http");
	return (
		<a
			href={href}
			className="text-primary hover:underline"
			{...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
		>
			{children}
		</a>
	);
}

/** Shared layout for Privacy Policy / Terms: header, jump links, numbered section cards. */
export function LegalPage({
	title,
	dateLine,
	intro,
	sections,
	contactPrompt,
}: {
	title: string;
	dateLine: string;
	intro: ReactNode;
	sections: LegalSection[];
	contactPrompt: string;
}) {
	return (
		<div className="relative overflow-hidden">
			<Glow className="top-32 opacity-20" />
			<Container size="md" className="relative pt-32 pb-24 lg:pt-40 lg:pb-32">
				<header className="mb-14 text-center">
					<Eyebrow icon={Scale} className="mb-6 text-white/80">
						Legal
					</Eyebrow>
					<h1 className="mb-4 font-medium text-4xl text-white tracking-[-0.03em] sm:text-5xl md:text-6xl">
						{title}
					</h1>
					<p className="font-medium text-primary text-sm">{dateLine}</p>
					<p className="mx-auto mt-4 max-w-2xl text-sm text-white/50 leading-relaxed">{intro}</p>
				</header>

				<nav aria-label="Sections" className="mb-14">
					<ol className="flex flex-wrap gap-2">
						{sections.map((section) => (
							<li key={section.id}>
								<a
									href={`#section-${section.id}`}
									className="block rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-white/50 text-xs transition-colors hover:border-white/30 hover:text-white/80 focus-visible:outline-2 focus-visible:outline-primary"
								>
									{section.id}. {section.title}
								</a>
							</li>
						))}
					</ol>
				</nav>

				<div className="space-y-4">
					{sections.map((section) => (
						<section
							key={section.id}
							id={`section-${section.id}`}
							aria-labelledby={`section-${section.id}-title`}
							className={cn(
								"scroll-mt-28 overflow-hidden rounded-2xl border border-white/10 p-6 transition-colors hover:border-white/15 md:p-7",
								section.highlight
									? "bg-[linear-gradient(135deg,rgba(11,226,125,0.06)_0%,rgba(0,0,0,0.8)_60%)]"
									: "bg-white/[0.03]",
							)}
						>
							<div className="mb-5 flex items-center gap-3">
								<span
									aria-hidden="true"
									className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary font-bold text-black text-xs"
								>
									{section.id}
								</span>
								<h2 id={`section-${section.id}-title`} className="font-semibold text-lg text-white">
									{section.title}
								</h2>
							</div>
							<div className="text-sm text-white/60 leading-relaxed">{section.content}</div>
						</section>
					))}
				</div>

				<div className="mt-14 rounded-2xl border border-white/10 bg-primary/[0.04] p-8 text-center">
					<p className="mb-4 text-sm text-white/50">{contactPrompt}</p>
					<a
						href="mailto:support@socialflyai.com"
						className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 font-semibold text-black text-sm transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-95"
					>
						Contact Us
					</a>
				</div>
			</Container>
		</div>
	);
}
