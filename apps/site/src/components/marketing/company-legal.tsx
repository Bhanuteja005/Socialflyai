import { cn } from "@socialfly/ui/utils";
import { Scale } from "lucide-react";
import type { ReactNode } from "react";
import { Container, Eyebrow, PixelField } from "./primitives";

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
		<ul className={cn("space-y-1.5 text-sm text-muted-foreground", className)}>
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
							tone === "danger" ? "bg-danger" : "bg-subtle-foreground",
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
			className="text-foreground underline underline-offset-2 hover:no-underline"
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
			<PixelField />
			<Container size="md" className="relative pt-32 pb-24 lg:pt-40 lg:pb-32">
				<header className="mb-14 text-center">
					<Eyebrow icon={Scale} className="mb-6">
						Legal
					</Eyebrow>
					<h1 className="mb-4 font-normal font-pixel text-[36px] text-foreground leading-[1.1] sm:text-[48px]">
						{title}
					</h1>
					<p className="font-mono text-muted-foreground text-xs">{dateLine}</p>
					<p className="mx-auto mt-4 max-w-2xl text-sm text-muted-foreground leading-relaxed">
						{intro}
					</p>
				</header>

				<nav aria-label="Sections" className="mb-14">
					<ol className="flex flex-wrap gap-2">
						{sections.map((section) => (
							<li key={section.id}>
								<a
									href={`#section-${section.id}`}
									className="block rounded-full border border-border bg-surface-raised px-3 py-1 text-muted-foreground text-xs transition-colors hover:border-border-strong hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
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
								"scroll-mt-28 overflow-hidden rounded-2xl border border-border p-6 md:p-7",
								section.highlight ? "border-border-strong bg-surface-raised" : "bg-surface-raised",
							)}
						>
							<div className="mb-5 flex items-center gap-3">
								<span
									aria-hidden="true"
									className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted font-mono text-foreground text-xs"
								>
									{section.id}
								</span>
								<h2
									id={`section-${section.id}-title`}
									className="font-medium text-lg text-foreground"
								>
									{section.title}
								</h2>
							</div>
							<div className="text-sm text-muted-foreground leading-relaxed">{section.content}</div>
						</section>
					))}
				</div>

				<div className="mt-14 rounded-3xl border border-border bg-surface-raised p-8 text-center">
					<p className="mb-4 text-sm text-muted-foreground">{contactPrompt}</p>
					<a
						href="mailto:support@socialflyai.com"
						className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 font-medium text-ink-foreground text-sm transition-colors hover:bg-ink-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
					>
						Contact Us
					</a>
				</div>
			</Container>
		</div>
	);
}
