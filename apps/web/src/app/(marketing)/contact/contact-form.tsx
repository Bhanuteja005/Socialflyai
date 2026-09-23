"use client";

import { Send } from "lucide-react";
import { type FormEvent, useId } from "react";
import { focusRing } from "@/components/marketing/primitives";
import { SUPPORT_EMAIL } from "@/components/marketing/site-config";
import { toast } from "@/components/ui/toast";

const labelClass = "mb-2 block font-black text-[10px] text-white/50 uppercase tracking-widest";
const fieldClass =
	"w-full rounded-2xl border border-white/10 bg-white/5 px-6 font-medium text-white transition placeholder:text-white/30 focus:border-primary/40 focus:outline-none focus:ring-4 focus:ring-primary/10";

/**
 * Contact form. There is no backend endpoint for marketing enquiries, so submitting opens the
 * visitor's mail client with a pre-filled message to the support inbox (no network request).
 */
export function ContactForm() {
	const id = useId();

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		const name = String(form.get("name") ?? "").trim();
		const email = String(form.get("email") ?? "").trim();
		const message = String(form.get("message") ?? "").trim();

		const subject = `Website enquiry from ${name || "a visitor"}`;
		const body = `${message}\n\n— ${name}${email ? ` <${email}>` : ""}`;
		window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
		toast.success("Thanks — we'll be in touch");
		event.currentTarget.reset();
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-6">
			<div>
				<label htmlFor={`${id}-name`} className={labelClass}>
					Full Name
				</label>
				<input
					id={`${id}-name`}
					name="name"
					type="text"
					autoComplete="name"
					required
					placeholder="e.g. Sarah Miller"
					className={`${fieldClass} h-14`}
				/>
			</div>
			<div>
				<label htmlFor={`${id}-email`} className={labelClass}>
					Email Address
				</label>
				<input
					id={`${id}-email`}
					name="email"
					type="email"
					autoComplete="email"
					required
					placeholder="sarah@example.com"
					className={`${fieldClass} h-14`}
				/>
			</div>
			<div>
				<label htmlFor={`${id}-message`} className={labelClass}>
					Your Message
				</label>
				<textarea
					id={`${id}-message`}
					name="message"
					rows={4}
					required
					placeholder="How can we help?"
					className={`${fieldClass} resize-none py-5`}
				/>
			</div>
			<button
				type="submit"
				className={`flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary font-bold text-black shadow-xl transition hover:scale-[1.02] hover:bg-primary-hover active:scale-95 ${focusRing}`}
			>
				Send Message
				<Send className="size-4" aria-hidden="true" />
			</button>
		</form>
	);
}
