import type { Metadata } from "next";
import { AiView } from "@/components/views/ai-view";

export const metadata: Metadata = { title: "AI usage" };

export default function Page() {
	return <AiView />;
}
