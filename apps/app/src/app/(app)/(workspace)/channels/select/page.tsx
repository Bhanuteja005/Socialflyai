import type { Metadata } from "next";
import { Suspense } from "react";
import { SelectAccounts } from "@/components/app/channels/select-accounts";

export const metadata: Metadata = { title: "Choose accounts" };

export default function SelectAccountsPage() {
	return (
		<Suspense>
			<SelectAccounts />
		</Suspense>
	);
}
