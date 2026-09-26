import type { ReactNode } from "react";
import { PageHeader } from "@/components/app/page-header";
import { SettingsNav } from "@/components/app/settings/settings-nav";

export default function SettingsLayout({ children }: { children: ReactNode }) {
	return (
		<>
			<PageHeader
				title="Settings"
				description="Manage your organization, team, brand voice and account."
			/>
			<div className="grid items-start gap-6 md:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
				<div className="md:sticky md:top-20">
					<SettingsNav />
				</div>
				<div className="min-w-0 max-w-3xl">{children}</div>
			</div>
		</>
	);
}
