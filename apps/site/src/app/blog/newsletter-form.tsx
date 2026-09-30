"use client";

import { toast } from "@socialfly/ui/components/toast";
import { Mail } from "lucide-react";
import { type FormEvent, useId } from "react";
import { focusRing } from "@/components/marketing/primitives";

/** Newsletter sign-up. No mailing-list backend exists yet, so it only confirms locally. */
export function NewsletterForm() {
	const id = useId();

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		toast.success("Thanks — we'll be in touch");
		event.currentTarget.reset();
	};

	return (
		<form
			onSubmit={handleSubmit}
			className="mx-auto flex max-w-lg flex-col items-center justify-center gap-4 sm:flex-row"
		>
			<div className="relative w-full">
				<Mail
					className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-subtle-foreground"
					aria-hidden="true"
				/>
				<label htmlFor={id} className="sr-only">
					Email address
				</label>
				<input
					id={id}
					type="email"
					name="email"
					required
					autoComplete="email"
					placeholder="name@email.com"
					className="w-full rounded-full border border-input bg-surface-raised py-3 pr-5 pl-11 text-sm text-foreground transition focus:border-border-strong focus:outline-none"
				/>
			</div>
			<button
				type="submit"
				className={`w-full rounded-full bg-ink px-6 py-3 font-medium text-ink-foreground text-sm transition hover:bg-ink-hover sm:w-auto ${focusRing}`}
			>
				Subscribe
			</button>
		</form>
	);
}
