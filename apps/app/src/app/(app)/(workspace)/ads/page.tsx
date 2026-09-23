import type { Metadata } from "next";
import { Suspense } from "react";
import { AdsOverviewView } from "@/components/app/ads/ads-overview";

export const metadata: Metadata = { title: "Ads" };

export default function AdsPage() {
	return (
		<Suspense>
			<AdsOverviewView />
		</Suspense>
	);
}
