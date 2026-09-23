import type { Metadata } from "next";
import { EditPostPage } from "@/components/app/composer/composer-page";

export const metadata: Metadata = { title: "Edit post" };

export default async function EditPost({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	return <EditPostPage id={id} />;
}
