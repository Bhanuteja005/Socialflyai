import type { Metadata } from "next";
import { Suspense } from "react";
import { OAuthCallback } from "@/components/app/auth/oauth-callback";

export const metadata: Metadata = { title: "Signing in" };

export default function OAuthCallbackPage() {
	return (
		<Suspense>
			<OAuthCallback />
		</Suspense>
	);
}
