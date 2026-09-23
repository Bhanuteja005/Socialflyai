import type { Metadata } from "next";
import { OrganizationSettings } from "@/components/app/settings/organization-settings";

export const metadata: Metadata = { title: "Organization settings" };

export default function OrganizationSettingsPage() {
	return <OrganizationSettings />;
}
