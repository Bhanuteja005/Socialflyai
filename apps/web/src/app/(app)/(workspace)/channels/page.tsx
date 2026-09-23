import type { Metadata } from "next";
import { Suspense } from "react";
import { ChannelsView } from "@/components/app/channels/channels-view";

export const metadata: Metadata = { title: "Channels" };

export default function ChannelsPage() {
	return (
		<Suspense>
			<ChannelsView />
		</Suspense>
	);
}
