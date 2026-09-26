"use client";

import { cn } from "@socialfly/ui/utils";
import { CircleCheck, Send, Star } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { focusRing } from "@/components/marketing/primitives";

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
				className="mx-auto max-w-lg animate-scale-in rounded-3xl border border-border bg-surface-raised p-8 text-center sm:p-12"
			>
				<div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-muted text-success">
					<CircleCheck className="size-8" aria-hidden="true" />
				</div>
				<h2 className="mb-4 font-normal font-pixel text-[32px] text-foreground leading-tight">
					Feedback Received!
				</h2>
				<p className="mb-8 text-muted-foreground leading-relaxed">
					Thank you for helping us shape the future of SocialflyAI. Our product team reviews every
					suggestion.
				</p>
				<button
					type="button"
					onClick={reset}
					className={`rounded font-medium text-foreground underline underline-offset-4 ${focusRing}`}
				>
					Submit another suggestion
				</button>
			</div>
		);
	}

	return (
		<form
			onSubmit={handleSubmit}
			className="space-y-10 rounded-3xl border border-border bg-surface-raised p-6 text-left sm:p-8 lg:p-12"
		>
			<fieldset className="flex flex-col items-center justify-center rounded-2xl bg-surface p-6 sm:p-8">
				<legend className="sr-only">Overall experience rating</legend>
				<p aria-hidden="true" className="mb-6 font-mono text-muted-foreground text-xs">
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
							className={`rounded-md p-1 ${focusRing}`}
						>
							<Star
								aria-hidden="true"
								className={cn(
									"size-8",
									rating >= star ? "fill-brand text-brand" : "text-subtle-foreground",
								)}
							/>
						</button>
					))}
				</div>
			</fieldset>

			<div>
				<fieldset>
					<legend className="mb-4 block font-mono text-muted-foreground text-xs">
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
										"h-10 rounded-full border font-medium text-foreground text-sm transition",
										active
											? "border-brand bg-brand text-brand-foreground"
											: "border-border bg-surface-raised hover:border-border-strong hover:bg-muted",
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
					className="w-full resize-none rounded-xl border border-input bg-surface-raised p-4 text-foreground transition placeholder:text-subtle-foreground focus:border-border-strong focus:outline-none focus:ring-4 focus:ring-primary/10"
				/>
			</div>

			<button
				type="submit"
				className={`flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink font-medium text-ink-foreground transition-colors hover:bg-ink-hover ${focusRing}`}
			>
				Submit Feedback
				<Send className="size-4" aria-hidden="true" />
			</button>
		</form>
	);
}
