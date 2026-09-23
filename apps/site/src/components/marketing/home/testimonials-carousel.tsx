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

/** Three-up carousel; the centre card is emphasised. */
export function TestimonialsCarousel({ testimonials }: { testimonials: Testimonial[] }) {
	const [active, setActive] = useState(1);
	const count = testimonials.length;
	if (count === 0) return null;

	const at = (offset: number) => testimonials[(active + offset + count) % count];
	const visible = [at(-1), at(0), at(1)];

	return (
		<div>
			<ul aria-live="polite" className="mt-16 grid gap-6 sm:grid-cols-3">
				{visible.map((item, index) =>
					item ? (
						<li
							key={item.name}
							aria-hidden={index !== 1}
							className={cn(
								"flex h-full flex-col rounded-2xl p-6 transition-opacity duration-300",
								index === 1
									? "z-10 bg-[#1a1a1a] opacity-100 shadow-lg"
									: "hidden bg-[#111111] opacity-30 sm:flex",
							)}
						>
							<p className="text-sm text-white/70 leading-relaxed">{item.text}</p>
							<div className="mt-auto flex items-center gap-3 pt-6">
								<div
									aria-hidden="true"
									className="flex size-12 shrink-0 items-center justify-center rounded-full font-semibold text-black text-sm"
									style={{ background: item.avatarBg }}
								>
									{item.initials}
								</div>
								<div>
									<p className="font-medium text-white">{item.name}</p>
									<p className="text-white/50 text-xs">{item.location}</p>
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
					className={`flex size-10 items-center justify-center rounded-lg border border-white/10 bg-[#1a1a1a] text-white/70 transition hover:bg-white/5 hover:text-white ${focusRing}`}
				>
					<ChevronLeft className="size-5" aria-hidden="true" />
				</button>
				<button
					type="button"
					onClick={() => setActive((value) => (value + 1) % count)}
					aria-label="Next testimonial"
					className={`flex size-10 items-center justify-center rounded-lg border border-white/10 bg-[#1a1a1a] text-white/70 transition hover:bg-white/5 hover:text-white ${focusRing}`}
				>
					<ChevronRight className="size-5" aria-hidden="true" />
				</button>
			</div>
		</div>
	);
}
