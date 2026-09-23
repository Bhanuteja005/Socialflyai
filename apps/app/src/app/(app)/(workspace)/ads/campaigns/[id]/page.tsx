import type { Metadata } from "next";
import { CampaignDetailView } from "@/components/app/ads/campaign-detail";

export const metadata: Metadata = { title: "Campaign" };

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	return <CampaignDetailView id={id} />;
}
