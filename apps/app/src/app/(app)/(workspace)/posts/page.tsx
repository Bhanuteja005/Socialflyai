import type { Metadata } from "next";
import { Suspense } from "react";
import { PostsView } from "@/components/app/posts/posts-view";

export const metadata: Metadata = { title: "Posts" };

export default function PostsPage() {
	return (
		<Suspense>
			<PostsView />
		</Suspense>
	);
}
