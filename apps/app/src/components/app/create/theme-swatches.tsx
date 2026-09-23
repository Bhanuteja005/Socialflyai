"use client";

import { cn } from "@socialfly/ui/utils";
import { RadioGroup } from "radix-ui";

/**
 * Mirrors CAROUSEL_THEMES in packages/ai/src/render.ts (the renderer is the
 * source of truth; the web app doesn't depend on @socialfly/ai). Only used to
 * draw the swatches, so a drift is cosmetic. Carousels and videos share them.
 */
export const THEMES = [
	{ id: "midnight", label: "Midnight", bg: "#0B1220", fg: "#F8FAFC", accent: "#0BE27D" },
	{ id: "paper", label: "Paper", bg: "#FAF7F2", fg: "#1F2937", accent: "#E4572E" },
	{ id: "ocean", label: "Ocean", bg: "#0E3B5C", fg: "#F1F5F9", accent: "#5EEAD4" },
	{ id: "sunrise", label: "Sunrise", bg: "#FFF4E6", fg: "#3B1F0E", accent: "#F97316" },
] as const;
export type ThemeId = (typeof THEMES)[number]["id"];

/** A radio group of theme previews, drawn in the output's shape (4:5 slide, 9:16 video). */
export function ThemeSwatches({
	value,
	onChange,
	disabled,
	aspect = "slide",
}: {
	value: ThemeId;
	onChange: (theme: ThemeId) => void;
	disabled?: boolean;
	aspect?: "slide" | "video";
}) {
	return (
		<fieldset className="grid gap-1.5" disabled={disabled}>
			<legend className="mb-1.5 font-medium text-sm leading-none">Theme</legend>
			<RadioGroup.Root
				value={value}
				onValueChange={(v) => onChange(v as ThemeId)}
				className="grid grid-cols-4 gap-2"
				aria-label="Theme"
			>
				{THEMES.map((t) => (
					<RadioGroup.Item
						key={t.id}
						value={t.id}
						className="group grid cursor-pointer justify-items-center gap-1 rounded-lg p-1 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
					>
						<span
							aria-hidden="true"
							className={cn(
								"grid w-full content-end gap-1 rounded-md p-1.5 ring-1 ring-border transition group-data-[state=checked]:ring-2 group-data-[state=checked]:ring-primary group-data-[state=checked]:ring-offset-2 group-data-[state=checked]:ring-offset-surface-raised",
								aspect === "video" ? "aspect-[9/16]" : "aspect-[4/5]",
							)}
							style={{ background: t.bg }}
						>
							<span className="h-1 w-3 rounded-full" style={{ background: t.accent }} />
							<span className="h-1.5 w-full rounded-full" style={{ background: t.fg }} />
							<span className="h-1 w-2/3 rounded-full opacity-60" style={{ background: t.fg }} />
						</span>
						<span className="text-[11px] group-data-[state=checked]:font-medium">{t.label}</span>
					</RadioGroup.Item>
				))}
			</RadioGroup.Root>
		</fieldset>
	);
}
