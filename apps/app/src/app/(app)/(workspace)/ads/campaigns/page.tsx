import { redirect } from "next/navigation";

// Campaigns are listed on the Ads overview; keep /ads/campaigns as a stable alias.
export default function CampaignsIndexPage() {
	redirect("/ads");
}
