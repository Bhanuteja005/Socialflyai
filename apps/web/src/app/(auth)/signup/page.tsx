import type { Metadata } from "next";
import { Suspense } from "react";
import { SignupForm } from "@/components/app/auth/signup-form";

export const metadata: Metadata = {
	title: "Create your account",
	description: "Create a free SocialFly AI account and start scheduling to every channel.",
	alternates: { canonical: "/signup" },
};

export default function SignupPage() {
	return (
		<Suspense>
			<SignupForm />
		</Suspense>
	);
}
