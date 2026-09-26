"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { focusRing } from "./primitives";
import { SITE_THEME_KEY } from "./site-theme";

export function ThemeToggle() {
	const [dark, setDark] = useState(true);

	useEffect(() => {
		setDark(document.documentElement.classList.contains("dark"));
	}, []);

	const toggle = () => {
		const next = !dark;
		document.documentElement.classList.toggle("dark", next);
		document.documentElement.style.colorScheme = next ? "dark" : "light";
		try {
			localStorage.setItem(SITE_THEME_KEY, next ? "dark" : "light");
		} catch {
			// Private mode: the choice lasts for this page only.
		}
		setDark(next);
	};

	return (
		<button
			type="button"
			onClick={toggle}
			aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
			className={`inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${focusRing}`}
		>
			{dark ? (
				<Sun className="size-4" aria-hidden="true" />
			) : (
				<Moon className="size-4" aria-hidden="true" />
			)}
		</button>
	);
}
