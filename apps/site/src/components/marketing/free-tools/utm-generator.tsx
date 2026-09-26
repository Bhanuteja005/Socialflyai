"use client";

import { Copy, Trash } from "lucide-react";
import { useId, useMemo, useState } from "react";
import {
	copyToClipboard,
	toolButtonPrimary,
	toolButtonSecondary,
	toolControl,
	toolLabel,
	toolPanel,
} from "./tool-ui";

type UtmField = "url" | "source" | "medium" | "campaign" | "content" | "term";

const FIELDS: {
	name: UtmField;
	label: string;
	placeholder: string;
	hint: string;
	required: boolean;
}[] = [
	{
		name: "url",
		label: "Website URL",
		placeholder: "https://example.com",
		hint: "The full website URL (e.g. https://www.example.com)",
		required: true,
	},
	{
		name: "source",
		label: "UTM Source",
		placeholder: "google, facebook, newsletter",
		hint: "Referrer: (e.g. google, newsletter)",
		required: true,
	},
	{
		name: "medium",
		label: "UTM Medium",
		placeholder: "cpc, email, social",
		hint: "Marketing medium (e.g. cpc, banner, email)",
		required: true,
	},
	{
		name: "campaign",
		label: "UTM Campaign",
		placeholder: "summer_sale, product_launch",
		hint: "Product, slogan, promo code",
		required: true,
	},
	{
		name: "content",
		label: "UTM Content",
		placeholder: "logolink, text_link",
		hint: "Used for A/B tests and content-targeted ads",
		required: false,
	},
	{
		name: "term",
		label: "UTM Term",
		placeholder: "running_shoes, marketing_software",
		hint: "Identify paid keywords",
		required: false,
	},
];

const EMPTY: Record<UtmField, string> = {
	url: "",
	source: "",
	medium: "",
	campaign: "",
	content: "",
	term: "",
};

/** Builds the tagged URL; returns "" while the base URL is missing or invalid. */
export function buildUtmUrl(values: Record<UtmField, string>): string {
	const raw = values.url.trim();
	if (!raw) return "";
	const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
	try {
		const url = new URL(withProtocol);
		const params: [UtmField, string][] = [
			["source", "utm_source"],
			["medium", "utm_medium"],
			["campaign", "utm_campaign"],
			["content", "utm_content"],
			["term", "utm_term"],
		];
		for (const [field, param] of params) {
			const value = values[field].trim();
			if (value) url.searchParams.set(param, value);
		}
		return url.toString();
	} catch {
		return "";
	}
}

export function UtmGenerator() {
	const baseId = useId();
	const [values, setValues] = useState<Record<UtmField, string>>(EMPTY);
	const generatedUrl = useMemo(() => buildUtmUrl(values), [values]);
	const invalidUrl = values.url.trim() !== "" && generatedUrl === "";

	return (
		<div className={toolPanel}>
			<div className="grid gap-6 md:grid-cols-2">
				{FIELDS.map((field) => {
					const id = `${baseId}-${field.name}`;
					const showError = field.name === "url" && invalidUrl;
					return (
						<div key={field.name}>
							<label htmlFor={id} className={toolLabel}>
								{field.label}{" "}
								{field.required ? (
									<span className="text-brand-text">*</span>
								) : (
									<span className="text-subtle-foreground normal-case tracking-normal">
										(Optional)
									</span>
								)}
							</label>
							<input
								id={id}
								name={field.name}
								type={field.name === "url" ? "url" : "text"}
								inputMode={field.name === "url" ? "url" : undefined}
								value={values[field.name]}
								onChange={(event) =>
									setValues((prev) => ({ ...prev, [field.name]: event.target.value }))
								}
								placeholder={field.placeholder}
								aria-invalid={showError || undefined}
								aria-describedby={`${id}-hint`}
								className={toolControl}
							/>
							<p
								id={`${id}-hint`}
								className={`mt-2 text-xs ${showError ? "text-danger" : "text-subtle-foreground"}`}
							>
								{showError ? "Please enter a valid website URL." : field.hint}
							</p>
						</div>
					);
				})}
			</div>

			<div className="mt-8 border-border border-t pt-8">
				<label htmlFor={`${baseId}-result`} className={toolLabel}>
					Generated UTM URL
				</label>
				<output
					id={`${baseId}-result`}
					aria-live="polite"
					className={`block min-h-[100px] break-all rounded-2xl border bg-surface p-5 text-base ${
						generatedUrl
							? "border-border-strong text-brand-text"
							: "border-border text-subtle-foreground italic"
					}`}
				>
					{generatedUrl || "Fill in the required fields above to generate a URL..."}
				</output>
				<div className="mt-5 flex flex-col gap-3 sm:flex-row">
					<button
						type="button"
						disabled={!generatedUrl}
						onClick={() => copyToClipboard(generatedUrl, "UTM URL copied to clipboard")}
						className={toolButtonPrimary}
					>
						<Copy className="size-4" aria-hidden="true" />
						Copy URL
					</button>
					<button type="button" onClick={() => setValues(EMPTY)} className={toolButtonSecondary}>
						<Trash className="size-4" aria-hidden="true" />
						Clear all
					</button>
				</div>
			</div>
		</div>
	);
}
