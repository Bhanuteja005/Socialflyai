import type { Metadata } from "next";
import { BrandSettings } from "@/components/app/settings/brand-settings";

export const metadata: Metadata = { title: "Brand voice" };

export default function BrandSettingsPage() {
	return <BrandSettings />;
}
