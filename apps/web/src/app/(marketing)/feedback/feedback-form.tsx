"use client";

import { CircleCheck, Send, Star } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { focusRing } from "@/components/marketing/primitives";
import { cn } from "@/lib/utils";

const CATEGORIES = ["Features", "Design", "Performance", "Pricing"];

/** Feedback form. Submission is local only (no backend call); it shows a thank-you state. */
export function FeedbackForm() {
	const id = useId();
	const [rating, setRating] = useState(0);
	const [categories, setCategories] = useState<string[]>([]);
	const [submitted, setSubmitted] = useState(false);

	const toggleCategory = (category: string) =>
		setCategories((current) =>
			current.includes(category)
				? current.filter((item) => item !== category)
				: [...current, category],
		);

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setSubmitted(true);
	};

	const reset = () => {
		setRating(0);
		setCategories([]);
		setSubmitted(false);
	};

	if (submitted) {
		return (
			<div
				role="status"
				className="mx-auto max-w-lg animate-scale-in rounded-[40px] border border-primary/20 bg-primary/5 p-8 text-center backdrop-blur-md sm:p-12"
			>
				<div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-primary text-black shadow-[0_0_40px_rgba(11,226,125,0.2)]">
					<CircleCheck className="size-8" aria-hidden="true" />
				</div>
				<h2 className="mb-4 font-bold text-3xl text-white tracking-[-0.04em]">
					Feedback Received!
				</h2>
				<p className="mb-8 text-white/60 leading-relaxed">
					Thank you for helping us shape the future of SocialflyAI. Our product team reviews every
					suggestion.
				</p>
				<button
					type="button"
					onClick={reset}
					className={`rounded font-bold text-primary underline underline-offset-8 ${focusRing}`}
				>
					Submit another suggestion
				</button>
			</div>
		);
	}

	return (
		<form
			onSubmit={handleSubmit}
			className="space-y-10 rounded-3xl border border-white/10 bg-white/5 p-6 text-left shadow-2xl backdrop-blur-md sm:p-8 lg:p-12"
		>
			<fieldset className="flex flex-col items-center justify-center rounded-2xl border border-white/5 bg-white/5 p-6 sm:p-8">
				<legend className="sr-only">Overall experience rating</legend>
				<p
					aria-hidden="true"
					className="mb-6 font-bold text-[10px] text-white/50 uppercase tracking-widest"
				>
					Overall Experience
				</p>
				<div className="flex gap-2 sm:gap-4">
					{[1, 2, 3, 4, 5].map((star) => (
						<button
							key={star}
							type="button"
							onClick={() => setRating(star)}
							aria-label={`${star} star${star > 1 ? "s" : ""}`}
							aria-pressed={rating === star}
							className={`rounded-md p-1 transition-transform hover:scale-125 ${focusRing}`}
						>
							<Star
								aria-hidden="true"
								className={cn(
									"size-8",
									rating >= star ? "fill-primary text-primary" : "text-white/20",
								)}
							/>
						</button>
					))}
				</div>
			</fieldset>

			<div>
				<fieldset>
					<legend className="mb-4 block font-black text-[10px] text-white/50 uppercase tracking-widest">
						What could we improve?
					</legend>
					<div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
						{CATEGORIES.map((category) => {
							const active = categories.includes(category);
							return (
								<button
									key={category}
									type="button"
									aria-pressed={active}
									onClick={() => toggleCategory(category)}
									className={cn(
										"h-12 rounded-xl border font-bold text-white text-xs transition",
										active
											? "border-primary/60 bg-primary/15"
											: "border-white/10 bg-white/5 hover:border-primary/40 hover:bg-white/10",
										focusRing,
									)}
								>
									{category}
								</button>
							);
						})}
					</div>
				</fieldset>
				<label htmlFor={`${id}-details`} className="sr-only">
					Tell us more about your experience
				</label>
				<textarea
					id={`${id}-details`}
					name="details"
					rows={5}
					required
					placeholder="Tell us more about your experience or suggest a new feature..."
					className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 p-6 font-medium text-white transition placeholder:text-white/30 focus:border-primary/40 focus:outline-none focus:ring-4 focus:ring-primary/10"
				/>
			</div>

			<button
				type="submit"
				className={`flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary font-bold text-black shadow-xl transition hover:scale-[1.02] hover:bg-primary-hover active:scale-95 ${focusRing}`}
			>
				Submit Feedback
				<Send className="size-4" aria-hidden="true" />
			</button>
		</form>
	);
}
