import type { Metadata } from "next";
import { QueuesView } from "@/components/views/queues-view";

export const metadata: Metadata = { title: "Queues" };

export default function Page() {
	return <QueuesView />;
}
