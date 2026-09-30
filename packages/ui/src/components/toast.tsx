"use client";

import { Toaster as Sonner } from "sonner";
import { useOptionalTheme } from "../theme/theme-provider";

export { toast } from "sonner";

type ToasterProps = {
	/**
	 * Fixed theme for surfaces without a ThemeProvider (the always-dark marketing site).
	 * Omit it inside a ThemeProvider to follow the user's light/dark choice.
	 */
	theme?: "light" | "dark" | "system";
};

export function Toaster({ theme }: ToasterProps = {}) {
	const ctx = useOptionalTheme();
	return (
		<Sonner
			theme={theme ?? ctx?.resolvedTheme ?? "system"}
			position="bottom-right"
			closeButton
			toastOptions={{
				classNames: {
					toast:
						"!rounded-2xl !border !border-border !bg-surface-raised !text-foreground !shadow-lg !font-sans",
					description: "!text-muted-foreground",
				},
			}}
		/>
	);
}
