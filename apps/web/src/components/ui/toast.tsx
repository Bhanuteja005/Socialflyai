"use client";

import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/components/providers/theme-provider";

export { toast } from "sonner";

export function Toaster() {
	const { resolvedTheme } = useTheme();
	return (
		<Sonner
			theme={resolvedTheme}
			position="bottom-right"
			closeButton
			toastOptions={{
				classNames: {
					toast:
						"!rounded-lg !border !border-border !bg-surface-raised !text-foreground !shadow-lg !font-sans",
					description: "!text-muted-foreground",
				},
			}}
		/>
	);
}
