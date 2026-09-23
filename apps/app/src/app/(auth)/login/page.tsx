import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/app/auth/login-form";

export const metadata: Metadata = {
	title: "Sign in",
	description: "Sign in to SocialFly AI to plan, schedule and publish your social media.",
	alternates: { canonical: "/login" },
};

export default function LoginPage() {
	return (
		<Suspense>
			<LoginForm />
		</Suspense>
	);
}
