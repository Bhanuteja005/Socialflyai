import type { ReactNode } from "react";
import { AdminGuard } from "@/components/admin-guard";
import { AdminShell } from "@/components/shell/admin-shell";

export default function ConsoleLayout({ children }: { children: ReactNode }) {
	return (
		<AdminGuard>
			<AdminShell>{children}</AdminShell>
		</AdminGuard>
	);
}
