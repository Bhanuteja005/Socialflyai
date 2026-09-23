import type { Metadata } from "next";
import { AdsSettingsView } from "@/components/app/ads/ads-settings";

export const metadata: Metadata = { title: "Ads settings" };

export default function AdsSettingsPage() {
	return <AdsSettingsView />;
}
