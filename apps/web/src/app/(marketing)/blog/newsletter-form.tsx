"use client";

import { Mail } from "lucide-react";
import { type FormEvent, useId } from "react";
import { focusRing } from "@/components/marketing/primitives";
import { toast } from "@/components/ui/toast";

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
					className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-white/40"
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
					className="w-full rounded-2xl border border-white/10 bg-black/40 py-4 pr-6 pl-12 text-sm text-white transition focus:border-primary/40 focus:outline-none"
				/>
			</div>
			<button
				type="submit"
				className={`w-full rounded-2xl bg-primary px-8 py-4 font-black text-black text-sm uppercase tracking-widest shadow-[0_0_30px_rgba(11,226,125,0.2)] transition hover:scale-105 active:scale-95 sm:w-auto ${focusRing}`}
			>
				Subscribe
			</button>
		</form>
	);
}
