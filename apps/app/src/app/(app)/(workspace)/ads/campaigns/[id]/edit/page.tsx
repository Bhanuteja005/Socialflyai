import type { Metadata } from "next";
import { Suspense } from "react";
import { CampaignWizard } from "@/components/app/ads/wizard/campaign-wizard";

export const metadata: Metadata = { title: "Edit campaign" };

export default async function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	return (
		<Suspense>
			<CampaignWizard campaignId={id} />
		</Suspense>
	);
}
