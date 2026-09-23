"use client";

import { Button } from "@socialfly/ui/components/button";
import { Alert, EmptyState, Skeleton } from "@socialfly/ui/components/feedback";
import { AlertTriangle, Eye, Lock } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useChannels, usePost, useProviders } from "@/hooks/queries";
import { isGenerationActive, useGeneration } from "@/hooks/use-ai";
import { errorMessage } from "@/lib/errors";
import { isPostEditable } from "@/lib/status";
import { useOrg } from "../org-provider";
import { Composer } from "./composer";

function ComposerSkeleton() {
	return (
		<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
			<div className="grid gap-6">
				<Skeleton className="h-9 w-48" />
				<Skeleton className="h-28" />
				<Skeleton className="h-72" />
			</div>
			<Skeleton className="h-72" />
		</div>
	);
}

function ReadOnlyNotice() {
	return (
		<EmptyState
			icon={Eye}
			title="You have view-only access"
			description="Ask an admin to make you an editor to create and schedule posts."
			action={
				<Button variant="outline" asChild>
					<Link href="/calendar">Back to calendar</Link>
				</Button>
			}
		/>
	);
}

/**
 * `/compose` accepts a hand-over from the Create page:
 * - `?generation=<id>` attaches the media an AI image/carousel/video generation produced;
 * - `?content=<text>` pre-fills the post text (e.g. a carousel caption).
 * The generation is re-read from the API rather than passed in the URL so the
 * link survives a reload and can't smuggle in media from another organization.
 */
export function NewPostPage() {
	const { can } = useOrg();
	const params = useSearchParams();
	const channels = useChannels();
	const providers = useProviders();
	const generationId = params.get("generation");
	const generation = useGeneration(generationId);
	const content = params.get("content");

	if (!can("editor")) return <ReadOnlyNotice />;
	const waitingForMedia =
		Boolean(generationId) && (generation.isPending || isGenerationActive(generation.data));
	if (channels.isPending || providers.isPending || waitingForMedia) return <ComposerSkeleton />;
	if (channels.isError || providers.isError) {
		return (
			<EmptyState
				title="Couldn't load the composer"
				description={errorMessage(channels.error ?? providers.error)}
				action={
					<Button onClick={() => void Promise.all([channels.refetch(), providers.refetch()])}>
						Retry
					</Button>
				}
			/>
		);
	}
	return (
		<>
			{generationId && generation.isError ? (
				<Alert tone="warning" icon={AlertTriangle} className="mb-4">
					Couldn't attach the generated media: {errorMessage(generation.error)}
				</Alert>
			) : null}
			<Composer
				channels={channels.data}
				providers={providers.data}
				presetDate={params.get("date")}
				prefill={{
					content: content ?? undefined,
					media: generation.data?.status === "succeeded" ? generation.data.media : undefined,
				}}
			/>
		</>
	);
}

export function EditPostPage({ id }: { id: string }) {
	const { can } = useOrg();
	const channels = useChannels();
	const providers = useProviders();
	const post = usePost(id);

	if (!can("editor")) return <ReadOnlyNotice />;
	if (channels.isPending || providers.isPending || post.isPending) return <ComposerSkeleton />;
	if (channels.isError || providers.isError || post.isError) {
		return (
			<EmptyState
				title="Couldn't load this post"
				description={errorMessage(post.error ?? channels.error ?? providers.error)}
				action={
					<Button variant="outline" asChild>
						<Link href="/posts">Back to posts</Link>
					</Button>
				}
			/>
		);
	}
	const locked = !isPostEditable(post.data);
	if (locked) {
		return (
			<EmptyState
				icon={Lock}
				title="This post can't be edited anymore"
				description="It has already been sent to at least one channel. Editing here wouldn't change what's on the platform."
				action={
					<Button variant="outline" asChild>
						<Link href={`/posts/${id}`}>View post</Link>
					</Button>
				}
			/>
		);
	}
	return (
		<Composer
			key={post.data.id}
			channels={channels.data}
			providers={providers.data}
			post={post.data}
		/>
	);
}
