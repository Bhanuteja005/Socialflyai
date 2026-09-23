import type { Metadata } from "next";
import { Suspense } from "react";
import { OnboardingForm } from "@/components/app/onboarding-form";

export const metadata: Metadata = { title: "Create your organization" };

export default function OnboardingPage() {
	return (
		<Suspense>
			<OnboardingForm />
		</Suspense>
	);
}
