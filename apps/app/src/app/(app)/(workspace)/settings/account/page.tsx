import type { Metadata } from "next";
import { AccountSettings } from "@/components/app/settings/account-settings";

export const metadata: Metadata = { title: "Account settings" };

export default function AccountSettingsPage() {
	return <AccountSettings />;
}
