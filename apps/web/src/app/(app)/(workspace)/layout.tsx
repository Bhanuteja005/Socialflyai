import type { ReactNode } from "react";
import { OrgProvider } from "@/components/app/org-provider";
import { AppShell } from "@/components/app/shell/app-shell";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
	return (
		<OrgProvider>
			<AppShell>{children}</AppShell>
		</OrgProvider>
	);
}
