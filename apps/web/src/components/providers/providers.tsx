"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { TooltipProvider } from "@/components/ui/controls";
import { Toaster } from "@/components/ui/toast";
import { isApiError } from "@/lib/errors";
import { ThemeProvider } from "./theme-provider";

function makeQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 30_000,
				refetchOnWindowFocus: true,
				retry: (count, error) => {
					// 4xx answers will not change on retry.
					if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
					return count < 2;
				},
			},
			mutations: { retry: false },
		},
	});
}

export function Providers({ children }: { children: ReactNode }) {
	const [client] = useState(makeQueryClient);
	return (
		<ThemeProvider>
			<QueryClientProvider client={client}>
				<TooltipProvider delayDuration={250}>{children}</TooltipProvider>
				<Toaster />
			</QueryClientProvider>
		</ThemeProvider>
	);
}
