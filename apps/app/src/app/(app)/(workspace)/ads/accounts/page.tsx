import type { Metadata } from "next";
import { Suspense } from "react";
import { AdAccountsView } from "@/components/app/ads/accounts-view";

export const metadata: Metadata = { title: "Ad accounts" };

export default function AdAccountsPage() {
	return (
		<Suspense>
			<AdAccountsView />
		</Suspense>
	);
}
