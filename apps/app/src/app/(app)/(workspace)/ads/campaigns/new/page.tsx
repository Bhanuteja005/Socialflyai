import type { Metadata } from "next";
import { Suspense } from "react";
import { CampaignWizard } from "@/components/app/ads/wizard/campaign-wizard";

export const metadata: Metadata = { title: "New campaign" };

export default function NewCampaignPage() {
	return (
		<Suspense>
			<CampaignWizard />
		</Suspense>
	);
}
