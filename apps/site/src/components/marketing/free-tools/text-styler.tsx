"use client";

import { cn } from "@socialfly/ui/utils";
import { Copy, Download, Share2 } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { SIGNUP_URL } from "@/components/marketing/app-links";
import {
	copyToClipboard,
	downloadText,
	toolButtonSecondary,
	toolControl,
	toolLabel,
	toolPanel,
} from "./tool-ui";

type TextStyle = "bold" | "italic" | "bold-italic";

/** Unicode Mathematical Sans-Serif blocks (A–Z then a–z). */
const LETTER_BASE: Record<TextStyle, number> = {
	bold: 0x1d5d4,
	italic: 0x1d608,
	"bold-italic": 0x1d63c,
};
/** Sans-serif bold digits; there are no italic digits in Unicode. */
const BOLD_DIGIT_BASE = 0x1d7ec;

export function stylize(text: string, style: TextStyle): string {
	const base = LETTER_BASE[style];
	return Array.from(text)
		.map((char) => {
			const code = char.charCodeAt(0);
			if (code >= 65 && code <= 90) return String.fromCodePoint(base + code - 65);
			if (code >= 97 && code <= 122) return String.fromCodePoint(base + 26 + code - 97);
			if (style !== "italic" && code >= 48 && code <= 57) {
				return String.fromCodePoint(BOLD_DIGIT_BASE + code - 48);
			}
			return char;
		})
		.join("");
}

const STYLES: { id: TextStyle; label: string }[] = [
	{ id: "bold", label: "Bold" },
	{ id: "italic", label: "Italic" },
	{ id: "bold-italic", label: "Bold Italic" },
];

const PRESETS = [
	{
		label: "Announcement",
		emoji: "📢",
		text: "Announcement: Our latest project is officially live! We are thrilled to share...",
	},
	{
		label: "Achievement",
		emoji: "🎓",
		text: "Achievement: Proud moment! I am honored to share that I have completed...",
	},
	{
		label: "Tip",
		emoji: "💡",
		text: "Pro Tip: Here is a quick hack for scaling your outreach strategy on LinkedIn...",
	},
	{
		label: "Question",
		emoji: "🤔",
		text: "Question for the community: What is your #1 favorite tool for content growth?",
	},
];

export function TextStyler() {
	const id = useId();
	const [input, setInput] = useState("");
	const [style, setStyle] = useState<TextStyle>("bold");
	const output = input ? stylize(input, style) : "";

	return (
		<div className={toolPanel}>
			<fieldset>
				<legend className={toolLabel}>Choose your text format</legend>
				<div className="flex flex-wrap gap-3">
					{STYLES.map((option) => (
						<button
							key={option.id}
							type="button"
							aria-pressed={style === option.id}
							onClick={() => setStyle(option.id)}
							className={cn(
								"rounded-2xl border px-6 py-3 font-bold text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
								style === option.id
									? "border-primary bg-primary text-black"
									: "border-white/10 bg-black/40 text-white/60 hover:border-white/30",
							)}
						>
							{option.label}
						</button>
					))}
				</div>
			</fieldset>

			<fieldset className="mt-8">
				<legend className={toolLabel}>Quick presets</legend>
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					{PRESETS.map((preset) => (
						<button
							key={preset.label}
							type="button"
							onClick={() => setInput(preset.text)}
							className="rounded-2xl border border-white/10 bg-black/40 p-4 text-left transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-primary"
						>
							<span className="flex items-center justify-between font-bold text-sm text-white">
								{preset.label}
								<span aria-hidden="true">{preset.emoji}</span>
							</span>
							<span className="mt-2 line-clamp-2 block text-white/50 text-xs">{preset.text}</span>
						</button>
					))}
				</div>
			</fieldset>

			<div className="mt-8 grid gap-6 lg:grid-cols-2">
				<div>
					<div className="flex items-center justify-between">
						<label htmlFor={`${id}-input`} className={toolLabel}>
							Original text
						</label>
						<span className="mb-2 text-white/40 text-xs">{input.length} characters</span>
					</div>
					<textarea
						id={`${id}-input`}
						value={input}
						onChange={(event) => setInput(event.target.value)}
						rows={8}
						placeholder="Type your LinkedIn post content here..."
						className={`${toolControl} min-h-56 resize-y`}
					/>
				</div>
				<div>
					<label htmlFor={`${id}-output`} className={toolLabel}>
						Formatted text
					</label>
					<textarea
						id={`${id}-output`}
						readOnly
						value={output}
						rows={8}
						aria-live="polite"
						placeholder="Your formatted text will appear here..."
						className={`${toolControl} min-h-56 resize-y text-primary`}
					/>
				</div>
			</div>

			<div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
				<button
					type="button"
					disabled={!output}
					onClick={() => copyToClipboard(output, "Formatted text copied")}
					className={toolButtonSecondary}
				>
					<Copy className="size-4" aria-hidden="true" />
					Copy
				</button>
				<button
					type="button"
					disabled={!output}
					onClick={() => downloadText(output, "socialflyai-formatted.txt")}
					className={toolButtonSecondary}
				>
					<Download className="size-4" aria-hidden="true" />
					Download text
				</button>
				<button
					type="button"
					disabled={!input}
					onClick={() => setInput("")}
					className={toolButtonSecondary}
				>
					Clear
				</button>
				<Link
					href={SIGNUP_URL}
					className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 font-semibold text-primary text-sm hover:underline sm:ml-auto"
				>
					<Share2 className="size-4" aria-hidden="true" />
					Post to 10 social networks
				</Link>
			</div>
		</div>
	);
}
