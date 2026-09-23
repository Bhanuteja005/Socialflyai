import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthGuard } from "@/components/app/auth-guard";

export const metadata: Metadata = {
	title: { default: "SocialFly", template: "%s · SocialFly" },
	robots: { index: false, follow: false },
};

export default function AppLayout({ children }: { children: ReactNode }) {
	return <AuthGuard>{children}</AuthGuard>;
}
