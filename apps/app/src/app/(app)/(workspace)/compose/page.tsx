import type { Metadata } from "next";
import { Suspense } from "react";
import { NewPostPage } from "@/components/app/composer/composer-page";

export const metadata: Metadata = { title: "Create post" };

export default function ComposePage() {
	return (
		<Suspense>
			<NewPostPage />
		</Suspense>
	);
}
