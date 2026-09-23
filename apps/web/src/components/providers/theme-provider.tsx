"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

type ThemeContextValue = {
	theme: Theme;
	resolvedTheme: "light" | "dark";
	setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const systemPrefersDark = () =>
	typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;

function apply(theme: Theme): "light" | "dark" {
	const dark = theme === "dark" || (theme === "system" && systemPrefersDark());
	document.documentElement.classList.toggle("dark", dark);
	document.documentElement.style.colorScheme = dark ? "dark" : "light";
	return dark ? "dark" : "light";
}

function readStored(): Theme {
	try {
		const value = localStorage.getItem(THEME_STORAGE_KEY);
		return value === "light" || value === "dark" ? value : "system";
	} catch {
		return "system";
	}
}

export function ThemeProvider({ children }: { children: ReactNode }) {
	const [theme, setThemeState] = useState<Theme>("system");
	const [resolvedTheme, setResolved] = useState<"light" | "dark">("light");

	useEffect(() => {
		const stored = readStored();
		setThemeState(stored);
		setResolved(apply(stored));
	}, []);

	useEffect(() => {
		if (theme !== "system") return;
		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => setResolved(apply("system"));
		media.addEventListener("change", onChange);
		return () => media.removeEventListener("change", onChange);
	}, [theme]);

	const setTheme = useCallback((next: Theme) => {
		try {
			localStorage.setItem(THEME_STORAGE_KEY, next);
		} catch {
			// Private mode: the choice lasts for this page only.
		}
		setThemeState(next);
		setResolved(apply(next));
	}, []);

	return (
		<ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
			{children}
		</ThemeContext.Provider>
	);
}

export function useTheme() {
	const ctx = useContext(ThemeContext);
	if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
	return ctx;
}
