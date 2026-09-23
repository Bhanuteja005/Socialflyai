import { cn } from "@socialfly/ui/utils";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Container, SectionHeading } from "../primitives";

export type ToolFeature = { icon: LucideIcon; title: string; description: string };
export type ToolGuideItem = { title: string; description: string; example?: string };

/** Icon card grid ("Main Features", "Why tags matter"…). */
export function ToolFeatureGrid({
	title,
	description,
	items,
	columns = 3,
}: {
	title: ReactNode;
	description?: ReactNode;
	items: ToolFeature[];
	columns?: 2 | 3 | 4;
}) {
	return (
		<section className="py-20 sm:py-24">
			<Container>
				<SectionHeading title={title} description={description} className="mb-14" />
				<ul
					className={cn(
						"grid gap-6 sm:grid-cols-2",
						columns === 3 && "lg:grid-cols-3",
						columns === 4 && "lg:grid-cols-4",
					)}
				>
					{items.map(({ icon: Icon, title: itemTitle, description: itemDescription }) => (
						<li
							key={itemTitle}
							className="rounded-3xl border border-white/10 bg-white/5 p-6 transition-colors hover:border-primary/40 sm:p-8"
						>
							<div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
								<Icon className="size-6" aria-hidden="true" />
							</div>
							<h3 className="mb-2 font-bold text-lg text-white">{itemTitle}</h3>
							<p className="text-sm text-white/60 leading-relaxed">{itemDescription}</p>
						</li>
					))}
				</ul>
			</Container>
		</section>
	);
}

/** Numbered guide / best-practice list. */
export function ToolGuide({
	title,
	description,
	items,
	numbered = true,
}: {
	title: ReactNode;
	description?: ReactNode;
	items: ToolGuideItem[];
	numbered?: boolean;
}) {
	return (
		<section className="py-20 sm:py-24">
			<Container size="md">
				<SectionHeading title={title} description={description} className="mb-14" />
				<ol className="space-y-5">
					{items.map((item, index) => (
						<li
							key={item.title}
							className="flex gap-5 rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8"
						>
							{numbered ? (
								<span
									aria-hidden="true"
									className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-black"
								>
									{index + 1}
								</span>
							) : null}
							<div>
								<h3 className="mb-2 font-bold text-lg text-white">{item.title}</h3>
								<p className="text-white/60 leading-relaxed">{item.description}</p>
								{item.example ? (
									<p className="mt-3 text-sm">
										<span className="font-bold text-white/40 uppercase tracking-widest">
											Example:{" "}
										</span>
										<code className="text-primary">{item.example}</code>
									</p>
								) : null}
							</div>
						</li>
					))}
				</ol>
			</Container>
		</section>
	);
}

/** Free-form long copy block (headings + paragraphs). */
export function ToolProse({ title, children }: { title: ReactNode; children: ReactNode }) {
	return (
		<section className="py-20 sm:py-24">
			<Container size="md">
				<SectionHeading title={title} className="mb-12" />
				<div className="space-y-6 text-white/60 leading-relaxed [&_h3]:mt-10 [&_h3]:font-bold [&_h3]:text-white [&_h3]:text-xl">
					{children}
				</div>
			</Container>
		</section>
	);
}
