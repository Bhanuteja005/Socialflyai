"use client";

import { X } from "lucide-react";
import { type ClipboardEvent, type KeyboardEvent, useState } from "react";
import { cn } from "@/lib/utils";
import { controlClass } from "./input";

type TagInputProps = {
	id: string;
	value: string[];
	onChange: (value: string[]) => void;
	/** Most tags allowed; the input hides once reached. */
	max?: number;
	maxLength?: number;
	placeholder?: string;
	disabled?: boolean;
	className?: string;
	"aria-describedby"?: string;
	"aria-invalid"?: boolean;
};

/** Free-form tags: Enter or comma adds, Backspace on an empty input removes the last one. */
export function TagInput({
	id,
	value,
	onChange,
	max = 30,
	maxLength = 60,
	placeholder,
	disabled,
	className,
	...aria
}: TagInputProps) {
	const [draft, setDraft] = useState("");
	const full = value.length >= max;

	const add = (raw: string[]) => {
		const next = [...value];
		for (const r of raw) {
			const tag = r.trim().slice(0, maxLength);
			if (!tag || next.length >= max) continue;
			if (next.some((t) => t.toLowerCase() === tag.toLowerCase())) continue;
			next.push(tag);
		}
		if (next.length !== value.length) onChange(next);
	};

	const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter" || e.key === ",") {
			e.preventDefault();
			add([draft]);
			setDraft("");
		} else if (e.key === "Backspace" && !draft && value.length) {
			onChange(value.slice(0, -1));
		}
	};

	const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
		const text = e.clipboardData.getData("text");
		if (!/[,\n]/.test(text)) return;
		e.preventDefault();
		add(text.split(/[,\n]/));
	};

	return (
		<div
			className={cn(
				controlClass,
				"flex min-h-9 flex-wrap items-center gap-1.5 px-2 py-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20",
				disabled && "cursor-not-allowed opacity-60",
				className,
			)}
		>
			{value.length ? (
				<ul className="contents" aria-label="Added">
					{value.map((tag) => (
						<li
							key={tag}
							className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-2 text-xs"
						>
							<span className="truncate">{tag}</span>
							{disabled ? null : (
								<button
									type="button"
									onClick={() => onChange(value.filter((t) => t !== tag))}
									className="inline-flex size-4 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-border hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
									aria-label={`Remove ${tag}`}
								>
									<X className="size-3" aria-hidden="true" />
								</button>
							)}
						</li>
					))}
				</ul>
			) : null}
			{disabled ? null : (
				<input
					id={id}
					disabled={full}
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={onKeyDown}
					onPaste={onPaste}
					onBlur={() => {
						add([draft]);
						setDraft("");
					}}
					maxLength={maxLength}
					placeholder={full ? `Limit of ${max} reached` : value.length ? undefined : placeholder}
					className="h-6 min-w-24 flex-1 bg-transparent px-1 outline-none placeholder:text-subtle-foreground"
					{...aria}
				/>
			)}
			{disabled && value.length === 0 ? (
				<span id={id} className="px-1 text-subtle-foreground">
					None
				</span>
			) : null}
		</div>
	);
}
