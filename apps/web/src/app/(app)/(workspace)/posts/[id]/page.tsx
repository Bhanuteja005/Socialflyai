import type { Metadata } from "next";
import { PostDetailView } from "@/components/app/posts/post-detail";

export const metadata: Metadata = { title: "Post" };

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	return <PostDetailView id={id} />;
}
