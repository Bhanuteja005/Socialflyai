"use client";

import { cn } from "@socialfly/ui/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { focusRing } from "../primitives";

export type Testimonial = {
	initials: string;
	avatarBg: string;
	name: string;
	location: string;
	text: string;
};

/**
 * Three-up carousel; the centre card is emphasised. `dark:` classes are the original dark design;
 * light uses white cards with a hairline.
 */
export function TestimonialsCarousel({ testimonials }: { testimonials: Testimonial[] }) {
	const [active, setActive] = useState(1);
	const count = testimonials.length;
	if (count === 0) return null;

	const at = (offset: number) => testimonials[(active + offset + count) % count];
	const visible = [at(-1), at(0), at(1)];

	return (
		<div>
			<ul aria-live="polite" className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-3">
				{visible.map((item, index) =>
					item ? (
						<li
							key={item.name}
							aria-hidden={index !== 1}
							className={cn(
								"flex h-full flex-col rounded-2xl border border-black/[0.08] p-6 transition-opacity duration-300 dark:border-0",
								index === 1
									? "z-10 bg-white opacity-100 shadow-[0_12px_32px_-16px_rgb(4_21_12/0.2)] dark:bg-[#1a1a1a] dark:shadow-lg"
									: "hidden bg-white opacity-50 sm:flex dark:bg-[#111111] dark:opacity-30",
							)}
						>
							<p className="text-foreground/75 text-sm leading-relaxed dark:text-white/70">
								{item.text}
							</p>
							<div className="mt-auto flex items-center gap-3 pt-6">
								<div
									aria-hidden="true"
									className="flex size-12 shrink-0 items-center justify-center rounded-full font-semibold text-black text-sm"
									style={{ background: item.avatarBg }}
								>
									{item.initials}
								</div>
								<div>
									<p className="font-medium text-foreground dark:text-white">{item.name}</p>
									<p className="text-muted-foreground text-xs dark:text-white/50">
										{item.location}
									</p>
								</div>
							</div>
						</li>
					) : null,
				)}
			</ul>

			<div className="mt-10 flex justify-center gap-2">
				<button
					type="button"
					onClick={() => setActive((value) => (value - 1 + count) % count)}
					aria-label="Previous testimonial"
					className={`flex size-10 items-center justify-center rounded-lg border border-black/10 bg-white text-muted-foreground transition hover:bg-muted hover:text-foreground dark:border-white/10 dark:bg-[#1a1a1a] dark:text-white/70 dark:hover:bg-white/5 dark:hover:text-white ${focusRing}`}
				>
					<ChevronLeft className="size-5" aria-hidden="true" />
				</button>
				<button
					type="button"
					onClick={() => setActive((value) => (value + 1) % count)}
					aria-label="Next testimonial"
					className={`flex size-10 items-center justify-center rounded-lg border border-black/10 bg-white text-muted-foreground transition hover:bg-muted hover:text-foreground dark:border-white/10 dark:bg-[#1a1a1a] dark:text-white/70 dark:hover:bg-white/5 dark:hover:text-white ${focusRing}`}
				>
					<ChevronRight className="size-5" aria-hidden="true" />
				</button>
			</div>
		</div>
	);
}
