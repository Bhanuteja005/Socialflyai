import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyEmail } from "@/components/app/auth/verify-email";

export const metadata: Metadata = { title: "Verify your email" };

export default function VerifyEmailPage() {
	return (
		<Suspense>
			<VerifyEmail />
		</Suspense>
	);
}
