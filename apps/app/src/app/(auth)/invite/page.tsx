import type { Metadata } from "next";
import { Suspense } from "react";
import { AcceptInvite } from "@/components/app/auth/accept-invite";

export const metadata: Metadata = { title: "Accept invitation" };

export default function InvitePage() {
	return (
		<Suspense>
			<AcceptInvite />
		</Suspense>
	);
}
