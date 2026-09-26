import { cn } from "@socialfly/ui/utils";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Container, SectionHeading } from "./primitives";

export type FaqItem = { question: string; answer: string };

/**
 * Accessible, JS-free accordion built on <details>/<summary>. The browser handles
 * expanded state and keyboard toggling.
 */
export function FaqList({
	items,
	defaultOpenFirst = false,
	className,
}: {
	items: FaqItem[];
	defaultOpenFirst?: boolean;
	className?: string;
}) {
	return (
		<div className={cn("space-y-3", className)}>
			{items.map((item, index) => (
				<details
					key={item.question}
					open={defaultOpenFirst && index === 0}
					// Dark keeps the original glass look; light is a white card with a hairline.
					className="group rounded-2xl border border-border bg-surface-raised transition-colors open:border-border-strong hover:border-border-strong dark:border-white/10 dark:bg-white/5 dark:backdrop-blur-md dark:open:border-primary/40 dark:open:bg-primary/5 dark:hover:border-white/20"
				>
					<summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl p-5 text-left focus-visible:outline-2 focus-visible:outline-ring sm:p-6 [&::-webkit-details-marker]:hidden">
						<span className="font-medium text-[15px] text-foreground sm:text-base">
							{item.question}
						</span>
						<span
							aria-hidden="true"
							className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-transform duration-200 group-open:rotate-45 group-open:bg-ink group-open:text-ink-foreground dark:group-open:bg-primary dark:group-open:text-black"
						>
							<Plus className="size-4" />
						</span>
					</summary>
					<div className="px-5 pb-6 text-muted-foreground leading-relaxed sm:px-6">
						{item.answer}
					</div>
				</details>
			))}
		</div>
	);
}

/** FAQPage structured data for rich results. */
export function FaqJsonLd({ items }: { items: FaqItem[] }) {
	const data = {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: items.map((item) => ({
			"@type": "Question",
			name: item.question,
			acceptedAnswer: { "@type": "Answer", text: item.answer },
		})),
	};
	return (
		<script
			type="application/ld+json"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: static JSON-LD built from page constants
			dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
		/>
	);
}

export function FaqSection({
	items,
	title = "Frequently asked questions",
	description,
	defaultOpenFirst = true,
	withJsonLd = true,
	className,
	titleClassName,
}: {
	items: FaqItem[];
	title?: ReactNode;
	description?: ReactNode;
	defaultOpenFirst?: boolean;
	withJsonLd?: boolean;
	className?: string;
	/** Overrides the heading style, e.g. to match the landing page headings. */
	titleClassName?: string;
}) {
	return (
		<section className={cn("relative py-20 sm:py-28", className)}>
			<Container>
				<SectionHeading
					title={title}
					description={description}
					className="mb-12 sm:mb-16"
					titleClassName={titleClassName}
				/>
				<FaqList items={items} defaultOpenFirst={defaultOpenFirst} className="mx-auto max-w-4xl" />
			</Container>
			{withJsonLd ? <FaqJsonLd items={items} /> : null}
		</section>
	);
}
