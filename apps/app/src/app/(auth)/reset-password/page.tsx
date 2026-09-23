import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/app/auth/recovery-forms";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
	return (
		<Suspense>
			<ResetPasswordForm />
		</Suspense>
	);
}
