"use client";

import { TooltipProvider } from "@socialfly/ui/components/controls";
import { Toaster } from "@socialfly/ui/components/toast";
import { ThemeProvider } from "@socialfly/ui/theme-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { isApiError } from "@/lib/errors";

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
