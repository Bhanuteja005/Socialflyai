import type { Metadata } from "next";
import { Suspense } from "react";
import { PublishingView } from "@/components/views/publishing-view";

export const metadata: Metadata = { title: "Publishing" };

export default function Page() {
	// The status filter lives in the URL (useSearchParams), which needs a Suspense boundary.
	return (
		<Suspense>
			<PublishingView />
		</Suspense>
	);
}
