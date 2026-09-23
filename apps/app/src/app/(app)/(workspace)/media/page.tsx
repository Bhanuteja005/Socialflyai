import type { Metadata } from "next";
import { MediaView } from "@/components/app/media/media-view";

export const metadata: Metadata = { title: "Media" };

export default function MediaPage() {
	return <MediaView />;
}
