import type { Metadata } from "next";
import { Suspense } from "react";
import { ConnectAdAccounts } from "@/components/app/ads/connect-ad-accounts";

export const metadata: Metadata = { title: "Choose ad accounts" };

export default function ConnectAdAccountsPage() {
	return (
		<Suspense>
			<ConnectAdAccounts />
		</Suspense>
	);
}
