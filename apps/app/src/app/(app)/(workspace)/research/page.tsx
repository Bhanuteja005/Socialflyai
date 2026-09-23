import type { Metadata } from "next";
import { Suspense } from "react";
import { ResearchView } from "@/components/app/research/research-view";

export const metadata: Metadata = { title: "Research" };

export default function ResearchPage() {
	return (
		<Suspense>
			<ResearchView />
		</Suspense>
	);
}
